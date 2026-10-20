# ADR 0002: Native Go administrator authentication

- Status: Accepted
- Date: 2026-10-20
- Supersedes: the "validate the Java-issued JWT" compatibility step described in ADR 0001

## Context

ADR 0001 kept the Java service as the administrator login issuer during the transition: Go verified a Java-signed HS512 token, required the matching Redis session, and then reloaded roles and permissions from PostgreSQL. That kept the first admin slices reachable, but it left the Web API unable to authenticate anyone on its own, kept the two services coupled to one signing secret and one Redis database, and made the login screen depend on the service being replaced.

The rewrite is now expected to move to a Go-owned backend rather than preserve byte-level compatibility with the Java API. Compatibility shims therefore cost more than they save, except where the React client itself defines the contract.

## Decision

- Go issues and validates its own administrator token. It owns `GET /captchaImage`, `POST /login`, `GET /getInfo`, and `POST /logout`.
- The token is HS512 with claims `login_user_key` (session identifier) and `sub` (username), plus issued-at and expiry.
- The session lives in Redis under `login_tokens:<id>` with a 24-hour TTL that matches the legacy `token.expireTime`, and is extended on use once less than 20 minutes remain.
- Authorization is never taken from the token alone: each authenticated request reloads the enabled account, its roles, and its menu permissions from PostgreSQL, so a disabled account or a removed role applies immediately.
- The stored session keeps the legacy JSON field names. This is deliberate and cheap: the online-session listing already reads those names, and any screen still served by Java continues to read the same record.
- Response bodies use the project envelope `{code, msg, data}`. The React client was updated for the authentication calls instead of keeping flat-response fallbacks.
- Credentials stay BCrypt in `sys_user_auth`. Login settings are snapshotted into `sys_admin_auth_config`; anything unset keeps the stricter default, so a missing configuration never disables the verification code.

## Consequences

- The administrator login screen and the migrated admin slices work with Go alone. Java is no longer needed to sign in.
- `JWT_SECRET` and the Redis instance only have to match Java while a Java-served admin screen still has to accept the Go token.
- The React client lost its per-call response-shape fallbacks for login and session info; AuthProvider now depends on a single documented envelope.
- Any administrator session issued by Java before this change keeps working, because the token format and Redis key did not change. Sessions are not migrated between services; they simply coexist until Java is retired.
- Administrator login auditing currently goes to structured service logs. The legacy `sys_logininfor` table has no PostgreSQL equivalent yet, so populating the login-information screen requires a later migration.
- Failed-login lockout is a per-address and per-username rate limit rather than the legacy per-account counter; the stricter account-lockout policy can be added with the login-information slice.
