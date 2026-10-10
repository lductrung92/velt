# velt — backend (Go)

Authentication + RBAC foundation. Stack: Go 1.23+, chi, pgx/pgxpool on
PostgreSQL, goose migrations, `log/slog`. See [`docs/ai/backend-go.md`](../docs/ai/backend-go.md).

## Layout

```
cmd/api/            HTTP entrypoint (wiring only) + `migrate` subcommand
cmd/createadmin/    CLI to provision the first super_admin
internal/
  config/           typed env config (caarlos0/env)
  apperr/           AppError + error-envelope contract
  httpx/            router middleware, validation, JSON/error helpers, auth
  platform/         crypto (argon2id, AES-GCM, sha256), token (JWT), ratelimit, mail (+ SMTP tester), db
  platform/totp/    shared TOTP: verify (replay-safe), secret/QR, recovery codes
  platform/storage/ file storage interface + local-disk driver (path-safe)
  modules/auth/     login, 2FA, refresh+reuse-detection, logout, me, forgot/reset
  modules/account/  self-service: profile, avatar, change-password, 2FA enroll/disable
  modules/admin/    manage other users + RBAC: user CRUD, roles, permissions, sessions
  modules/settings/ registry-driven key-value config, Redis read-through cache, secret encryption, SMTP test
  modules/files/    serve stored files (GET /api/files/*)
migrations/         goose SQL (embedded into the binary)
```

## Setup

1. Copy env and fill in your database:
   ```bash
   cp .env.example .env   # then edit DATABASE_URL (JWT_SECRET/ENCRYPTION_KEY pre-generated in .env)
   ```
2. Apply migrations (also runs automatically on server start):
   ```bash
   go run ./cmd/api migrate
   ```
3. Create the first super admin:
   ```bash
   go run ./cmd/createadmin -email you@example.com -name "You" -password "<min 12 chars>"
   ```
4. (Optional) Seed dev test users:
   ```bash
   go run ./cmd/seeder            # 6 fixtures + 20 bulk editors (idempotent)
   go run ./cmd/seeder -count 100 # more
   go run ./cmd/seeder -reset     # wipe prior seed users (@seed.local) and reseed
   ```
   All seed accounts use the domain `@seed.local` (password `seed-password-123`) and
   cover every role/status; `-reset` only ever touches those accounts.
5. Run the API:
   ```bash
   go run ./cmd/api
   # GET http://localhost:8080/healthz
   ```

`.env` is loaded automatically in dev (real environment variables override it).

## Endpoints (`/api/auth`)

`POST /login` · `POST /2fa/verify` · `POST /refresh` · `POST /logout` ·
`POST /logout-all` (Bearer) · `GET /me` (Bearer) · `POST /forgot-password` ·
`POST /reset-password`. Errors follow [`docs/ai/error-contract.md`](../docs/ai/error-contract.md).

## Endpoints (`/api/settings`)

`GET /api/settings` (`settings.read`) · `PUT /api/settings` (`settings.manage`) ·
`GET /api/public/settings` (no auth, public keys only) ·
`POST /api/settings/email/test` (`settings.manage`). Keys/types/defaults come
from the code registry ([`internal/modules/settings/registry.go`](internal/modules/settings/registry.go));
secrets are write-only (masked to `is_set`). Contract:
[`docs/apis/openapi/settings.yaml`](../docs/apis/openapi/settings.yaml).

## Endpoints (`/api/account`) — self-service (Bearer)

`GET/PATCH /api/account/profile` · `POST/DELETE /api/account/avatar` ·
`POST /api/account/change-password` · `POST /api/account/2fa/{setup,enable,disable,recovery-codes}`.
Files are served at `GET /api/files/*`. Contract:
[`docs/apis/openapi/account.yaml`](../docs/apis/openapi/account.yaml).

## Endpoints (`/api/admin`) — manage others + RBAC (Bearer + permission)

Users `GET/POST /users`, `GET/PATCH/DELETE /users/{id}`, `POST/DELETE /users/{id}/roles[/{role_id}]`,
`POST /users/{id}/reset-password`, `GET/DELETE /users/{id}/sessions` · Roles
`GET/POST /roles`, `GET/PATCH/DELETE /roles/{id}`, `GET /roles/{id}/members`,
`PUT /roles/{id}/permissions` · `GET /permissions` · `GET /sessions`, `DELETE /sessions/{id}`.
Anti-escalation + self-protection enforced server-side. Contract:
[`docs/apis/openapi/admin.yaml`](../docs/apis/openapi/admin.yaml).

## Tests

```bash
go test ./...                                   # unit tests (no DB needed)
TEST_DATABASE_URL=postgres://... go test ./...  # + repository integration tests
```

Integration tests run migrations on the target DB and insert rows — point
`TEST_DATABASE_URL` at a throwaway database, never one with real data.

## Quality gates

```bash
gofmt -l . && go vet ./... && go build ./...
```
