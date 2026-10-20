package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	adminPasswordMinLength = 5
	adminPasswordMaxLength = 20
	adminEmailMaxLength    = 128
	adminPhoneMaxLength    = 32
	adminNicknameMaxLength = 30
	adminSessionScanLimit  = 5000
	adminSessionScanBatch  = 500
)

// AdminProfileInput carries the only account fields an administrator may change
// on their own profile. Roles, department, and status are not self-service.
type AdminProfileInput struct {
	NickName    string
	Email       string
	Phonenumber string
	Sex         string
}

// AdminRoleGroup returns the display names of the administrator's roles.
func (s *Service) AdminRoleGroup(ctx context.Context, userID uint64) (string, error) {
	names := []string{}
	if err := s.db.WithContext(ctx).Raw(`
SELECT DISTINCT r.role_name
FROM sys_user_role ur
JOIN sys_role r ON r.role_id = ur.role_id
WHERE ur.user_id = ? AND r.status = '0' AND COALESCE(r.del_flag, '0') = '0'
ORDER BY r.role_name`, userID).Scan(&names).Error; err != nil {
		return "", fmt.Errorf("load administrator role group: %w", err)
	}
	return strings.Join(names, ","), nil
}

// UpdateAdminProfileWithin validates and writes the self-service profile fields
// inside the caller's transaction so the audit row commits with the change.
func (s *Service) UpdateAdminProfileWithin(ctx context.Context, tx *gorm.DB, userID uint64, input AdminProfileInput) error {
	nickname := strings.TrimSpace(input.NickName)
	email := strings.ToLower(strings.TrimSpace(input.Email))
	phone := strings.TrimSpace(input.Phonenumber)
	sex := strings.TrimSpace(input.Sex)

	if nickname == "" {
		return businessError(400, "昵称不能为空")
	}
	if utf8.RuneCountInString(nickname) > adminNicknameMaxLength {
		return businessError(400, "昵称不能超过 30 个字符")
	}
	if email != "" && !validEmail(email) {
		return businessError(400, "邮箱格式不正确")
	}
	if phone != "" && !validAdminPhone(phone) {
		return businessError(400, "手机号格式不正确")
	}
	switch sex {
	case "":
		sex = "2"
	case "0", "1", "2":
	default:
		return businessError(400, "性别取值不合法")
	}

	if email != "" {
		var conflicts int64
		if err := tx.WithContext(ctx).Table("sys_user").
			Where("user_id <> ? AND lower(email) = ?", userID, email).
			Count(&conflicts).Error; err != nil {
			return fmt.Errorf("check administrator email uniqueness: %w", err)
		}
		if conflicts > 0 {
			return businessError(409, "邮箱账号已存在")
		}
	}
	if phone != "" {
		var conflicts int64
		if err := tx.WithContext(ctx).Table("sys_user").
			Where("user_id <> ? AND phonenumber = ?", userID, phone).
			Count(&conflicts).Error; err != nil {
			return fmt.Errorf("check administrator phone uniqueness: %w", err)
		}
		if conflicts > 0 {
			return businessError(409, "手机号码已存在")
		}
	}

	updates := map[string]any{
		"nick_name":   nickname,
		"email":       nullableString(email),
		"phonenumber": nullableString(phone),
		"sex":         sex,
		"update_time": time.Now(),
	}
	result := tx.WithContext(ctx).Table("sys_user").Where("user_id = ?", userID).Updates(updates)
	if result.Error != nil {
		return fmt.Errorf("update administrator profile: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return businessError(404, "账号不存在")
	}
	return nil
}

// ChangeAdminPasswordWithin verifies the current password and stores a new hash.
// A wrong or unchanged password is rejected before any write happens.
func (s *Service) ChangeAdminPasswordWithin(ctx context.Context, tx *gorm.DB, userID uint64, oldPassword, newPassword string) error {
	if len([]rune(newPassword)) < adminPasswordMinLength || len(newPassword) > adminPasswordMaxLength {
		return businessError(400, "新密码长度需在 5-20 个字符之间")
	}
	if oldPassword == newPassword {
		return businessError(400, "新密码不能与旧密码相同")
	}
	var credential struct {
		PasswordHash string `gorm:"column:password_hash"`
	}
	if err := tx.WithContext(ctx).Table("sys_user_auth").
		Select("password_hash").
		Where("user_id = ?", userID).
		Take(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return businessError(400, "旧密码错误")
		}
		return fmt.Errorf("load administrator credential: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(credential.PasswordHash), bcryptInput(oldPassword)) != nil {
		return businessError(400, "旧密码错误")
	}
	hash, err := bcrypt.GenerateFromPassword(bcryptInput(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash administrator password: %w", err)
	}
	now := time.Now()
	if err := tx.WithContext(ctx).Table("sys_user_auth").
		Where("user_id = ?", userID).
		Update("password_hash", string(hash)).Error; err != nil {
		return fmt.Errorf("update administrator password: %w", err)
	}
	if err := tx.WithContext(ctx).Table("sys_user").
		Where("user_id = ?", userID).
		Update("pwd_update_date", now).Error; err != nil {
		return fmt.Errorf("record administrator password change: %w", err)
	}
	return nil
}

// RevokeOtherAdminSessions ends every other session that belongs to the same
// administrator. Used after a password change so a previously issued token
// cannot outlive the credential it was created from.
func (s *Service) RevokeOtherAdminSessions(ctx context.Context, userID uint64, keepSessionID string) (int, error) {
	revoked := 0
	cursor := uint64(0)
	scanned := 0
	for {
		keys, next, err := s.redis.Scan(ctx, cursor, adminSessionKeyPrefix+"*", adminSessionScanBatch).Result()
		if err != nil {
			return revoked, fmt.Errorf("scan administrator sessions: %w", err)
		}
		scanned += len(keys)
		if scanned > adminSessionScanLimit {
			return revoked, errors.New("administrator session scan exceeded limit")
		}
		for _, key := range keys {
			sessionID := strings.TrimPrefix(key, adminSessionKeyPrefix)
			if sessionID == keepSessionID || len(sessionID) != 32 || !isAdminHex(sessionID) {
				continue
			}
			payload, err := s.redis.Get(ctx, key).Bytes()
			if errors.Is(err, redis.Nil) {
				continue
			}
			if err != nil {
				return revoked, fmt.Errorf("read administrator session: %w", err)
			}
			var record adminSessionRecord
			if err := json.Unmarshal(payload, &record); err != nil {
				continue
			}
			if record.UserID != userID {
				continue
			}
			if err := s.redis.Del(ctx, key).Err(); err != nil {
				return revoked, fmt.Errorf("revoke administrator session: %w", err)
			}
			revoked++
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return revoked, nil
}

// RevokeAdminSession ends a single session. It is idempotent: an already expired
// session is reported as revoked.
func (s *Service) RevokeAdminSession(ctx context.Context, sessionID string) error {
	if len(sessionID) != 32 || !isAdminHex(sessionID) {
		return businessError(400, "会话标识不合法")
	}
	if err := s.redis.Del(ctx, adminSessionKeyPrefix+sessionID).Err(); err != nil {
		return fmt.Errorf("revoke administrator session: %w", err)
	}
	return nil
}

// validAdminPhone accepts a mainland mobile number, optionally grouped with
// spaces, or an international number written with a leading country code.
func validAdminPhone(phone string) bool {
	if phone == "" || len(phone) > adminPhoneMaxLength {
		return false
	}
	digits := 0
	for i, r := range phone {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == ' ' && i > 0:
		case r == '+' && i == 0:
		default:
			return false
		}
	}
	if strings.HasPrefix(phone, "+") {
		return digits >= 8 && digits <= 15
	}
	return digits == 11
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
