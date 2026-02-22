# SIP Guard — Claude Instructions

## Project Overview

SIP Guard is a SIP call scoring and fraud protection service. It scores incoming
calls as GREEN / YELLOW / RED based on call frequency and whitelist/greylist rules,
and exposes both a REST API and a React dashboard for management.

## Architecture

```
/
├── cmd/server/main.go          # Go entry point
├── internal/
│   ├── api/                    # HTTP handlers & routes (Gin)
│   ├── captcha/                # CAPTCHA interface & mock implementation
│   ├── config/                 # Env-based configuration
│   ├── scoring/                # Core scoring engine, whitelist, greylist
│   └── sip/                    # UDP SIP INVITE listener & parser
├── dashboard/                  # React 18 + TypeScript frontend
│   └── src/
│       ├── components/         # UI components
│       ├── api/                # API client & types
│       └── hooks/              # Custom React hooks
├── docs/                       # Auto-generated Swagger spec (do not edit manually)
├── Dockerfile                  # Multi-stage Go build
├── docker-compose.yml          # Redis + SIP Guard services
└── Makefile                    # All common dev tasks
```

## Tech Stack

- **Backend:** Go 1.22+, Gin, go-redis/v9, zerolog, swaggo/swag
- **Frontend:** React 18, TypeScript 5.3, Vite 5.1
- **Storage:** Redis 7 (scoring counters, whitelist, greylist, stats)
- **Infrastructure:** Docker, Docker Compose, ngrok

## Common Commands

```bash
# Backend
make build          # Compile Go binary to bin/sipguard
make run            # Run without building (go run)
make test           # Run all Go tests with race detector
make swagger        # Regenerate Swagger docs (run before committing API changes)
make lint           # Run golangci-lint
make setup          # go mod tidy + download

# Docker
make docker-up      # Build and start all services (Redis + SIP Guard)
make docker-down    # Stop all services
make docker-logs    # Tail SIP Guard container logs

# Frontend (from dashboard/)
npm install         # Install dependencies
npm run dev         # Dev server on http://localhost:3000 (proxies API to :8080)
npm run build       # Production build
```

## Environment Variables

Copy `.env.example` to `.env` before running locally.

| Variable            | Default                    | Description                          |
|---------------------|----------------------------|--------------------------------------|
| `REDIS_URL`         | `redis://localhost:6379`   | Redis connection string              |
| `SIP_PORT`          | `5060`                     | UDP port for SIP INVITE listener     |
| `API_PORT`          | `8080`                     | HTTP REST API port                   |
| `AUDIT_MODE`        | `true`                     | Log decisions without blocking calls |
| `GREEN_THRESHOLD`   | `10`                       | Max calls before YELLOW              |
| `RED_THRESHOLD`     | `50`                       | Max calls before RED                 |
| `LOG_LEVEL`         | `info`                     | zerolog level (debug/info/warn/error)|
| `GIN_MODE`          | `release`                  | Gin mode (debug/release)             |
| `CAPTCHA_DIGIT`     | `5`                        | Digits in CAPTCHA challenge          |
| `CAPTCHA_TIMEOUT_SEC` | `15`                     | CAPTCHA response timeout             |
| `GREYLIST_TTL_SEC`  | `3600`                     | Greylist entry expiry (1 hour)       |

## Scoring Tiers

- **GREEN** — call count ≤ `GREEN_THRESHOLD`: allow
- **YELLOW** — between thresholds: CAPTCHA challenge, add to greylist
- **RED** — call count ≥ `RED_THRESHOLD`: block

## Key Conventions

- All API handlers live in `internal/api/` — add new routes there and annotate with Swagger comments, then run `make swagger`.
- Scoring logic is isolated in `internal/scoring/` — keep Redis interactions contained here.
- The frontend dev server proxies `/api/*` to `localhost:8080` (configured in `dashboard/vite.config.ts`).
- The `docs/` folder is auto-generated — never edit it manually.
- Use `zerolog` for all backend logging (no `fmt.Println` in production paths).
- Run `make test` and `make lint` before committing backend changes.
