package httpapi

import (
	"net/http"
	"strconv"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

func (a *API) myProfile(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	payload, err := a.web.BuildProfilePayload(r.Context(), session.Account.AccountID, true)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", payload)
}

func (a *API) profile(w http.ResponseWriter, r *http.Request, _ *identity.Session) {
	accountID, ok := positivePathID(w, r, "accountID", "账号编号")
	if !ok {
		return
	}
	payload, err := a.web.BuildProfilePayload(r.Context(), accountID, false)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", payload)
}

func (a *API) saveMyProfile(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "TEACHER") {
		writeAPIError(w, 400, "只有老师身份可以填写简历")
		return
	}
	var body web.ProfileInput
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	profile, err := a.web.SaveTeacherProfile(r.Context(), session.Account.AccountID, body)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "简历已保存", profile)
}

func (a *API) profilePosts(w http.ResponseWriter, r *http.Request, _ *identity.Session) {
	accountID, ok := positivePathID(w, r, "accountID", "账号编号")
	if !ok {
		return
	}
	pageNum, pageSize, ok := postPageQuery(w, r)
	if !ok {
		return
	}
	approved := "1"
	page, err := a.web.ListPosts(r.Context(), &accountID, &approved, pageNum, pageSize)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeTable(w, page.Total, page.Rows)
}

func (a *API) myPosts(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	pageNum, pageSize, ok := postPageQuery(w, r)
	if !ok {
		return
	}
	page, err := a.web.ListPosts(r.Context(), &session.Account.AccountID, nil, pageNum, pageSize)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeTable(w, page.Total, page.Rows)
}

func (a *API) plazaPosts(w http.ResponseWriter, r *http.Request, _ *identity.Session) {
	pageNum, pageSize, ok := postPageQuery(w, r)
	if !ok {
		return
	}
	approved := "1"
	page, err := a.web.ListPosts(r.Context(), nil, &approved, pageNum, pageSize)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeTable(w, page.Total, page.Rows)
}

func (a *API) createPost(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	var body web.PostInput
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	post, err := a.web.PublishPost(r.Context(), session.Account.AccountID, body)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "已提交，审核通过后会展示在广场上", post)
}

func (a *API) deletePost(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	postID, ok := positivePathID(w, r, "postID", "帖子编号")
	if !ok {
		return
	}
	if err := a.web.DeleteOwnPost(r.Context(), session.Account.AccountID, postID); err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "已删除", nil)
}

func positivePathID(w http.ResponseWriter, r *http.Request, key, label string) (uint64, bool) {
	value, err := strconv.ParseUint(r.PathValue(key), 10, 64)
	if err != nil || value == 0 {
		writeAPIError(w, 400, label+"不合法")
		return 0, false
	}
	return value, true
}

func postPageQuery(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	pageNum, err := parseQueryInt(r.URL.Query().Get("pageNum"), 1)
	if err != nil {
		writeAPIError(w, 400, "分页参数不合法")
		return 0, 0, false
	}
	pageSize, err := parseQueryInt(r.URL.Query().Get("pageSize"), 10)
	if err != nil {
		writeAPIError(w, 400, "分页参数不合法")
		return 0, 0, false
	}
	if pageNum > 0 && pageSize > 100 {
		writeAPIError(w, 400, "分页参数超出范围")
		return 0, 0, false
	}
	return pageNum, pageSize, true
}
