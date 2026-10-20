package identity

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/config"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	roleTeacher = "TEACHER"
	roleStudent = "STUDENT"
	codeTTL     = 5 * time.Minute
	sessionTTL  = 24 * time.Hour

	customerLoginLockThreshold = 10
	customerLoginLockWindow    = 10 * time.Minute
)

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

type Service struct {
	db                *gorm.DB
	redis             *redis.Client
	secret            []byte
	cfg               config.Config
	logger            *slog.Logger
	dummyPasswordHash []byte
}

type TokenClaims struct {
	AccountID uint64 `json:"accountId"`
	Kind      string `json:"kind"`
	UUID      string `json:"uuid"`
	jwt.RegisteredClaims
}

type Session struct {
	Account    web.CustomerAccount
	SessionKey string
}

type AuthPayload struct {
	Token   string              `json:"token"`
	Account web.CustomerAccount `json:"account"`
}

var rateLimitScript = redis.NewScript(`
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return value
`)

var verifyCodeScript = redis.NewScript(`
local saved = redis.call('GET', KEYS[1])
if not saved then return -1 end
local tries = tonumber(redis.call('GET', KEYS[2]) or '0')
local maxTries = tonumber(ARGV[2])
if tries >= maxTries then
  redis.call('DEL', KEYS[1], KEYS[2])
  return -2
end
if saved ~= ARGV[1] then
  local nextTry = redis.call('INCR', KEYS[2])
  if nextTry == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
  if nextTry >= maxTries then redis.call('DEL', KEYS[1], KEYS[2]) end
  return 0
end
redis.call('DEL', KEYS[1], KEYS[2])
return 1
`)

func New(db *gorm.DB, redisClient *redis.Client, secret []byte, cfg config.Config, logger *slog.Logger) *Service {
	dummyHash, _ := bcrypt.GenerateFromPassword([]byte("constant-time customer login check"), bcrypt.DefaultCost)
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{db: db, redis: redisClient, secret: secret, cfg: cfg, logger: logger, dummyPasswordHash: dummyHash}
}

func (s *Service) SendCode(ctx context.Context, rawEmail, clientIP, purpose string) (map[string]any, error) {
	email := normalizeEmail(rawEmail)
	if !validEmail(email) {
		return nil, businessError(400, "邮箱格式不正确")
	}
	if purpose != "register" && purpose != "reset" {
		return nil, businessError(400, "验证码用途不合法")
	}
	if err := s.rateLimit(ctx, "email-code-ip-minute", clientIP, 15, time.Minute); err != nil {
		return nil, err
	}
	if err := s.rateLimit(ctx, "email-code-ip-hour", clientIP, 100, time.Hour); err != nil {
		return nil, err
	}

	if purpose == "reset" {
		var count int64
		if err := s.db.WithContext(ctx).Model(&web.CustomerAccount{}).Where("lower(email) = ?", email).Count(&count).Error; err != nil {
			return nil, fmt.Errorf("lookup account for reset code: %w", err)
		}
		if count == 0 {
			return map[string]any{"sent": true, "expiresIn": int(codeTTL.Seconds()), "resendAfter": 60}, nil
		}
	}

	emailKey := digestKey(email)
	cooldownKey := "web:v1:email-code:cooldown:" + purpose + ":" + emailKey
	claimed, err := s.redis.SetNX(ctx, cooldownKey, "1", time.Minute).Result()
	if err != nil {
		return nil, fmt.Errorf("reserve email-code cooldown: %w", err)
	}
	if !claimed {
		return nil, businessError(429, "验证码已发送，请稍后再试")
	}
	if err := s.rateLimit(ctx, "email-code-hour", purpose+":"+emailKey, 10, time.Hour); err != nil {
		return nil, err
	}

	code, err := randomCode()
	if err != nil {
		_ = s.redis.Del(ctx, cooldownKey).Err()
		return nil, fmt.Errorf("generate email code: %w", err)
	}
	if err := s.sendEmailCode(ctx, email, code); err != nil {
		_ = s.redis.Del(ctx, cooldownKey).Err()
		return nil, businessError(503, "验证码发送失败，请稍后重试")
	}

	codeKey := "web:v1:email-code:" + purpose + ":" + emailKey
	triesKey := codeKey + ":tries"
	if err := s.redis.Set(ctx, codeKey, s.codeDigest(email, purpose, code), codeTTL).Err(); err != nil {
		return nil, fmt.Errorf("save email-code state: %w", err)
	}
	if err := s.redis.Del(ctx, triesKey).Err(); err != nil {
		return nil, fmt.Errorf("clear email-code attempts: %w", err)
	}
	return map[string]any{"sent": true, "expiresIn": int(codeTTL.Seconds()), "resendAfter": 60}, nil
}

