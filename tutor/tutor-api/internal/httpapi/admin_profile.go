package httpapi

import (
	"net/http"
	"strings"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"gorm.io/gorm"
)

type adminProfileRequest struct {
	NickName    string `json:"nickName"`
	Email       string `json:"email"`
	Phonenumber string `json:"phonenumber"`
	Sex         string `json:"sex"`
}

type adminPasswordRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

// adminProfile returns the signed-in administrator's own account detail.
func (a *API) adminProfile(w http.ResponseWriter, r *http.Request) {
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
	roleGroup, err := a.identity.AdminRoleGroup(r.Context(), principal.UserID)
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	// Post groups belong to a module that has not been migrated yet, so the field
	// is returned empty rather than silently dropped.
	writeSuccess(w, "操作成功", map[string]any{
		"user":      profile,
		"roleGroup": roleGroup,
		"postGroup": "",
	})
}

// updateAdminProfile updates the self-service profile fields of the caller.
func (a *API) updateAdminProfile(w http.ResponseWriter, r *http.Request) {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		writeAPIError(w, http.StatusUnauthorized, "未登录或登录已过期")
		return
	}
	var body adminProfileRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := a.identity.UpdateAdminProfileWithin(r.Context(), tx, principal.UserID, identity.AdminProfileInput{
			NickName:    body.NickName,
			Email:       body.Email,
			Phonenumber: body.Phonenumber,
			Sex:         body.Sex,
		}); err != nil {
			return err
		}
		return a.persistAdminAction(tx, r, "profile.update")
	})
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	a.recordAdminAction(r, "profile.update")
	writeSuccess(w, "修改成功", nil)
}

// updateAdminPassword changes the caller's password and revokes every other
// session that belongs to the same account.
func (a *API) updateAdminPassword(w http.ResponseWriter, r *http.Request) {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		writeAPIError(w, http.StatusUnauthorized, "未登录或登录已过期")
		return
	}
	var body adminPasswordRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	if body.OldPassword == "" || body.NewPassword == "" {
		writeAPIError(w, http.StatusBadRequest, "请填写旧密码与新密码")
		return
	}
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		if err := a.identity.ChangeAdminPasswordWithin(r.Context(), tx, principal.UserID, body.OldPassword, body.NewPassword); err != nil {
			return err
		}
		return a.persistAdminAction(tx, r, "profile.password")
	})
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	// The caller's own session stays valid because it proved knowledge of the new
	// password; every other session ends.
	currentSessionID := a.currentAdminSessionID(r)
	revoked, revokeErr := a.identity.RevokeOtherAdminSessions(r.Context(), principal.UserID, currentSessionID)
	if revokeErr != nil {
		a.logger.Error("revoke other administrator sessions failed", "admin_user_id", principal.UserID, "error_type", errType(revokeErr))
	}
	a.recordAdminAction(r, "profile.password", "changed_rows", int64(revoked))
	writeSuccess(w, "修改成功", nil)
}

// forceLogoutAdminOnline ends another administrator's session. The session is
// removed first because that is the security-relevant effect; the audit row is
// written afterwards and its failure is logged rather than reported as a failed
// logout.
func (a *API) forceLogoutAdminOnline(w http.ResponseWriter, r *http.Request) {
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if principal == nil {
		writeAPIError(w, http.StatusUnauthorized, "未登录或登录已过期")
		return
	}
	sessionID := strings.TrimSpace(r.PathValue("tokenID"))
	if len(sessionID) != 32 || !isHex(sessionID) {
		writeAPIError(w, http.StatusBadRequest, "会话标识不合法")
		return
	}
	if sessionID == a.currentAdminSessionID(r) {
		writeAPIError(w, http.StatusBadRequest, "不能强制退出当前登录的会话")
		return
	}
	if err := a.identity.RevokeAdminSession(r.Context(), sessionID); err != nil {
		a.logger.Error("force logout failed", "admin_user_id", principal.UserID, "error_type", errType(err))
		writeAPIError(w, http.StatusServiceUnavailable, "强制退出失败，请稍后重试")
		return
	}
	if err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		return a.persistAdminAction(tx, r, "online.force_logout")
	}); err != nil {
		a.logger.Error("force logout audit failed", "admin_user_id", principal.UserID, "error_type", errType(err))
	}
	a.recordAdminAction(r, "online.force_logout")
	writeSuccess(w, "已强制退出该会话", nil)
}

// currentAdminSessionID returns the session identifier behind the caller's token.
func (a *API) currentAdminSessionID(r *http.Request) string {
	parts := strings.Fields(r.Header.Get("Authorization"))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	sessionID, err := a.identity.AdminSessionID(parts[1])
	if err != nil {
		return ""
	}
	return sessionID
}
