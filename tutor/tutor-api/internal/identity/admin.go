package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Administrator authentication is owned by this service. It issues its own HS512
// token, keeps the session in Redis, and reloads the account, roles, and menu
// permissions from PostgreSQL on every request so revocations apply immediately.
const (
	adminSessionKeyPrefix    = "login_tokens:"
	adminCaptchaKeyPrefix    = "captcha_codes:"
	adminSessionTTL          = 24 * time.Hour
	adminSessionRefreshAfter = 20 * time.Minute
	adminCaptchaTTL          = 2 * time.Minute
	adminLoginWindow         = 5 * time.Minute
	adminLoginAttempts       = 20
	captchaEnabledConfigKey  = "sys.account.captchaEnabled"
	loginBlacklistConfigKey  = "sys.login.blackIPList"
	superAdminUserID         = 1
	superAdminRoleKey        = "admin"
	allPermission            = "*:*:*"
	adminLoginLockThreshold  = 5
	adminLoginLockWindow     = 15 * time.Minute
)

// AdminPrincipal is the authenticated administrator attached to a request after
// the server-side permission check.
type AdminPrincipal struct {
	UserID      uint64
	DeptID      uint64
	Username    string
	Nickname    string
	Roles       []string
	Permissions []string
}

// AdminProfile is the account detail returned to the Web client. It carries no
// credential material.
type AdminProfile struct {
	UserID      uint64     `json:"userId"`
	DeptID      uint64     `json:"deptId"`
	UserName    string     `json:"userName"`
	NickName    string     `json:"nickName"`
	Email       string     `json:"email,omitempty"`
	Phonenumber string     `json:"phonenumber,omitempty"`
	Sex         string     `json:"sex,omitempty"`
	Avatar      string     `json:"avatar,omitempty"`
	Status      string     `json:"status"`
	LoginIP     string     `json:"loginIp,omitempty"`
	LoginDate   string     `json:"loginDate,omitempty"`
	Dept        *AdminDept `json:"dept,omitempty"`
}

// AdminDept is the department shown next to the signed-in administrator.
type AdminDept struct {
	DeptID   uint64 `json:"deptId"`
	DeptName string `json:"deptName"`
}

type AdminLoginInput struct {
	Username    string
	Password    string
	CaptchaCode string
	CaptchaID   string
	ClientIP    string
	UserAgent   string
}

// adminSessionRecord is the Redis session value. Field names follow the legacy
// session shape so the online-session listing and any still-migrating screen read
// the same record without a translation layer.
type adminSessionRecord struct {
	UserID        uint64           `json:"userId"`
	DeptID        uint64           `json:"deptId"`
	Token         string           `json:"token"`
	LoginTime     int64            `json:"loginTime"`
	ExpireTime    int64            `json:"expireTime"`
	IPAddr        string           `json:"ipaddr"`
	LoginLocation string           `json:"loginLocation"`
	Browser       string           `json:"browser"`
	OS            string           `json:"os"`
	Permissions   []string         `json:"permissions"`
	User          adminSessionUser `json:"user"`
}

type adminSessionUser struct {
	UserID   uint64           `json:"userId"`
	DeptID   uint64           `json:"deptId"`
	UserName string           `json:"userName"`
	NickName string           `json:"nickName"`
	Status   string           `json:"status"`
	Dept     *adminSessionDep `json:"dept,omitempty"`
}

type adminSessionDep struct {
	DeptID   uint64 `json:"deptId"`
	DeptName string `json:"deptName"`
}

type adminTokenClaims struct {
	LoginUserKey string `json:"login_user_key"`
	jwt.RegisteredClaims
}

type adminAccountRow struct {
	UserID      uint64     `gorm:"column:user_id"`
	DeptID      uint64     `gorm:"column:dept_id"`
	UserName    string     `gorm:"column:user_name"`
	NickName    string     `gorm:"column:nick_name"`
	Email       string     `gorm:"column:email"`
	Phonenumber string     `gorm:"column:phonenumber"`
	Sex         string     `gorm:"column:sex"`
	Avatar      string     `gorm:"column:avatar"`
	Status      string     `gorm:"column:status"`
	DelFlag     string     `gorm:"column:del_flag"`
	LoginIP     string     `gorm:"column:login_ip"`
	LoginDate   *time.Time `gorm:"column:login_date"`
	DeptName    string     `gorm:"column:dept_name"`
}