func (s *Service) Register(ctx context.Context, email, password, nickname, code, clientIP string) (AuthPayload, error) {
	if err := s.rateLimit(ctx, "register", clientIP, 20, time.Hour); err != nil {
		return AuthPayload{}, err
	}
	email = normalizeEmail(email)
	if !validEmail(email) {
		return AuthPayload{}, businessError(400, "邮箱格式不正确")
	}
	if err := validatePassword(password); err != nil {
		return AuthPayload{}, err
	}
	var existing web.CustomerAccount
	if err := s.db.WithContext(ctx).Where("lower(email) = ?", email).First(&existing).Error; err == nil {
		return AuthPayload{}, businessError(409, "该邮箱已被注册")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return AuthPayload{}, fmt.Errorf("find customer account: %w", err)
	}
	if err := s.verifyCode(ctx, email, "register", code); err != nil {
		return AuthPayload{}, err
	}

	hash, err := bcrypt.GenerateFromPassword(bcryptInput(password), bcrypt.DefaultCost)
	if err != nil {
		return AuthPayload{}, fmt.Errorf("hash customer password: %w", err)
	}
	cleanNickname := strings.TrimSpace(nickname)
	if cleanNickname == "" {
		cleanNickname = strings.SplitN(email, "@", 2)[0]
	}
	if utf8.RuneCountInString(cleanNickname) > 64 {
		return AuthPayload{}, businessError(400, "昵称不能超过 64 个字符")
	}
	account := web.CustomerAccount{Email: email, PasswordHash: string(hash), Nickname: stringPointer(cleanNickname), Status: "0"}
	if err := s.db.WithContext(ctx).Create(&account).Error; err != nil {
		return AuthPayload{}, fmt.Errorf("create customer account: %w", err)
	}
	s.recordLoginAudit(ctx, loginAuditEntry{
		ActorType:  auditActorCustomer,
		Identifier: maskIdentifier(email),
		ClientIP:   clientIP,
		Result:     auditResultSuccess,
		Reason:     reasonAccountCreated,
	})
	return s.issueSession(ctx, account)
}

func (s *Service) Login(ctx context.Context, email, password, clientIP, userAgent string) (AuthPayload, error) {
	email = normalizeEmail(email)
	lockSubject := clientIP + "|" + email
	audit := func(result, reason string) {
		s.recordLoginAudit(ctx, loginAuditEntry{
			ActorType:  auditActorCustomer,
			Identifier: maskIdentifier(email),
			ClientIP:   clientIP,
			UserAgent:  userAgent,
			Result:     result,
			Reason:     reason,
		})
	}
	rejectCredential := func(reason string) (AuthPayload, error) {
		audit(auditResultFailure, reason)
		if err := s.recordLoginFailure(ctx, "customer", lockSubject, customerLoginLockWindow); err != nil {
			s.logger.Error("customer lockout counter failed", "error_type", fmt.Sprintf("%T", err))
		}
		return AuthPayload{}, businessError(400, "邮箱或密码错误")
	}
	if err := s.rateLimit(ctx, "login", clientIP+":"+digestKey(email), 20, 10*time.Minute); err != nil {
		audit(auditResultFailure, reasonRateLimited)
		return AuthPayload{}, err
	}
	locked, err := s.loginLocked(ctx, "customer", lockSubject, customerLoginLockThreshold)
	if err != nil {
		return AuthPayload{}, err
	}
	if locked {
		audit(auditResultFailure, reasonLocked)
		return AuthPayload{}, businessError(429, "登录失败次数过多，请稍后再试")
	}
	var account web.CustomerAccount
	err = s.db.WithContext(ctx).Where("lower(email) = ?", email).First(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = bcrypt.CompareHashAndPassword(s.dummyPasswordHash, bcryptInput(password))
		return rejectCredential(reasonInvalidCreds)
	}
	if err != nil {
		return AuthPayload{}, fmt.Errorf("find customer account for login: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), bcryptInput(password)) != nil {
		return rejectCredential(reasonInvalidCreds)
	}
	if account.Status == "1" {
		audit(auditResultFailure, reasonAccountDisabled)
		return AuthPayload{}, businessError(403, "该账号已被停用")
	}
	now := time.Now().UTC()
	account.LastLoginAt = &now
	if err := s.db.WithContext(ctx).Model(&account).UpdateColumn("last_login_time", now).Error; err != nil {
		return AuthPayload{}, fmt.Errorf("update customer last login: %w", err)
	}
	payload, err := s.issueSession(ctx, account)
	if err != nil {
		return AuthPayload{}, err
	}
	s.clearLoginFailures(ctx, "customer", lockSubject)
	audit(auditResultSuccess, "")
	return payload, nil
}

func (s *Service) ResetPassword(ctx context.Context, email, code, password, clientIP string) error {
	email = normalizeEmail(email)
	if !validEmail(email) {
		return businessError(400, "邮箱格式不正确")
	}
	if err := validatePassword(password); err != nil {
		return err
	}
	if err := s.rateLimit(ctx, "reset-password", clientIP+":"+digestKey(email), 10, 10*time.Minute); err != nil {
		return err
	}
	if err := s.verifyCode(ctx, email, "reset", code); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword(bcryptInput(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash customer password: %w", err)
	}
	now := time.Now().UTC()
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var account web.CustomerAccount
		if err := tx.Select("account_id").Where("lower(email) = ?", email).First(&account).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return businessError(400, "该邮箱还没有注册账号")
			}
			return err
		}
		if err := tx.Model(&account).Update("password", string(hash)).Error; err != nil {
			return err
		}
		if err := tx.Model(&web.CustomerSession{}).Where("account_id = ? AND revoked_at IS NULL", account.AccountID).Update("revoked_at", now).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return err
	}
	s.recordLoginAudit(ctx, loginAuditEntry{
		ActorType:  auditActorCustomer,
		Identifier: maskIdentifier(email),
		ClientIP:   clientIP,
		Result:     auditResultSuccess,
		Reason:     reasonPasswordReset,
	})
	return nil
}

