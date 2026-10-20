# Tutor Web API (Go)

Go API for the existing React Web client. It runs beside the legacy Java service so routes can move in small, reviewable slices without changing the UI.

## Current status

- Go `net/http` server, GORM persistence, explicit PostgreSQL migrations, and Redis integration.
- The Web API owns administrator authentication: `GET /captchaImage`, `POST /login`, `GET /getInfo`, and `POST /logout` run in Go. Go signs the HS512 token, keeps the session in Redis under `login_tokens:<id>`, and reloads the account, roles, and menu permissions from PostgreSQL on every authenticated request. The stored session keeps the legacy field names so the online-session view reads the same record without a translation layer.
- Customer Web routes, the read-only miniapp login-state check, and the admin slices are served by Go: scoped system-user and role lists, online-session listing, tutor review/list/detail/delete, customer account lookup/status, post moderation, read-only historical WeChat user lookup, and the operation-log API.
- Still on Java: system-user and role detail/edit, department, menu, dictionary, configuration, notice, post, server and cache monitoring, login-information listing, and the miniapp business APIs. Those React screens still use the legacy `/dev-api` proxy.
- Go records authenticated admin requests in structured service logs. Migrated admin writes and their audit rows commit in one PostgreSQL transaction. The Go operation-log endpoint lists safe imported metadata and Go actions; request bodies, response bodies, and error details are excluded. The React screen remains on Java during the transition so it continues to show actions from Java modules. Switch it only after the final MySQL log snapshot and backend cutover.

## Administrator authentication

- Login requires a username, password, and — unless the snapshotted configuration disables it — a single-use verification code. `GET /captchaImage` returns `{captchaEnabled, uuid, img}`; the image is a data URI.
- Credentials are BCrypt hashes in `sys_user_auth`. The password never enters the general `sys_user` table, session records, or logs.
- Login settings come from `sys_admin_auth_config`, which holds only the snapshotted `sys.account.captchaEnabled` and `sys.login.blackIPList` keys. An unset or unreadable captcha flag keeps the verification code required.
- Sessions live 24 hours, matching the legacy `token.expireTime` of 1440 minutes, and are extended on use once less than 20 minutes remain. `POST /logout` deletes the Redis record, so the token stops working immediately.
- Repeated failed logins are rate limited per client address and username; unknown accounts still run a BCrypt comparison so response time does not reveal which usernames exist.
- `JWT_SECRET` must contain at least 32 bytes. While any admin screen still calls Java, both services must use the same secret and the same Redis instance and logical database so those screens accept the Go-issued token. Once the last Java admin route is migrated the secret no longer has to match.

## Configuration

Set `HTTP_ADDR`, `DATABASE_DSN`, `JWT_SECRET`, `REDIS_ADDR`, and `REDIS_PASSWORD` in the local environment or deployment secret manager. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optionally `SMTP_USERNAME` / `SMTP_PASSWORD` before enabling customer email verification. Set `TRUSTED_PROXY_CIDRS` only to network ranges of reverse proxies you operate; forwarded client-IP headers are ignored otherwise, and the administrator login blacklist, rate limiting, and audit trail use that resolved client address.

`CORS_ALLOWED_ORIGINS` lists the exact browser origins allowed to call the API cross-origin; leaving it empty keeps the API same-origin only, and a wildcard is rejected when `APP_ENV=production`. `TLS_CERT_FILE` and `TLS_KEY_FILE` enable direct TLS termination; leave both empty when a trusted reverse proxy terminates TLS. Startup rejects a documented placeholder `JWT_SECRET` in production, a half-configured TLS pair, and malformed CORS entries.

## Security controls

- Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a no-resource `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy`/`Opener-Policy`, `Permissions-Policy`, `Cache-Control: no-store`, and `X-Request-Id`. HSTS is added only when the process itself serves TLS.
- Request bodies are capped at 1 MiB and oversized requests are rejected with 413 before routing.
- Administrator logins are locked for 15 minutes after 5 credential failures per client address and username; customer logins are locked for 10 minutes after 10 failures. Failure counters are keyed by a digest, so Redis keys never contain an account address or username.
- Authentication events (admin and customer sign-in, sign-up, password reset) are written to `sys_login_audit` with a masked identifier, client address, user agent, result, and a fixed reason code. The audit write never blocks or fails authentication; a write failure is logged as an error for alerting.
- Account status is only disclosed after the password has been verified, so the login response cannot be used to enumerate accounts.

