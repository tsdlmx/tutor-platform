package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Login auditing and failed-attempt lockout back the audit and identity
// verification controls: every authentication attempt is recorded, repeated
// failures temporarily lock the (client address, account) pair, and a successful
// sign-in clears the counter.
const (
	loginAuditTable    = "sys_login_audit"
	auditActorAdmin    = "admin"
	auditActorCustomer = "customer"
	auditResultSuccess = "success"
	auditResultFailure = "failure"

	reasonInvalidRequest   = "invalid_request"
	reasonCaptchaExpired   = "captcha_expired"
	reasonCaptchaInvalid   = "captcha_invalid"
	reasonInvalidCreds     = "invalid_credentials"
	reasonAccountDisabled  = "account_disabled"
	reasonAccountDeleted   = "account_deleted"
	reasonBlacklisted      = "blacklisted"
	reasonLocked           = "locked"
	reasonRateLimited      = "rate_limited"
	reasonPasswordReset    = "password_reset"
	reasonAccountCreated   = "account_created"
	loginAuditMaxUserAgent = 255
)

type loginAuditEntry struct {
	ActorType  string
	Identifier string
	ClientIP   string
	UserAgent  string
	Result     string
	Reason     string
}

// recordLoginAudit stores a privacy-minimised audit row. The identifier is
// masked before it reaches this function and the client is never sent a reason
// that would confirm whether an account exists.
func (s *Service) recordLoginAudit(ctx context.Context, entry loginAuditEntry) {
	userAgent := strings.TrimSpace(entry.UserAgent)
	if len(userAgent) > loginAuditMaxUserAgent {
		userAgent = userAgent[:loginAuditMaxUserAgent]
	}
	row := map[string]any{
		"actor_type": entry.ActorType,
		"identifier": entry.Identifier,
		"client_ip":  entry.ClientIP,
		"user_agent": userAgent,
		"result":     entry.Result,
		"reason":     entry.Reason,
	}
	// Auditing must never break authentication. A write failure is recorded as a
	// bounded log line so the deployment can alert on it.
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	if err := s.db.WithContext(writeCtx).Table(loginAuditTable).Create(row).Error; err != nil {
		s.logger.Error("login audit write failed", "actor_type", entry.ActorType, "result", entry.Result, "error_type", fmt.Sprintf("%T", err))
	}
}

// maskEmail keeps the domain, which is enough to recognise a tenant or domain
// block without storing the full address in an audit trail.
func maskEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return "***"
	}
	local, domain := email[:at], email[at:]
	switch {
	case len(local) == 1:
		return "*" + domain
	case len(local) == 2:
		return local[:1] + "*" + domain
	default:
		return local[:1] + "***" + domain
	}
}

// maskIdentifier keeps a short, non-reversible prefix for operator recognition.
func maskIdentifier(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "***"
	}
	if strings.Contains(value, "@") {
		return maskEmail(value)
	}
	if len([]rune(value)) <= 3 {
		return string([]rune(value)[:1]) + "***"
	}
	return string([]rune(value)[:3]) + "***"
}

func loginFailureKey(category, subject string) string {
	return "web:v1:login-fail:" + category + ":" + digestKey(subject)
}

// loginLocked reports whether the (client address, account) pair exhausted its
// allowed failures.
func (s *Service) loginLocked(ctx context.Context, category, subject string, threshold int64) (bool, error) {
	count, err := s.redis.Get(ctx, loginFailureKey(category, subject)).Int64()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return false, nil
		}
		return false, fmt.Errorf("read login failure counter: %w", err)
	}
	return count >= threshold, nil
}

// recordLoginFailure increments the failure counter and starts the lock window.
func (s *Service) recordLoginFailure(ctx context.Context, category, subject string, window time.Duration) error {
	key := loginFailureKey(category, subject)
	count, err := s.redis.Incr(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("increment login failure counter: %w", err)
	}
	if count == 1 {
		if err := s.redis.Expire(ctx, key, window).Err(); err != nil {
			return fmt.Errorf("set login failure window: %w", err)
		}
	}
	return nil
}

func (s *Service) clearLoginFailures(ctx context.Context, category, subject string) {
	_ = s.redis.Del(ctx, loginFailureKey(category, subject)).Err()
}
