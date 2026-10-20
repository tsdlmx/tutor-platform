package config

import (
	"errors"
	"fmt"
	"net/url"
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
	CORSOrigins       string
	TLSCertFile       string
	TLSKeyFile        string
	// PrivacyPolicyVersion identifies the privacy policy and user agreement a
	// customer consents to when registering. It is recorded with the consent.
	PrivacyPolicyVersion string
	SMTPHost             string
	SMTPPort             string
	SMTPUsername         string
	SMTPPassword         string
	SMTPFrom             string
}

// ConsentPolicyVersion returns the version recorded with a registration consent.
func (c Config) ConsentPolicyVersion() string {
	if version := strings.TrimSpace(c.PrivacyPolicyVersion); version != "" {
		return version
	}
	// Only reachable outside production: Load rejects an empty version there.
	return "unset"
}

func (c Config) Production() bool {
	return strings.EqualFold(strings.TrimSpace(c.Environment), "production")
}

// AllowedOrigins returns the exact browser origins permitted to call this API
// cross-origin. An empty result means the API only serves same-origin requests.
func (c Config) AllowedOrigins() []string {
	origins := make([]string, 0, 4)
	for _, value := range strings.Split(c.CORSOrigins, ",") {
		value = strings.TrimSpace(value)
		if value != "" {
			origins = append(origins, value)
		}
	}
	return origins
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:             strings.TrimSpace(os.Getenv("HTTP_ADDR")),
		DatabaseDSN:          strings.TrimSpace(os.Getenv("DATABASE_DSN")),
		Environment:          strings.TrimSpace(os.Getenv("APP_ENV")),
		JWTSecret:            os.Getenv("JWT_SECRET"),
		RedisAddr:            strings.TrimSpace(os.Getenv("REDIS_ADDR")),
		RedisPassword:        os.Getenv("REDIS_PASSWORD"),
		TrustedProxyCIDRs:    strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDRS")),
		CORSOrigins:          strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")),
		TLSCertFile:          strings.TrimSpace(os.Getenv("TLS_CERT_FILE")),
		TLSKeyFile:           strings.TrimSpace(os.Getenv("TLS_KEY_FILE")),
		PrivacyPolicyVersion: strings.TrimSpace(os.Getenv("PRIVACY_POLICY_VERSION")),
		SMTPHost:             strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPPort:             strings.TrimSpace(os.Getenv("SMTP_PORT")),
		SMTPUsername:         strings.TrimSpace(os.Getenv("SMTP_USERNAME")),
		SMTPPassword:         os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:             strings.TrimSpace(os.Getenv("SMTP_FROM")),
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
	if cfg.Production() && isPlaceholderSecret(cfg.JWTSecret) {
		return Config{}, errors.New("JWT_SECRET still holds the documented placeholder value")
	}
	if (cfg.TLSCertFile == "") != (cfg.TLSKeyFile == "") {
		return Config{}, errors.New("TLS_CERT_FILE and TLS_KEY_FILE must be configured together")
	}
	if err := validateOrigins(cfg.AllowedOrigins(), cfg.Production()); err != nil {
		return Config{}, err
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
	if cfg.Production() && strings.TrimSpace(cfg.PrivacyPolicyVersion) == "" {
		return Config{}, errors.New("PRIVACY_POLICY_VERSION is required in production so registration consent can be recorded")
	}
	if cfg.Production() && len(cfg.PrivacyPolicyVersion) > 32 {
		return Config{}, errors.New("PRIVACY_POLICY_VERSION must not exceed 32 characters")
	}
	if strings.ContainsAny(cfg.TrustedProxyCIDRs, "\r\n") || strings.ContainsAny(cfg.CORSOrigins, "\r\n") {
		return Config{}, errors.New("network configuration contains invalid characters")
	}
	return cfg, nil
}

// isPlaceholderSecret rejects the values shipped in documentation so a copied
// template cannot reach production.
func isPlaceholderSecret(secret string) bool {
	switch strings.ToLower(strings.TrimSpace(secret)) {
	case "", "replace-with-at-least-32-random-bytes", "changeme", "change-me":
		return true
	}
	return false
}

// validateOrigins accepts only scheme://host[:port] entries. A wildcard is
// rejected in production because it cannot be combined with bearer-token access.
func validateOrigins(origins []string, production bool) error {
	for _, origin := range origins {
		if origin == "*" {
			if production {
				return errors.New("CORS_ALLOWED_ORIGINS must not contain a wildcard in production")
			}
			continue
		}
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS entry %q must be scheme://host[:port]", origin)
		}
		if parsed.Path != "" && parsed.Path != "/" {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS entry %q must not contain a path", origin)
		}
		if parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS entry %q must not contain credentials, a query, or a fragment", origin)
		}
	}
	return nil
}
