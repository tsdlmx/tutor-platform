package database

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"

	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

const migrationLockKey int64 = 0x5455544f52

var migrationNamePattern = regexp.MustCompile(`^([0-9]{6})_[a-z0-9_]+\.sql$`)

func ApplyMigrations(ctx context.Context, db *gorm.DB) ([]string, error) {
	files, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return nil, fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(files)
	applied := make([]string, 0, len(files))
	err = db.WithContext(ctx).Connection(func(conn *gorm.DB) error {
		if err := conn.Exec("SELECT pg_advisory_lock(?)", migrationLockKey).Error; err != nil {
			return fmt.Errorf("acquire migration lock: %w", err)
		}
		if err := conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
version VARCHAR(32) PRIMARY KEY,
name VARCHAR(255) NOT NULL,
checksum CHAR(64) NOT NULL,
applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
)`).Error; err != nil {
			_ = conn.Exec("SELECT pg_advisory_unlock(?)", migrationLockKey).Error
			return fmt.Errorf("create migration ledger: %w", err)
		}

		var migrationErr error
		for _, filename := range files {
			name := path.Base(filename)
			match := migrationNamePattern.FindStringSubmatch(name)
			if len(match) != 2 {
				migrationErr = fmt.Errorf("invalid migration filename %q", name)
				break
			}
			version := match[1]
			source, readErr := migrationFiles.ReadFile(filename)
			if readErr != nil {
				migrationErr = fmt.Errorf("read migration %s: %w", name, readErr)
				break
			}
			digest := sha256.Sum256(source)
			checksum := hex.EncodeToString(digest[:])
			newlyApplied := false
			migrationErr = conn.Transaction(func(tx *gorm.DB) error {
				var existing struct{ Checksum string }
				lookup := tx.Table("schema_migrations").Select("checksum").Where("version = ?", version).Take(&existing)
				if lookup.Error == nil {
					if existing.Checksum != checksum {
						return fmt.Errorf("migration %s checksum differs from the applied file", version)
					}
					return nil
				}
				if !errors.Is(lookup.Error, gorm.ErrRecordNotFound) {
					return fmt.Errorf("read migration ledger for %s: %w", version, lookup.Error)
				}
				if err := tx.Exec(string(source)).Error; err != nil {
					return fmt.Errorf("apply migration %s: %w", name, err)
				}
				if err := tx.Exec("INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)", version, name, checksum).Error; err != nil {
					return fmt.Errorf("record migration %s: %w", name, err)
				}
				newlyApplied = true
				return nil
			})
			if migrationErr != nil {
				break
			}
			if newlyApplied {
				applied = append(applied, name)
			}
		}
		unlockErr := conn.Exec("SELECT pg_advisory_unlock(?)", migrationLockKey).Error
		if migrationErr != nil {
			return migrationErr
		}
		if unlockErr != nil {
			return fmt.Errorf("release migration lock: %w", unlockErr)
		}
		return nil
	})
	if err != nil {
		return applied, err
	}
	return applied, nil
}