const adminAccountColumns = `
u.user_id,
COALESCE(u.dept_id, 0) AS dept_id,
COALESCE(u.user_name, '') AS user_name,
COALESCE(u.nick_name, '') AS nick_name,
COALESCE(u.email, '') AS email,
COALESCE(u.phonenumber, '') AS phonenumber,
COALESCE(u.sex, '') AS sex,
COALESCE(u.avatar, '') AS avatar,
COALESCE(u.status, '0') AS status,
COALESCE(u.del_flag, '0') AS del_flag,
COALESCE(u.login_ip, '') AS login_ip,
u.login_date,
COALESCE(d.dept_name, '') AS dept_name`

func (s *Service) adminAccountQuery() *gorm.DB {
	return s.db.Table("sys_user AS u").Joins("LEFT JOIN sys_dept AS d ON d.dept_id = u.dept_id")
}

// LoginAdmin verifies the administrator credentials and starts a session. The
// caller must not log the password, the session identifier, or the token.
func (s *Service) LoginAdmin(ctx context.Context, input AdminLoginInput) (string, *AdminPrincipal, error) {
	username := strings.TrimSpace(input.Username)
	lockSubject := input.ClientIP + "|" + strings.ToLower(username)
	audit := func(result, reason string) {
		s.recordLoginAudit(ctx, loginAuditEntry{
			ActorType:  auditActorAdmin,
			Identifier: maskIdentifier(username),
			ClientIP:   input.ClientIP,
			UserAgent:  input.UserAgent,
			Result:     result,
			Reason:     reason,
		})
	}
	// rejectCredential counts a credential failure towards the lockout window.
	rejectCredential := func(status int, message, reason string) (string, *AdminPrincipal, error) {
		audit(auditResultFailure, reason)
		if err := s.recordLoginFailure(ctx, "admin", lockSubject, adminLoginLockWindow); err != nil {
			s.logger.Error("administrator lockout counter failed", "error_type", fmt.Sprintf("%T", err))
		}
		return "", nil, businessError(status, message)
	}
	// rejectAudited records the attempt without consuming lockout budget.
	rejectAudited := func(status int, message, reason string) (string, *AdminPrincipal, error) {
		audit(auditResultFailure, reason)
		return "", nil, businessError(status, message)
	}

	if username == "" || input.Password == "" {
		return rejectAudited(400, "用户名和密码不能为空", reasonInvalidRequest)
	}
	if len(username) > 30 || len([]rune(input.Password)) < 5 || len(input.Password) > 20 {
		return rejectCredential(400, "用户名或密码错误", reasonInvalidCreds)
	}

	settings, err := s.adminAuthSettings(ctx)
	if err != nil {
		return "", nil, err
	}
	if reason, err := s.verifyAdminCaptcha(ctx, settings, input); err != nil {
		return rejectAudited(400, err.Error(), reason)
	}
	if err := s.checkLoginBlacklist(settings[loginBlacklistConfigKey], input.ClientIP); err != nil {
		return rejectAudited(403, "登录被拒绝，请联系管理员", reasonBlacklisted)
	}
	locked, err := s.loginLocked(ctx, "admin", lockSubject, adminLoginLockThreshold)
	if err != nil {
		return "", nil, err
	}
	if locked {
		return rejectAudited(429, "登录失败次数过多，账号已临时锁定，请稍后再试", reasonLocked)
	}
	if err := s.rateLimit(ctx, "admin-login", lockSubject, adminLoginAttempts, adminLoginWindow); err != nil {
		return rejectAudited(429, "请求过于频繁，请稍后重试", reasonRateLimited)
	}

	var account adminAccountRow
	err = s.adminAccountQuery().
		Select(adminAccountColumns).
		Where("u.user_name = ?", username).
		Take(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Equalize the response time for unknown accounts.
		_ = bcrypt.CompareHashAndPassword(s.dummyPasswordHash, bcryptInput(input.Password))
		return rejectCredential(400, "用户名或密码错误", reasonInvalidCreds)
	}
	if err != nil {
		return "", nil, fmt.Errorf("load administrator account: %w", err)
	}

	var credential struct {
		PasswordHash string `gorm:"column:password_hash"`
	}
	err = s.db.WithContext(ctx).Table("sys_user_auth").
		Select("password_hash").
		Where("user_id = ?", account.UserID).
		Take(&credential).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil, fmt.Errorf("load administrator credential: %w", err)
	}
	if err != nil || bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), bcryptInput(input.Password)) != nil {
		return rejectCredential(400, "用户名或密码错误", reasonInvalidCreds)
	}
	if account.DelFlag != "0" {
		// A deleted account must not be distinguishable from a wrong password.
		return rejectCredential(400, "用户名或密码错误", reasonAccountDeleted)
	}
	// The status is only disclosed once the password has been verified, so the
	// response cannot be used to enumerate administrator accounts.
	if account.Status != "0" {
		return rejectAudited(403, "账号已停用，请联系管理员", reasonAccountDisabled)
	}

	principal, err := s.adminPrincipalFor(ctx, account.UserID)
	if err != nil {
		return "", nil, err
	}
	sessionID, err := randomHex(16)
	if err != nil {
		return "", nil, fmt.Errorf("create administrator session id: %w", err)
	}
	now := time.Now()
	expiresAt := now.Add(adminSessionTTL)
	record := adminSessionRecord{
		UserID:      principal.UserID,
		DeptID:      principal.DeptID,
		Token:       sessionID,
		LoginTime:   now.UnixMilli(),
		ExpireTime:  expiresAt.UnixMilli(),
		IPAddr:      input.ClientIP,
		Browser:     input.UserAgent,
		Permissions: principal.Permissions,
		User: adminSessionUser{
			UserID:   principal.UserID,
			DeptID:   principal.DeptID,
			UserName: principal.Username,
			NickName: principal.Nickname,
			Status:   account.Status,
		},
	}
	if account.DeptName != "" {
		record.User.Dept = &adminSessionDep{DeptID: account.DeptID, DeptName: account.DeptName}
	}
	payload, err := json.Marshal(record)
	if err != nil {
		return "", nil, fmt.Errorf("encode administrator session: %w", err)
	}
	if err := s.redis.Set(ctx, adminSessionKeyPrefix+sessionID, payload, adminSessionTTL).Err(); err != nil {
		return "", nil, fmt.Errorf("store administrator session: %w", err)
	}
	token, err := s.signAdminToken(sessionID, principal.Username, now, expiresAt)
	if err != nil {
		_ = s.redis.Del(ctx, adminSessionKeyPrefix+sessionID).Err()
		return "", nil, fmt.Errorf("sign administrator token: %w", err)
	}
	if err := s.db.WithContext(ctx).Table("sys_user").
		Where("user_id = ?", principal.UserID).
		Updates(map[string]any{"login_ip": input.ClientIP, "login_date": now}).Error; err != nil {
		return "", nil, fmt.Errorf("record administrator login: %w", err)
	}
	s.clearLoginFailures(ctx, "admin", lockSubject)
	audit(auditResultSuccess, "")
	return token, principal, nil
}

