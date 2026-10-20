# ADR 0001: Web-first backend rewrite with Go and GORM

- Status: Accepted
- Date: 2026-10-20

## Context

The existing Web client is React, TypeScript, and Vite. Its customer and admin screens already encode the required routes and interaction patterns. The existing Java backend serves those screens and a separate uni-app client. The first rewrite release targets the Web client; the miniapp remains on the existing service until a later migration.

Existing MySQL data must be retained and migrated. The repository explicitly excludes `tutor/sql/tutor.sql` because it contains business data, so schema discovery and migration design must use domain classes, mapper XML, safe schema patches, and a later controlled schema-only/data migration process.

## Decision

- Keep the current React/TypeScript/Vite Web UI and preserve its routes and visual behavior.
- Build a Go modular monolith for the new Web API, using Go's `net/http` router and GORM with the PostgreSQL driver for persistence.
- Use PostgreSQL as the new service's authoritative database. Keep legacy MySQL intact until migrated row counts and business behavior have been reconciled.
- Keep Redis for short-lived state such as verification codes, rate limits, and revocable sessions where needed.
- Maintain endpoint/response compatibility with the existing Web API during the migration where practical, so pages do not need a simultaneous visual rewrite.
- Create explicit, versioned PostgreSQL migrations. Do not run GORM `AutoMigrate` at application startup or against production data.
- Preserve the old Java backend and MySQL during the transition. The miniapp is out of scope for this release.

## Consequences

- Backend behavior can move module by module while the Web UI remains stable.
- The new Go service and old Java service can coexist during validation, but route ownership and deployment cutover must be explicit to prevent split writes.
- A dedicated MySQL-to-PostgreSQL migration tool/process is required; GORM models alone are not a data migration plan.
- Admin APIs are a larger compatibility surface than customer APIs and will be ported in separate slices after the shared API envelope and customer flows.
- Schema changes require reviewed SQL migrations and rollback/recovery plans; ORM startup will not silently change production schema.

## Initial module boundaries

- `identity`: customer and admin authentication, authorization, sessions.
- `profiles`: teacher/student customer profiles.
- `demands`: student demands and teacher applications.
- `community`: user posts and moderation.
- `admin`: account management, audits, and remaining system management screens.
- `platform`: configuration, database, HTTP middleware, logging, and health probes.

The initial implementation starts with the server foundation and customer Web flows. Existing admin screens remain served by the old API until their endpoints are migrated.

## Migration and safety constraints

- Never copy, inspect, or commit the ignored business dump `tutor/sql/tutor.sql`.
- Do not perform a production cutover in the first implementation slice.
- Migrate from an approved database export with a dry run, table/row counts, constraint checks, and sampled business-level comparisons before writes are switched.
- Credentials and signing keys come from environment/deployment secrets and are never committed.
