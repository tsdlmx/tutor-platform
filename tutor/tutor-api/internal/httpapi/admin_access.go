package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"gorm.io/gorm"
)

// adminPrincipal is the administrator attached to an authorised request. The
// identity package owns the session and permission resolution.
type adminPrincipal = identity.AdminPrincipal

type adminPrincipalContextKey struct{}
type adminRequestStartedKey struct{}

func (a *API) adminAuth(permission string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, status, err := a.authenticateAdmin(r.Context(), r.Header.Get("Authorization"))
		if err != nil {
			if status >= 500 {
				a.logger.Error("admin authentication backend failure", "status", status, "error_type", errType(err))
			}
			message := "未登录或登录已过期"
			if status >= 500 {
				message = "服务暂时不可用"
			}
			writeAPIError(w, status, message)
			return
		}
		if permission != "" && !hasAdminPermission(principal, permission) {
			a.logger.Warn("admin access denied", "admin_user_id", principal.UserID, "admin_username", principal.Username, "required_permission", permission, "method", r.Method, "path", r.URL.Path)
			writeAPIError(w, http.StatusForbidden, "没有操作权限")
			return
		}
		if permission != "" {
			a.logger.Info("admin request", "admin_user_id", principal.UserID, "admin_username", principal.Username, "permission", permission, "method", r.Method, "path", r.URL.Path)
		}
		ctx := context.WithValue(r.Context(), adminPrincipalContextKey{}, principal)
		ctx = context.WithValue(ctx, adminRequestStartedKey{}, time.Now())
		next(w, r.WithContext(ctx))
	}
}

// authenticateAdmin validates the token issued by this service, requires an
// active Redis session, and reloads the account, roles, and permissions.
func (a *API) authenticateAdmin(ctx context.Context, authorization string) (*adminPrincipal, int, error) {
	principal, err := a.identity.AdminSession(ctx, authorization)
	if err != nil {
		var business *identity.Error
		if errors.As(err, &business) {
			return nil, business.Status, business
		}
		return nil, http.StatusServiceUnavailable, err
	}
	return principal, http.StatusOK, nil
}

type adminOperationLogRecord struct {
	Title         string    `gorm:"column:title"`
	BusinessType  int       `gorm:"column:business_type"`
	Method        string    `gorm:"column:method"`
	RequestMethod string    `gorm:"column:request_method"`
	OperatorType  int       `gorm:"column:operator_type"`
	OperName      string    `gorm:"column:oper_name"`
	DeptName      string    `gorm:"column:dept_name"`
	OperURL       string    `gorm:"column:oper_url"`
	OperIP        string    `gorm:"column:oper_ip"`
	OperLocation  string    `gorm:"column:oper_location"`
	ActionMeta    string    `gorm:"column:action_meta"`
	Status        int       `gorm:"column:status"`
	OperTime      time.Time `gorm:"column:oper_time"`
	CostTime      int64     `gorm:"column:cost_time"`
}

func (a *API) persistAdminAction(tx *gorm.DB, r *http.Request, action string, fields ...any) error {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		return errors.New("admin action missing principal")
	}
	started, _ := r.Context().Value(adminRequestStartedKey{}).(time.Time)
	costTime := int64(0)
	if !started.IsZero() {
		costTime = time.Since(started).Milliseconds()
	}
	record := adminOperationLogRecord{
		Title:         adminActionTitle(action),
		BusinessType:  adminActionBusinessType(action),
		Method:        action,
		RequestMethod: r.Method,
		OperatorType:  1,
		OperName:      principal.Username,
		OperURL:       r.URL.Path,
		OperIP:        clientIP(r, a.config.TrustedProxyCIDRs),
		ActionMeta:    safeAdminActionMetadata(fields...),
		Status:        0,
		OperTime:      time.Now(),
		CostTime:      costTime,
	}
	return tx.WithContext(r.Context()).Table("sys_oper_log").Create(&record).Error
}

func adminActionTitle(action string) string {
	switch {
	case strings.HasPrefix(action, "tutor."):
		return "家教信息"
	case strings.HasPrefix(action, "user_post."):
		return "用户帖子"
	case strings.HasPrefix(action, "customer_account."):
		return "客户账号"
	case strings.HasPrefix(action, "profile."):
		return "个人信息"
	case strings.HasPrefix(action, "online."):
		return "在线管理员"
	default:
		return "后台操作"
	}
}

func adminActionBusinessType(action string) int {
	if strings.HasSuffix(action, ".delete") {
		return 3
	}
	return 2
}

func safeAdminActionMetadata(fields ...any) string {
	metadata := make(map[string]any)
	for i := 0; i+1 < len(fields); i += 2 {
		key, ok := fields[i].(string)
		if !ok {
			continue
		}
		switch key {
		case "target_id":
			if value, ok := fields[i+1].(uint64); ok && value > 0 {
				metadata[key] = value
			}
		case "target_ids":
			if value, ok := fields[i+1].([]uint64); ok && len(value) <= 100 {
				metadata[key] = value
			}
		case "result", "status":
			if value, ok := fields[i+1].(string); ok && (value == "0" || value == "1" || value == "2") {
				metadata[key] = value
			}
		case "changed_rows":
			if value, ok := fields[i+1].(int64); ok && value >= 0 {
				metadata[key] = value
			}
		}
	}
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func (a *API) recordAdminAction(r *http.Request, action string, fields ...any) {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		a.logger.Error("admin action missing principal", "action", action)
		return
	}
	args := []any{"admin_user_id", principal.UserID, "admin_username", principal.Username, "action", action}
	args = append(args, fields...)
	a.logger.Info("admin action", args...)
}
func hasAdminPermission(principal *adminPrincipal, required string) bool {
	if principal == nil {
		return false
	}
	for _, permissionSet := range principal.Permissions {
		for _, permission := range strings.Split(permissionSet, ",") {
			permission = strings.TrimSpace(permission)
			if permission == "*:*:*" || permission == required || adminPermissionPattern(permission, required) {
				return true
			}
		}
	}
	return false
}

func adminPermissionPattern(pattern, value string) bool {
	if !strings.Contains(pattern, "*") {
		return false
	}
	quoted := regexp.QuoteMeta(pattern)
	quoted = strings.ReplaceAll(quoted, `\*`, `.*`)
	matched, err := regexp.MatchString("^"+quoted+"$", value)
	return err == nil && matched
}

func isHex(value string) bool {
	for _, r := range value {
		if !(r >= '0' && r <= '9') && !(r >= 'a' && r <= 'f') && !(r >= 'A' && r <= 'F') {
			return false
		}
	}
	return true
}

func errType(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("%T", err)
}
