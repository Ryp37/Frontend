# SIP Guard

Production-ready Go backend service for SIP call scoring and fraud protection. Scores inbound calls against Redis-backed frequency counters, exposes a REST API, and listens for real SIP INVITE packets over UDP.

---

## Tech Stack

- **Go 1.22+** with [Gin](https://github.com/gin-gonic/gin)
- **Redis** (go-redis/v9) — scoring counters, whitelist, stats
- **Docker + docker-compose** — local development
- **Swagger/OpenAPI** — auto-generated via swaggo/swag
- **zerolog** — structured JSON logging

---

## Quick Start

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env` as needed.

### 2. Run with Docker Compose

```bash
docker-compose up --build
```

API: http://localhost:8080
Swagger UI: http://localhost:8080/swagger/index.html

### 3. Run locally (requires Redis)

```bash
make setup        # go mod tidy + download
make swagger      # generate docs (requires swag CLI)
make run
```

---

## Configuration

| Variable              | Default                   | Description                              |
|-----------------------|---------------------------|------------------------------------------|
| `REDIS_URL`           | `redis://localhost:6379`  | Redis connection string                  |
| `API_PORT`            | `8080`                    | HTTP server port                         |
| `SIP_PORT`            | `5060`                    | UDP SIP listener port                    |
| `AUDIT_MODE`          | `true`                    | Log but never block when true            |
| `GREEN_THRESHOLD`     | `10`                      | Score below this = GREEN                 |
| `RED_THRESHOLD`       | `50`                      | Score above this = RED                   |
| `LOG_LEVEL`           | `info`                    | zerolog level (debug/info/warn/error)    |
| `GIN_MODE`            | `release`                 | Gin mode (debug/release)                 |
| `CAPTCHA_DIGIT`       | `5`                       | DTMF digit caller must press to pass     |
| `CAPTCHA_TIMEOUT_SEC` | `15`                      | Seconds to wait for CAPTCHA response     |
| `GREYLIST_TTL_SEC`    | `3600`                    | Greylist entry TTL in seconds (1 hour)   |

---

## REST API

### POST /api/v1/check

Score a call attempt.

```bash
curl -X POST http://localhost:8080/api/v1/check \
  -H "Content-Type: application/json" \
  -d '{"caller_id": "+46701234567", "destination": "+46891234567"}'
```

Response:
```json
{
  "status": "GREEN",
  "score": 3,
  "reason": "caller +46701234567 has low call frequency (score: 3)",
  "timestamp": "2024-01-15T10:30:00Z",
  "blocked": false
}
```

---

### GET /api/v1/stats

Get aggregate call counters per status.

```bash
curl http://localhost:8080/api/v1/stats
```

Response:
```json
{
  "GREEN": 142,
  "YELLOW": 18,
  "RED": 4
}
```

---

### GET /api/v1/whitelist

List all whitelist entries.

```bash
curl http://localhost:8080/api/v1/whitelist
```

Response:
```json
[
  {
    "prefix": "+467",
    "label": "Swedish mobile",
    "tier": "GREEN"
  }
]
```

---

### POST /api/v1/whitelist

Add a prefix to the whitelist. Supported tiers: `GREEN`, `YELLOW`, `RED`, `TELCO`, `CLOUD`.

| Tier    | Resolves to | Description                                      |
|---------|-------------|--------------------------------------------------|
| GREEN   | GREEN       | Standard pass-through                            |
| YELLOW  | YELLOW      | Warn and monitor                                 |
| RED     | RED         | Block (unless AUDIT_MODE)                        |
| TELCO   | GREEN       | Legitimate carrier / roaming — always allowed    |
| CLOUD   | RED         | VPS/cloud provider range — always blocked        |

```bash
# Swedish mobile carrier prefix (TELCO → always GREEN)
curl -X POST http://localhost:8080/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{"prefix": "+46", "label": "Swedish numbers", "tier": "TELCO"}'

# Known cloud ASN range (CLOUD → always RED, placeholder for real ranges)
curl -X POST http://localhost:8080/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{"prefix": "+1800", "label": "US cloud ASN placeholder", "tier": "CLOUD"}'

# Standard GREEN entry
curl -X POST http://localhost:8080/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{"prefix": "+467", "label": "Swedish mobile", "tier": "GREEN"}'
```

Response (201):
```json
{
  "prefix": "+467",
  "label": "Swedish mobile",
  "tier": "GREEN"
}
```

---

### DELETE /api/v1/whitelist/:prefix

Remove a prefix from the whitelist.

```bash
# URL-encode the prefix if it contains special characters
curl -X DELETE "http://localhost:8080/api/v1/whitelist/%2B467"
```

Response:
```json
{
  "message": "prefix removed from whitelist"
}
```

---

### GET /api/v1/greylist

List all YELLOW-tier callers currently in the greylist, with time-to-live remaining.

```bash
curl http://localhost:8080/api/v1/greylist
```

Response:
```json
[
  {
    "caller_id": "+46701234567",
    "ttl_remaining_seconds": 3241,
    "added_at": "2024-01-15T10:30:00Z"
  }
]
```

---

### DELETE /api/v1/greylist/:id

Manually remove a caller from the greylist before TTL expiry.

```bash
curl -X DELETE "http://localhost:8080/api/v1/greylist/%2B46701234567"
```

Response:
```json
{
  "message": "caller removed from greylist"
}
```

---

### GET /health

Liveness probe.

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "time": "2024-01-15T10:30:00Z"
}
```

---

### GET /swagger/*

Swagger UI — available at http://localhost:8080/swagger/index.html

---

## Scoring Logic

| Score Range          | Status   | Behavior                                              |
|----------------------|----------|-------------------------------------------------------|
| `< GREEN_THRESHOLD`  | GREEN    | Pass through                                          |
| `GREEN` to `RED`     | YELLOW   | Pass through, auto-added to greylist for 1 hour       |
| `> RED_THRESHOLD`    | RED      | CAPTCHA challenge sent, then block (unless AUDIT_MODE)|

- Redis key: `score:{caller_id}` — TTL 24 hours
- Each call to `/api/v1/check` or a SIP INVITE increments the counter atomically
- Whitelist entries short-circuit scoring; the matched tier is returned directly
- `AUDIT_MODE=true` means RED calls log the CAPTCHA attempt but are never blocked
- YELLOW callers are automatically added to the greylist (Redis key: `greylist:{caller_id}`, TTL: `GREYLIST_TTL_SEC`)
- TELCO tier resolves to GREEN; CLOUD tier resolves to RED regardless of score

## Audio CAPTCHA (Stub)

When a RED call is received over SIP and `AUDIT_MODE=false`:

1. A `183 Session Progress` response is sent with "Press {CAPTCHA_DIGIT} to continue"
2. The `MockCAPTCHA` logs `CAPTCHA sent to {caller_id}`
3. Since no real DTMF can be received in the stub, verification always results in `CAPTCHA_FAIL`
4. A `603 Decline` is sent

The `CAPTCHAChallenge` interface allows swapping `MockCAPTCHA` for a real implementation:

```go
type CAPTCHAChallenge interface {
    Send() bool
    Verify(input string) bool
}
```

## Greylist

YELLOW-tier callers are auto-greylisted on every scored call. The greylist uses Redis keys with automatic TTL expiry — no cron or cleanup job required.

- Key pattern: `greylist:{caller_id}`
- TTL: `GREYLIST_TTL_SEC` (default 3600 = 1 hour)
- Manual removal available via `DELETE /api/v1/greylist/:id`

---

## SIP Listener

The service binds a UDP socket on `SIP_PORT` (default 5060) in a background goroutine.

**Supported message type:** `INVITE`

- Extracts `From:` header → caller ID
- Extracts `To:` header → destination
- Forwards to scoring engine
- Responds with `SIP/2.0 200 OK` (pass) or `SIP/2.0 603 Decline` (block)

Test with a raw SIP INVITE:
```bash
echo -e "INVITE sip:+46891234567@example.com SIP/2.0\r\nVia: SIP/2.0/UDP 127.0.0.1:5061\r\nFrom: <sip:+46701234567@example.com>;tag=abc\r\nTo: <sip:+46891234567@example.com>\r\nCall-ID: test@127.0.0.1\r\nCSeq: 1 INVITE\r\nContent-Length: 0\r\n\r\n" \
  | nc -u localhost 5060
