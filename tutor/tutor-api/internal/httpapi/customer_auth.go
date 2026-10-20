package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

type emailRequest struct {
	Email string `json:"email"`
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Nickname string `json:"nickname"`
	Code     string `json:"code"`
	// Consent must be true: registration is refused without an explicit
	// agreement to the privacy policy and user agreement.
	Consent bool `json:"consent"`
}

type deleteAccountRequest struct {
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type resetPasswordRequest struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
}

type setRoleRequest struct {
	Role string `json:"role"`
}

type customerHandler func(http.ResponseWriter, *http.Request, *identity.Session)

func (a *API) sendCode(w http.ResponseWriter, r *http.Request) {
	var body emailRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	result, err := a.identity.SendCode(r.Context(), body.Email, clientIP(r, a.config.TrustedProxyCIDRs), "register")
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "验证码已发送", result)
}

func (a *API) sendResetCode(w http.ResponseWriter, r *http.Request) {
	var body emailRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	result, err := a.identity.SendResetCode(r.Context(), body.Email, clientIP(r, a.config.TrustedProxyCIDRs))
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "如果该邮箱已注册，验证码已发送", result)
}

func (a *API) resetPassword(w http.ResponseWriter, r *http.Request) {
	var body resetPasswordRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	if err := a.identity.ResetPassword(r.Context(), body.Email, body.Code, body.Password, clientIP(r, a.config.TrustedProxyCIDRs)); err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "密码已重置，请用新密码登录", nil)
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var body registerRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	payload, err := a.identity.Register(r.Context(), body.Email, body.Password, body.Nickname, body.Code, clientIP(r, a.config.TrustedProxyCIDRs), body.Consent)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "注册成功", payload)
}

// deleteMyAccount erases the signed-in customer's account and owned content. The
// password is re-checked because the operation is irreversible.
func (a *API) deleteMyAccount(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	var body deleteAccountRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	if body.Password == "" {
		writeAPIError(w, 400, "请输入登录密码以确认注销")
		return
	}
	if err := a.identity.DeleteAccount(r.Context(), session.Account.AccountID, body.Password, clientIP(r, a.config.TrustedProxyCIDRs)); err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "账号已注销", nil)
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var body loginRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	payload, err := a.identity.Login(r.Context(), body.Email, body.Password, clientIP(r, a.config.TrustedProxyCIDRs), safeUserAgent(r.UserAgent()))
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "登录成功", payload)
}

func (a *API) authMe(w http.ResponseWriter, _ *http.Request, session *identity.Session) {
	session.Account.PasswordHash = ""
	writeSuccess(w, "操作成功", session.Account)
}

func (a *API) setRole(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	var body setRoleRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	account, err := a.identity.SetRole(r.Context(), session.Account.AccountID, body.Role)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	account.PasswordHash = ""
	writeSuccess(w, "身份已设置", account)
}

func (a *API) logout(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if err := a.identity.Logout(r.Context(), session.SessionKey); err != nil {
		a.logger.Error("customer logout failed", "error_type", fmt.Sprintf("%T", err))
		writeAPIError(w, 500, "退出登录失败")
		return
	}
	writeSuccess(w, "已退出登录", nil)
}

func (a *API) subjects(w http.ResponseWriter, _ *http.Request) {
	writeSuccess(w, "操作成功", []string{"语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "信息技术", "奥数", "陪读"})
}

func (a *API) customerAuth(next customerHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			writeAPIError(w, 401, "未登录或登录已过期")
			return
		}
		session, err := a.identity.Authenticate(r.Context(), parts[1])
		if err != nil {
			a.writeBusinessError(w, err)
			return
		}
		next(w, r, session)
	}
}

func (a *API) writeBusinessError(w http.ResponseWriter, err error) {
	var business *identity.Error
	if errors.As(err, &business) {
		writeAPIError(w, business.Status, business.Message)
		return
	}
	var webBusiness *web.Error
	if errors.As(err, &webBusiness) {
		writeAPIError(w, webBusiness.Status, webBusiness.Message)
		return
	}
	a.logger.Error("customer request failed", "error_type", fmt.Sprintf("%T", err))
	writeAPIError(w, 500, "服务暂时不可用")
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		return false
	}
	var extra any
	return errors.Is(decoder.Decode(&extra), io.EOF)
}

func clientIP(r *http.Request, trustedProxyCIDRs string) string {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "unknown"
	}
	remoteIP := net.ParseIP(remoteHost)
	if remoteIP == nil {
		return "unknown"
	}
	if isTrustedProxy(remoteIP, trustedProxyCIDRs) {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if len(forwarded) > 0 {
			candidate := net.ParseIP(strings.TrimSpace(forwarded[0]))
			if candidate != nil {
				return candidate.String()
			}
		}
	}
	return remoteIP.String()
}

func isTrustedProxy(remoteIP net.IP, cidrList string) bool {
	for _, value := range strings.Split(cidrList, ",") {
		_, network, err := net.ParseCIDR(strings.TrimSpace(value))
		if err == nil && network.Contains(remoteIP) {
			return true
		}
	}
	return false
}
