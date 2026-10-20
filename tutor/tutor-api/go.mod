module github.com/tsdlmx/tutor-platform/tutor-api

go 1.26.0

// go1.26.9 fixes the standard-library vulnerabilities reported by govulncheck
// (GO-2026-6603, 6607, 6608, 6611, 6612, 6613, 6617 in net/http, net/textproto,
// and crypto/tls). Pinning the toolchain keeps a vulnerable release from being
// used to build the service.
toolchain go1.26.9

require (
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/redis/go-redis/v9 v9.23.0
	golang.org/x/crypto v0.58.0
	golang.org/x/image v0.47.0
	gorm.io/driver/mysql v1.6.0
	gorm.io/driver/postgres v1.6.3
	gorm.io/gorm v1.31.2
)

require (
	filippo.io/edwards25519 v1.1.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.10.0 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	go.uber.org/atomic v1.12.0 // indirect
	golang.org/x/sync v0.24.0 // indirect
	golang.org/x/sys v0.49.0 // indirect
	golang.org/x/text v0.43.0 // indirect
)