// AdminSession validates the token, confirms the Redis session is still active,
// and reloads the account and permissions from PostgreSQL.
func (s *Service) AdminSession(ctx context.Context, rawToken string) (*AdminPrincipal, error) {
	sessionID, claims, err := s.parseAdminToken(rawToken)
	if err != nil {
		return nil, businessError(401, "未登录或登录已过期")
	}
	payload, err := s.redis.Get(ctx, adminSessionKeyPrefix+sessionID).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, businessError(401, "未登录或登录已过期")
	}
	if err != nil {
		return nil, fmt.Errorf("read administrator session: %w", err)
	}
	if len(payload) == 0 || len(payload) > 64<<10 {
		return nil, businessError(401, "未登录或登录已过期")
	}
	var record adminSessionRecord
	if err := json.Unmarshal(payload, &record); err != nil || record.UserID == 0 {
		return nil, businessError(401, "未登录或登录已过期")
	}
	if record.User.UserName != "" && record.User.UserName != claims.Subject {
		return nil, businessError(401, "未登录或登录已过期")
	}
	principal, err := s.adminPrincipalFor(ctx, record.UserID)
	if err != nil {
		return nil, err
	}
	s.refreshAdminSession(ctx, sessionID, &record)
	return principal, nil
}

// refreshAdminSession extends the session once it nears expiry so active
// administrators are not signed out mid-session.
func (s *Service) refreshAdminSession(ctx context.Context, sessionID string, record *adminSessionRecord) {
	if record.ExpireTime != 0 && time.Until(time.UnixMilli(record.ExpireTime)) > adminSessionRefreshAfter {
		return
	}
	now := time.Now()
	record.LoginTime = now.UnixMilli()
	record.ExpireTime = now.Add(adminSessionTTL).UnixMilli()
	payload, err := json.Marshal(record)
	if err != nil {
		return
	}
	_ = s.redis.Set(ctx, adminSessionKeyPrefix+sessionID, payload, adminSessionTTL).Err()
}