`docs/SECURITY-BASELINE.md` maps the current implementation to the applicable classified-protection controls and lists what the deployment must still supply; `docs/DATA-PRIVACY.md` inventories every stored personal data item, its purpose, retention, and access rule.

## Local development

Use a local PostgreSQL instance and set `DATABASE_DSN`. Apply the reviewed schema migrations first:

```powershell
go run ./cmd/migrate
```

Then start the API:

```powershell
go run ./cmd/server
```

`GET /health/live` checks process liveness. `GET /health/ready` checks PostgreSQL and Redis connectivity. Deployment topology, port allocation during the two-backend transition, least-privilege database grants, and the cutover/rollback steps are documented in `docs/DEPLOYMENT.md`.

## Migrated routes

- Customer Web: authentication, subjects, demands/applications, teacher profile, posts, public tutor directory.
- Administrator authentication: captcha, login, session info, logout.
- Admin: scoped system-user and role lists, online-session list and force logout, tutor review, customer account list/detail/status, user-post list/pending count/review, historical WeChat user list/detail, and operation-log API. Online listing uses monitor:online:list and force logout uses monitor:online:forceLogout; a session can never force itself out. The administrator's own profile (`GET`/`PUT /system/user/profile`, `PUT /system/user/profile/updatePwd`) is self-service: it requires no menu permission, and changing the password ends every other session of that account. WeChat list and detail use system:wxUser:list and system:wxUser:query; operation logs use monitor:operlog:list. The public miniapp checkLogin route reads the shared session and returns the existing isLogin/userId data shape.

The React clients use `/web-api` for customer Web, `/admin-api` for administrator authentication and migrated admin APIs, and `/dev-api` for every module still on Java. Vite proxies all three. The operation-log Go route is ready, but its React wrapper remains on `/dev-api` until the final MySQL log snapshot and backend cutover. Production reverse proxies must route the two migrated prefixes to Go and retain `/dev-api` on Java until each remaining module is ported.

## Database and migration

GORM is used for application persistence. Schema changes are explicit SQL files in `internal/database/migrations/`; production startup never calls `AutoMigrate`. Migrations 000003_admin_authorization.sql through 000009_admin_login_config.sql create the legacy RBAC snapshot, remove the admin password column from the general PostgreSQL user table, add the historical WeChat user view, store safe operation-log metadata, add the department data-scope tables, create a dedicated administrator credential table, and snapshot the administrator login settings. Migration 000010_login_audit.sql adds the authentication audit trail. The importer excludes oper_param, json_result, and error_msg from sys_oper_log; Go stores only allowlisted action metadata in action_meta. Administrator hashes are mapped from MySQL `sys_user.password` into PostgreSQL `sys_user_auth.password_hash`; they never enter the general `sys_user` model/table or importer logs.

Customer and administrator session state is rebuilt in Go: customer sessions live in PostgreSQL and must sign in again after cutover, while administrator sessions live in shared Redis so a session ended in one service is refused by the other.

## Preserving legacy MySQL data

The importer reads customer Web tables, the public tutor directory, admin authorization and credential data, safe sys_oper_log metadata, the minimum department hierarchy and role-department mappings, the administrator login settings, plus historical WeChat users, from MySQL, then writes allowlisted columns to empty PostgreSQL tables. It validates administrator hashes as BCrypt and maps them only into `sys_user_auth.password_hash`; hashes are not printed. Apply existing customer schema patches first, including the tutor subject-name and post-audit columns. Use a read-only account for `LEGACY_MYSQL_DSN`; set `DATABASE_DSN` to the PostgreSQL database after applying migrations. Run the one-time import against a frozen legacy write source at cutover; the importer is a snapshot into empty tables, not a live synchronization tool.

```powershell
# Read-only preflight; no destination rows are written.
go run ./cmd/import-legacy

# Explicitly import only after reviewing counts and confirming every target table is empty.
go run ./cmd/import-legacy --apply
```

Write mode uses one PostgreSQL transaction across all imported tables and aborts if any destination table is non-empty, required source columns are missing, or customer emails collide ignoring case. It preserves matching values and primary keys, then resets identity sequences. It never modifies MySQL. No database was connected or imported as part of these code changes.
