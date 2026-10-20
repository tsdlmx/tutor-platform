package httpapi

import (
	"net/http"
	"strings"
	"unicode"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
)

type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Code     string `json:"code"`
	UUID     string `json:"uuid"`
}

// adminCaptchaImage issues a single-use login verification code.
func (a *API) adminCaptchaImage(w http.ResponseWriter, r *http.Request) {
	enabled, err := a.identity.CaptchaEnabled(r.Context())
	if err != nil {
		a.logger.Error("captcha configuration unavailable", "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "验证码暂时不可用")
		return
	}
	if !enabled {
		writeSuccess(w, "操作成功", map[string]any{"captchaEnabled": false, "uuid": "", "img": ""})
		return
	}
	identifier, image, err := a.identity.IssueCaptcha(r.Context())
	if err != nil {
		a.logger.Error("captcha generation failed", "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "验证码暂时不可用")
		return
	}
	writeSuccess(w, "操作成功", map[string]any{"captchaEnabled": true, "uuid": identifier, "img": image})
}

// adminLogin authenticates an administrator and returns the issued token.
func (a *API) adminLogin(w http.ResponseWriter, r *http.Request) {
	var body adminLoginRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	if len(body.Username) > 128 || len(body.Password) > 256 || len(body.Code) > 32 || len(body.UUID) > 64 {
		writeAPIError(w, http.StatusBadRequest, "用户名或密码错误")
		return
	}
	clientAddress := clientIP(r, a.config.TrustedProxyCIDRs)
	token, principal, err := a.identity.LoginAdmin(r.Context(), identity.AdminLoginInput{
		Username:    body.Username,
		Password:    body.Password,
		CaptchaCode: body.Code,
		CaptchaID:   body.UUID,
		ClientIP:    clientAddress,
		UserAgent:   safeUserAgent(r.UserAgent()),
	})
	if err != nil {
		a.logger.Warn("admin login rejected",
			"user_name", strings.TrimSpace(body.Username),
			"client_ip", clientAddress,
			"error_type", errType(err))
		a.writeBusinessError(w, err)
		return
	}
	a.logger.Info("admin login succeeded",
		"admin_user_id", principal.UserID,
		"admin_username", principal.Username,
		"client_ip", clientAddress)
	writeSuccess(w, "登录成功", map[string]string{"token": token})
}

// adminInfo returns the signed-in administrator together with roles and
// permissions resolved from the database on this request.
func (a *API) adminInfo(w http.ResponseWriter, r *http.Request) {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		writeAPIError(w, http.StatusUnauthorized, "未登录或登录已过期")
		return
	}
	profile, err := a.identity.AdminProfile(r.Context(), principal.UserID)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", map[string]any{
		"user":        profile,
		"roles":       nonNilStrings(principal.Roles),
		"permissions": nonNilStrings(principal.Permissions),
	})
}

// adminLogout discards the server-side session. It stays idempotent so a client
// holding an already expired token can still clear its local state.
func (a *API) adminLogout(w http.ResponseWriter, r *http.Request) {
	if err := a.identity.LogoutAdmin(r.Context(), r.Header.Get("Authorization")); err != nil {
		a.logger.Error("admin logout failed", "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "退出失败，请稍后重试")
		return
	}
	writeSuccess(w, "退出成功", nil)
}

// safeUserAgent keeps only a bounded, printable description of the client.
func safeUserAgent(value string) string {
	trimmed := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	if len(trimmed) > 255 {
		trimmed = trimmed[:255]
	}
	return trimmed
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