// LogoutAdmin drops the server-side session. The token itself is stateless and
// becomes unusable as soon as the Redis record is gone.
func (s *Service) LogoutAdmin(ctx context.Context, rawToken string) error {
	sessionID, _, err := s.parseAdminToken(rawToken)
	if err != nil {
		return nil
	}
	if err := s.redis.Del(ctx, adminSessionKeyPrefix+sessionID).Err(); err != nil {
		return fmt.Errorf("delete administrator session: %w", err)
	}
	return nil
}

// AdminProfile returns the account detail for the signed-in administrator.
func (s *Service) AdminProfile(ctx context.Context, userID uint64) (AdminProfile, error) {
	var account adminAccountRow
	err := s.adminAccountQuery().Select(adminAccountColumns).
		Where("u.user_id = ?", userID).
		Take(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return AdminProfile{}, businessError(401, "未登录或登录已过期")
	}
	if err != nil {
		return AdminProfile{}, fmt.Errorf("load administrator profile: %w", err)
	}
	profile := AdminProfile{
		UserID:      account.UserID,
		DeptID:      account.DeptID,
		UserName:    account.UserName,
		NickName:    account.NickName,
		Email:       account.Email,
		Phonenumber: account.Phonenumber,
		Sex:         account.Sex,
		Avatar:      account.Avatar,
		Status:      account.Status,
		LoginIP:     account.LoginIP,
	}
	if account.LoginDate != nil {
		profile.LoginDate = account.LoginDate.Format("2006-01-02 15:04:05")
	}
	if account.DeptName != "" {
		profile.Dept = &AdminDept{DeptID: account.DeptID, DeptName: account.DeptName}
	}
	return profile, nil
}

// adminPrincipalFor returns the enabled administrator with current roles and
// permissions. User 1 keeps the legacy super-administrator behaviour.
func (s *Service) adminPrincipalFor(ctx context.Context, userID uint64) (*AdminPrincipal, error) {
	var account adminAccountRow
	err := s.adminAccountQuery().Select(adminAccountColumns).
		Where("u.user_id = ?", userID).
		Take(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, businessError(401, "未登录或登录已过期")
	}
	if err != nil {
		return nil, fmt.Errorf("load administrator account: %w", err)
	}
	if account.Status != "0" || account.DelFlag != "0" {
		return nil, businessError(401, "账号已停用，请联系管理员")
	}
	principal := &AdminPrincipal{
		UserID:   account.UserID,
		DeptID:   account.DeptID,
		Username: account.UserName,
		Nickname: account.NickName,
	}
	if principal.UserID == superAdminUserID {
		principal.Roles = []string{superAdminRoleKey}
		principal.Permissions = []string{allPermission}
		return principal, nil
	}
	if err := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT r.role_key
FROM sys_user_role ur
JOIN sys_role r ON r.role_id = ur.role_id
WHERE ur.user_id = ? AND r.status = '0' AND COALESCE(r.del_flag, '0') = '0'
ORDER BY r.role_key`, principal.UserID).Scan(&principal.Roles).Error; err != nil {
		return nil, fmt.Errorf("load administrator roles: %w", err)
	}
	if err := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT m.perms
FROM sys_user_role ur
JOIN sys_role r ON r.role_id = ur.role_id
JOIN sys_role_menu rm ON rm.role_id = r.role_id
JOIN sys_menu m ON m.menu_id = rm.menu_id
WHERE ur.user_id = ? AND r.status = '0' AND COALESCE(r.del_flag, '0') = '0'
  AND m.status = '0' AND m.perms IS NOT NULL AND m.perms <> ''`, principal.UserID).Scan(&principal.Permissions).Error; err != nil {
		return nil, fmt.Errorf("load administrator permissions: %w", err)
	}
	return principal, nil
}

// CaptchaEnabled reports whether the snapshotted login configuration still
// requires a verification code.
func (s *Service) CaptchaEnabled(ctx context.Context) (bool, error) {
	settings, err := s.adminAuthSettings(ctx)
	if err != nil {
		return true, err
	}
	return captchaRequired(settings[captchaEnabledConfigKey]), nil
}