```

---

## Testing

```bash
make test
```

Unit tests (no Redis required):
- Scoring classification: thresholds, boundary conditions, audit mode
- CAPTCHA: Send/Verify pass/fail, interface compliance, multiple digit configs

Integration tests (Redis required, DB 15, auto-cleanup):
- Whitelist: Add/Match with longest-prefix selection, invalid tier rejection
- Greylist: Add, Remove, IsGreylisted, List with TTL, auto-expiry at 1-second TTL

---

## Generate Swagger Docs

```bash
make swagger
```

This installs `swag` if not present and regenerates `./docs/` from handler annotations.

---

## ngrok

A pre-configured `ngrok.yml` is included in the project root:

```yaml
version: "2"
tunnels:
  sip:
    proto: tcp
    addr: 5060
  api:
    proto: http
    addr: 8080
```

Start both tunnels at once:
```bash
ngrok start --all --config ngrok.yml
```

Or individually:
```bash
ngrok http 8080        # API + Swagger UI
ngrok tcp 5060         # SIP UDP listener
```

---

## Project Structure

```
.
├── cmd/server/main.go              # Entry point, graceful shutdown
├── internal/
│   ├── api/
│   │   ├── handlers.go             # Gin handlers with Swagger annotations
│   │   └── routes.go               # Route registration, request logger
│   ├── captcha/
│   │   ├── captcha.go              # CAPTCHAChallenge interface + MockCAPTCHA
│   │   └── captcha_test.go         # Unit tests
│   ├── config/config.go            # Env-based configuration
│   ├── scoring/
│   │   ├── engine.go               # Scoring engine, tier mapping, stats
│   │   ├── whitelist.go            # Redis Hash-backed prefix whitelist
│   │   ├── greylist.go             # Redis SET-backed greylist with TTL
│   │   ├── engine_test.go          # Scoring unit + whitelist integration tests
│   │   └── greylist_test.go        # Greylist unit + integration tests
│   └── sip/parser.go               # UDP SIP INVITE listener, parser, CAPTCHA hook
├── docs/docs.go                    # Swagger spec (regenerate with make swagger)
├── ngrok.yml                       # ngrok tunnel config (api + sip)
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── .env.example
```