func (s *Service) SetRole(ctx context.Context, accountID uint64, role string) (web.CustomerAccount, error) {
	if role != roleTeacher && role != roleStudent {
		return web.CustomerAccount{}, businessError(400, "身份只能是 TEACHER 或 STUDENT")
	}
	var account web.CustomerAccount
	if err := s.db.WithContext(ctx).First(&account, "account_id = ?", accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return web.CustomerAccount{}, businessError(404, "账号不存在")
		}
		return web.CustomerAccount{}, fmt.Errorf("load customer account: %w", err)
	}
	if account.Role != nil && *account.Role != "" {
		if *account.Role == role {
			return account, nil
		}
		return web.CustomerAccount{}, businessError(400, "身份已确定，不支持切换")
	}
	result := s.db.WithContext(ctx).Model(&web.CustomerAccount{}).Where("account_id = ? AND role IS NULL", accountID).Update("role", role)
	if result.Error != nil {
		return web.CustomerAccount{}, fmt.Errorf("set customer role: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		if err := s.db.WithContext(ctx).First(&account, "account_id = ?", accountID).Error; err != nil {
			return web.CustomerAccount{}, businessError(404, "账号不存在")
		}
		if account.Role != nil && *account.Role == role {
			return account, nil
		}
		return web.CustomerAccount{}, businessError(400, "身份已确定，不支持切换")
	}
	account.Role = stringPointer(role)
	return account, nil
}

func (s *Service) Authenticate(ctx context.Context, rawToken string) (*Session, error) {
	claims := &TokenClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS512 {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	}, jwt.WithValidMethods([]string{"HS512"}))
	if err != nil || !token.Valid || claims.Kind != "customer" || claims.AccountID == 0 || claims.UUID == "" {
		return nil, businessError(401, "未登录或登录已过期")
	}
	var session web.CustomerSession
	if err := s.db.WithContext(ctx).Where("session_key = ? AND account_id = ? AND revoked_at IS NULL AND expires_at > ?", claims.UUID, claims.AccountID, time.Now().UTC()).First(&session).Error; err != nil {
		return nil, businessError(401, "未登录或登录已过期")
	}
	var account web.CustomerAccount
	if err := s.db.WithContext(ctx).First(&account, "account_id = ?", claims.AccountID).Error; err != nil || account.Status != "0" {
		return nil, businessError(401, "未登录或登录已过期")
	}
	return &Session{Account: account, SessionKey: claims.UUID}, nil
}

func (s *Service) Logout(ctx context.Context, sessionKey string) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&web.CustomerSession{}).
		Where("session_key = ? AND revoked_at IS NULL", sessionKey).
		Update("revoked_at", now).Error
}

func (s *Service) SendResetCode(ctx context.Context, email, clientIP string) (map[string]any, error) {
	return s.SendCode(ctx, email, clientIP, "reset")
}

