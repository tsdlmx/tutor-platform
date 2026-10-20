package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/database"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		logger.Error("configuration rejected", "reason", "DATABASE_DSN is required")
		os.Exit(1)
	}
	db, err := database.Open(dsn)
	if err != nil {
		logger.Error("database connection failed", "error_type", "database")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	versions, err := database.ApplyMigrations(ctx, db)
	if err != nil {
		logger.Error("database migration failed", "error", err)
		os.Exit(1)
	}
	logger.Info("database migrations applied", "count", len(versions), "versions", versions)
}
