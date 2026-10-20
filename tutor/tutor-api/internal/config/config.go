package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	HTTPAddr          string
	DatabaseDSN       string
	Environment       string
	JWTSecret         string
	RedisAddr         string
	RedisPassword     string
	TrustedProxyCIDRs string
	SMTPHost          string
	SMTPPort          string
	SMTPUsername      string
	SMTPPassword      string
	SMTPFrom          string
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:          strings.TrimSpace(os.Getenv("HTTP_ADDR")),
		DatabaseDSN:       strings.TrimSpace(os.Getenv("DATABASE_DSN")),
		Environment:       strings.TrimSpace(os.Getenv("APP_ENV")),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		RedisAddr:         strings.TrimSpace(os.Getenv("REDIS_ADDR")),
		RedisPassword:     os.Getenv("REDIS_PASSWORD"),
		TrustedProxyCIDRs: strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDRS")),
		SMTPHost:          strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPPort:          strings.TrimSpace(os.Getenv("SMTP_PORT")),
		SMTPUsername:      strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		SMTPPassword:      os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:          strings.TrimSpace(os.Getenv("SMTP_FROM")),
	}
	if cfg.HTTPAddr == "" {
		cfg.HTTPAddr = "127.0.0.1:12501"
	}
	if cfg.Environment == "" {
		cfg.Environment = "development"
	}
	if cfg.RedisAddr == "" {
		cfg.RedisAddr = "127.0.0.1:6379"
	}
	if cfg.DatabaseDSN == "" {
		return Config{}, errors.New("DATABASE_DSN is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, errors.New("JWT_SECRET must contain at least 32 bytes")
	}
	if (cfg.SMTPHost == "") != (cfg.SMTPPort == "") || (cfg.SMTPHost == "") != (cfg.SMTPFrom == "") {
		return Config{}, errors.New("SMTP_HOST, SMTP_PORT, and SMTP_FROM must be configured together")
	}
	if (cfg.SMTPUsername == "") != (cfg.SMTPPassword == "") {
		return Config{}, errors.New("SMTP_USERNAME and SMTP_PASSWORD must be configured together")
	}
	if strings.ContainsAny(cfg.HTTPAddr, "\r\n") {
		return Config{}, fmt.Errorf("HTTP_ADDR contains invalid characters")
	}
	return cfg, nil
}