func (s *Service) issueSession(ctx context.Context, account web.CustomerAccount) (AuthPayload, error) {
	sessionKey, err := randomHex(16)
	if err != nil {
		return AuthPayload{}, fmt.Errorf("create session id: %w", err)
	}
	now := time.Now().UTC()
	expiresAt := now.Add(sessionTTL)
	session := web.CustomerSession{SessionKey: sessionKey, AccountID: account.AccountID, ExpiresAt: expiresAt, CreatedAt: now}
	if err := s.db.WithContext(ctx).Create(&session).Error; err != nil {
		return AuthPayload{}, fmt.Errorf("create customer session: %w", err)
	}
	claims := TokenClaims{
		AccountID: account.AccountID,
		Kind:      "customer",
		UUID:      sessionKey,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   account.Email,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(s.secret)
	if err != nil {
		_ = s.db.WithContext(ctx).Delete(&session).Error
		return AuthPayload{}, fmt.Errorf("sign customer token: %w", err)
	}
	account.PasswordHash = ""
	return AuthPayload{Token: token, Account: account}, nil
}

func (s *Service) verifyCode(ctx context.Context, email, purpose, code string) error {
	if strings.TrimSpace(code) == "" {
		return businessError(400, "请填写邮箱验证码")
	}
	key := "web:v1:email-code:" + purpose + ":" + digestKey(email)
	result, err := verifyCodeScript.Run(ctx, s.redis, []string{key, key + ":tries"}, s.codeDigest(email, purpose, strings.TrimSpace(code)), 5, int(codeTTL.Seconds())).Int()
	if err != nil {
		return fmt.Errorf("verify email code: %w", err)
	}
	switch result {
	case 1:
		return nil
	case -1:
		return businessError(400, "验证码已过期，请重新获取")
	case -2:
		return businessError(400, "验证码错误次数过多，请重新获取")
	default:
		return businessError(400, "验证码不正确")
	}
}

func (s *Service) rateLimit(ctx context.Context, category, subject string, maximum int64, window time.Duration) error {
	key := "web:v1:rate:" + category + ":" + digestKey(subject)
	count, err := rateLimitScript.Run(ctx, s.redis, []string{key}, int(window.Seconds())).Int64()
	if err != nil {
		return fmt.Errorf("check request limit: %w", err)
	}
	if count > maximum {
		return businessError(429, "请求过于频繁，请稍后重试")
	}
	return nil
}

func (s *Service) sendEmailCode(ctx context.Context, recipient, code string) error {
	if s.cfg.SMTPHost == "" {
		return errors.New("SMTP is not configured")
	}
	from, err := mail.ParseAddress(s.cfg.SMTPFrom)
	if err != nil {
		return errors.New("SMTP_FROM is invalid")
	}
	address := net.JoinHostPort(s.cfg.SMTPHost, s.cfg.SMTPPort)
	dialer := net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	client, err := smtp.NewClient(conn, s.cfg.SMTPHost)
	if err != nil {
		return err
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); !ok {
		return errors.New("SMTP server does not offer STARTTLS")
	}
	if err := client.StartTLS(&tls.Config{ServerName: s.cfg.SMTPHost, MinVersion: tls.VersionTLS12}); err != nil {
		return err
	}
	if s.cfg.SMTPUsername != "" {
		if err := client.Auth(smtp.PlainAuth("", s.cfg.SMTPUsername, s.cfg.SMTPPassword, s.cfg.SMTPHost)); err != nil {
			return err
		}
	}
	if err := client.Mail(from.Address); err != nil {
		return err
	}
	if err := client.Rcpt(recipient); err != nil {
		return err
	}
	body, err := client.Data()
	if err != nil {
		return err
	}
	message := "From: " + from.String() + "\r\n" +
		"To: " + recipient + "\r\n" +
		"Subject: Tutor Platform email verification\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		"Your verification code is " + code + ". It expires in 5 minutes.\r\n"
	if _, err := fmt.Fprint(body, message); err != nil {
		_ = body.Close()
		return err
	}
	if err := body.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func (s *Service) codeDigest(email, purpose, code string) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = fmt.Fprintf(mac, "%s\x00%s\x00%s", purpose, email, code)
	return hex.EncodeToString(mac.Sum(nil))
}

func randomCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func randomHex(n int) (string, error) {
	value := make([]byte, n)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func validEmail(email string) bool {
	if len(email) > 128 || strings.Count(email, "@") != 1 {
		return false
	}
	address, err := mail.ParseAddress(email)
	return err == nil && address.Address == email && strings.Contains(strings.SplitN(email, "@", 2)[1], ".")
}

func validatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if length < 6 || length > 32 {
		return businessError(400, "密码长度需在 6-32 个字符之间")
	}
	return nil
}

// Existing Java accounts use BCrypt. Truncating at the historical 72-byte
// BCrypt boundary keeps login compatibility for passwords with multibyte text.
func bcryptInput(password string) []byte {
	value := []byte(password)
	if len(value) > 72 {
		value = value[:72]
	}
	return value
}

func digestKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func stringPointer(value string) *string { return &value }

func businessError(status int, message string) error { return &Error{Status: status, Message: message} }