func (s *Service) signAdminToken(sessionID, username string, issuedAt, expiresAt time.Time) (string, error) {
	claims := adminTokenClaims{
		LoginUserKey: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   username,
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(s.secret)
}

func (s *Service) parseAdminToken(rawToken string) (string, *adminTokenClaims, error) {
	tokenString := strings.TrimSpace(rawToken)
	if strings.HasPrefix(tokenString, "Bearer ") {
		tokenString = strings.TrimSpace(strings.TrimPrefix(tokenString, "Bearer "))
	}
	if tokenString == "" || len(tokenString) > 8192 {
		return "", nil, errors.New("missing token")
	}
	claims := &adminTokenClaims{}
	parsed, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS512 {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	}, jwt.WithValidMethods([]string{"HS512"}))
	if err != nil || parsed == nil || !parsed.Valid {
		return "", nil, errors.New("invalid token")
	}
	if len(claims.LoginUserKey) != 32 || !isAdminHex(claims.LoginUserKey) {
		return "", nil, errors.New("invalid session id")
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return "", nil, errors.New("invalid subject")
	}
	return claims.LoginUserKey, claims, nil
}

// adminAuthSettings returns the administrator login settings that were snapshotted
// from the legacy configuration. Absent keys keep the secure defaults.
func (s *Service) adminAuthSettings(ctx context.Context) (map[string]string, error) {
	rows := []struct {
		ConfigKey   string `gorm:"column:config_key"`
		ConfigValue string `gorm:"column:config_value"`
	}{}
	if err := s.db.WithContext(ctx).Table("sys_admin_auth_config").
		Select("config_key, config_value").
		Where("config_key IN ?", []string{captchaEnabledConfigKey, loginBlacklistConfigKey}).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("load administrator login settings: %w", err)
	}
	settings := make(map[string]string, len(rows))
	for _, row := range rows {
		settings[row.ConfigKey] = row.ConfigValue
	}
	return settings, nil
}

func (s *Service) verifyAdminCaptcha(ctx context.Context, settings map[string]string, input AdminLoginInput) (string, error) {
	if !captchaRequired(settings[captchaEnabledConfigKey]) {
		return "", nil
	}
	captchaID := strings.TrimSpace(input.CaptchaID)
	code := strings.TrimSpace(input.CaptchaCode)
	if len(captchaID) != 32 || !isAdminHex(captchaID) || code == "" {
		return reasonInvalidRequest, businessError(400, "请输入验证码")
	}
	key := adminCaptchaKeyPrefix + captchaID
	saved, err := s.redis.Get(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return reasonCaptchaExpired, businessError(400, "验证码已过期，请刷新后重试")
	}
	if err != nil {
		return reasonCaptchaExpired, fmt.Errorf("read captcha: %w", err)
	}
	// A captcha is single use regardless of the result.
	_ = s.redis.Del(ctx, key).Err()
	if !strings.EqualFold(saved, code) {
		return reasonCaptchaInvalid, businessError(400, "验证码不正确")
	}
	return "", nil
}

// checkLoginBlacklist rejects administrators whose client IP is listed in the
// snapshotted login blacklist. Entries may be an exact IP, a CIDR range, or a
// wildcard prefix pattern.
func (s *Service) checkLoginBlacklist(list, clientIP string) error {
	list = strings.TrimSpace(list)
	if list == "" || clientIP == "" || clientIP == "unknown" {
		return nil
	}
	parsedIP := net.ParseIP(clientIP)
	for _, entry := range strings.Split(list, ",") {
		entry = strings.TrimSpace(entry)
		switch {
		case entry == "":
			continue
		case entry == clientIP:
			return businessError(403, "登录被拒绝，请联系管理员")
		case strings.Contains(entry, "/"):
			if _, network, err := net.ParseCIDR(entry); err == nil && parsedIP != nil && network.Contains(parsedIP) {
				return businessError(403, "登录被拒绝，请联系管理员")
			}
		case strings.Contains(entry, "*"):
			if matchWildcardIP(entry, clientIP) {
				return businessError(403, "登录被拒绝，请联系管理员")
			}
		}
	}
	return nil
}

func matchWildcardIP(pattern, clientIP string) bool {
	parts := strings.Split(pattern, ".")
	address := strings.Split(clientIP, ".")
	if len(parts) != 4 || len(address) != 4 {
		return false
	}
	for i := 0; i < 4; i++ {
		if parts[i] == "*" {
			continue
		}
		if parts[i] != address[i] {
			return false
		}
	}
	return true
}

func captchaRequired(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "false":
		return false
	default:
		// An unset or unrecognized value keeps the verification code required.
		return true
	}
}

func isAdminHex(value string) bool {
	for _, r := range value {
		if !(r >= '0' && r <= '9') && !(r >= 'a' && r <= 'f') && !(r >= 'A' && r <= 'F') {
			return false
		}
	}
	return true
}
