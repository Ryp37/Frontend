# SIP Guard — Claude Instructions

## Project Overview

SIP Guard is a SIP call scoring and fraud protection service. It classifies
incoming calls as GREEN / YELLOW / RED based on call frequency and
whitelist/greylist rules, using Redis for state. It exposes a REST API and a
React dashboard for management and monitoring.

---

## Architecture

```
/
├── cmd/server/main.go              # Entry point: Redis, Gin, SIP listener, graceful shutdown
├── internal/
│   ├── api/
│   │   ├── handlers.go             # HTTP handlers (Check, Stats, Whitelist, Greylist, Health)
│   │   └── routes.go               # Gin route registration + request logger middleware
│   ├── captcha/
│   │   └── captcha.go              # CAPTCHAChallenge interface + MockCAPTCHA implementation
│   ├── config/
│   │   └── config.go               # Env-based config loading with defaults
│   ├── scoring/
│   │   ├── engine.go               # Core scoring logic (Check, classify, GetStats)
│   │   ├── whitelist.go            # Prefix whitelist (Redis hash, longest-prefix match)
│   │   └── greylist.go             # Temporary greylist (Redis keys with TTL, SCAN-based list)
│   └── sip/
│       └── parser.go               # UDP SIP INVITE listener, parser, response builder
├── dashboard/                      # React 18 + TypeScript frontend
│   └── src/
│       ├── api/
│       │   ├── client.ts           # Fetch-based HTTP client for all API endpoints
│       │   └── types.ts            # TypeScript types (Stats, CheckResult, WhitelistEntry, etc.)
│       ├── components/
│       │   ├── Header.tsx          # Sticky nav: branding + API health indicator + Swagger link
│       │   ├── StatsCards.tsx      # 4-card stats display with flash animation (GREEN/YELLOW/RED/TOTAL)
│       │   ├── StatusBadge.tsx     # Reusable colored badge for call status
│       │   ├── CallCheckPanel.tsx  # Manual call tester with scrollable log (up to 60 entries)
│       │   ├── WhitelistPanel.tsx  # Add/delete/list whitelist entries
│       │   └── GreylistPanel.tsx   # Live TTL countdown for greylisted callers
│       ├── hooks/
│       │   └── usePolling.ts       # Generic polling hook (immediate + interval)
│       ├── App.tsx                 # Root layout: Header + StatsCards + 3-column panel grid
│       └── main.tsx                # React entry point (StrictMode)
├── docs/                           # Auto-generated Swagger spec — never edit manually
├── Dockerfile                      # Multi-stage build: golang:1.22-alpine → scratch
├── docker-compose.yml              # Redis 7 + SIP Guard services with health checks
├── Makefile                        # All common tasks (see below)
├── .env.example                    # All 11 environment variables with defaults
└── go.mod                          # Go 1.22, module: sipguard
```

---

## Tech Stack

- **Backend:** Go 1.22, Gin, go-redis/v9, zerolog, swaggo/swag, godotenv
- **Frontend:** React 18.2, TypeScript 5.3, Vite 5.1 (no CSS framework — inline styles + CSS variables)
- **Storage:** Redis 7 (scoring counters, whitelist hash, greylist keys, stats counters)
- **Infrastructure:** Docker, Docker Compose (multi-stage scratch image), ngrok

---

## Common Commands

```bash
# Backend
make build          # go build → bin/sipguard (stripped, static)
make run            # go run cmd/server/main.go
make test           # go test -v -race ./...
make swagger        # Regenerate docs/ from Swagger annotations (run after API changes)
make lint           # golangci-lint run ./...
make setup          # go mod tidy + download

# Docker
make docker-up      # docker-compose up --build -d
make docker-down    # docker-compose down
make docker-logs    # docker-compose logs -f sipguard

# Frontend (from dashboard/)
npm install
npm run dev         # Dev server on http://localhost:3000 (proxies /api/* and /health to :8080)
npm run build       # tsc + vite build → dist/
npm run preview     # Preview production build
```

---

## Environment Variables

Copy `.env.example` to `.env` before running locally.

| Variable              | Default                  | Description                                    |
|-----------------------|--------------------------|------------------------------------------------|
| `REDIS_URL`           | `redis://localhost:6379` | Redis connection string                        |
| `SIP_PORT`            | `5060`                   | UDP port for SIP INVITE listener               |
| `API_PORT`            | `8080`                   | HTTP REST API port                             |
| `AUDIT_MODE`          | `true`                   | Log decisions without actually blocking calls  |
| `GREEN_THRESHOLD`     | `10`                     | Score < threshold → GREEN                      |
| `RED_THRESHOLD`       | `50`                     | Score > threshold → RED                        |
| `LOG_LEVEL`           | `info`                   | zerolog level (debug/info/warn/error)          |
| `GIN_MODE`            | `release`                | Gin mode (debug/release)                       |
| `CAPTCHA_DIGIT`       | `5`                      | Digit to press for CAPTCHA challenge           |
| `CAPTCHA_TIMEOUT_SEC` | `15`                     | CAPTCHA timeout (currently unused in code)     |
| `GREYLIST_TTL_SEC`    | `3600`                   | Greylist auto-expiry in seconds (1 hour)       |

---

## REST API Endpoints

| Method   | Path                          | Description                              |
|----------|-------------------------------|------------------------------------------|
| `GET`    | `/health`                     | Liveness probe → `{status, time}`        |
| `POST`   | `/api/v1/check`               | Score a call → `{status, score, reason, timestamp, blocked}` |
| `GET`    | `/api/v1/stats`               | Call counts → `{GREEN, YELLOW, RED}`     |
| `GET`    | `/api/v1/whitelist`           | List all whitelist entries               |
| `POST`   | `/api/v1/whitelist`           | Add entry `{prefix, label, tier}`        |
| `DELETE` | `/api/v1/whitelist/:prefix`   | Remove entry by prefix (URL-encoded)     |
| `GET`    | `/api/v1/greylist`            | List active greylist entries with TTL    |
| `DELETE` | `/api/v1/greylist/:id`        | Manually remove caller from greylist     |
| `GET`    | `/swagger/*any`               | Swagger UI                               |

---

## Scoring Logic (internal/scoring/engine.go)

1. Check whitelist (longest-prefix match on callerID)
2. If match → convert tier to status (`TELCO` → GREEN, `CLOUD` → RED, others direct)
3. If no match → increment `score:{callerID}` counter in Redis (24-hour TTL)
4. Classify: `score < GREEN_THRESHOLD` → GREEN, between thresholds → YELLOW, `score > RED_THRESHOLD` → RED
5. YELLOW → auto-add to greylist (`greylist:{callerID}` key, TTL = `GREYLIST_TTL_SEC`)
6. Increment `stats:{STATUS}` counter in Redis
7. `Blocked = (status == RED) && !AuditMode`

**Redis Key Schema:**
| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `score:{callerID}` | String (int) | 24h | Call frequency counter |
| `stats:{GREEN\|YELLOW\|RED}` | String (int) | None | Lifetime stats counters |
| `whitelist` | Hash | None | All whitelist entries (field = prefix, value = JSON) |
| `greylist:{callerID}` | String (timestamp) | `GREYLIST_TTL_SEC` | Auto-expiring greylist |

---

## Whitelist Tiers

| Tier | Resolves To | Use Case |
|------|-------------|----------|
| `GREEN` | GREEN | Trusted caller |
| `YELLOW` | YELLOW | Monitored caller |
| `RED` | RED | Blocked caller |
| `TELCO` | GREEN | Telecom carrier |
| `CLOUD` | RED | VPS/cloud provider |

---

## SIP Flow (internal/sip/parser.go)

1. UDP packet arrives on `:5060`
2. Check first line starts with `INVITE`
3. Parse `From:` and `To:` headers via regex (handles `sip:` and `tel:` prefixes)
4. Call `engine.Check()`
5. If blocked: send SIP 183 Session Progress (CAPTCHA prompt) then 603 Decline
6. If allowed: send SIP 200 OK
7. All responses built from request headers (Via, Call-ID, CSeq, From, To)

**Note:** CAPTCHA is currently a mock (`MockCAPTCHA` in `internal/captcha/captcha.go`). It logs to stdout but does not perform real DTMF verification. The `CAPTCHAChallenge` interface is the extension point for a real implementation.

---

## Frontend Polling Intervals (dashboard/src/)

| Component | Data | Interval |
|-----------|------|----------|
| `Header.tsx` | Health check | 15s |
| `StatsCards.tsx` | Stats (GREEN/YELLOW/RED) | 5s |
| `WhitelistPanel.tsx` | Whitelist entries | 30s |
| `GreylistPanel.tsx` | Greylist entries | 15s |
| `GreylistPanel.tsx` | TTL countdown (client-side) | 1s |

`usePolling` hook (`hooks/usePolling.ts`) handles all polling — calls `fn()` immediately on mount, then every `intervalMs`. Use this hook for any new polling needs.

---

## Key Conventions

- **No `fmt.Println` in production paths** — use `zerolog` for all backend logging.
- **`docs/` is auto-generated** — run `make swagger` after any API handler annotation change; never edit manually.
- **New API routes** go in `internal/api/routes.go`; handlers in `internal/api/handlers.go`; add Swagger annotations then run `make swagger`.
- **Scoring/Redis logic** stays inside `internal/scoring/` — do not access Redis directly from handlers.
- **Frontend uses inline styles + CSS variables** (no Tailwind, no CSS modules). Follow the existing pattern in components.
- **`CallCheckPanel` log** caps at 60 entries — newest at top.
- **`AuditMode = true` by default** — calls are never actually blocked in the default config. Set `AUDIT_MODE=false` to enable real blocking.
- Run `make test` and `make lint` before committing backend changes.
