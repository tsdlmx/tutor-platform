package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

type demandStatusRequest struct {
	Status string `json:"status"`
}

type demandApplyRequest struct {
	Message *string `json:"message"`
}

func (a *API) listDemands(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	query := r.URL.Query()
	pageNum, err := parseQueryInt(query.Get("pageNum"), 1)
	if err != nil {
		writeAPIError(w, 400, "分页参数不合法")
		return
	}
	pageSize, err := parseQueryInt(query.Get("pageSize"), 10)
	if err != nil {
		writeAPIError(w, 400, "分页参数不合法")
		return
	}
	for _, name := range []string{"subject", "grade", "keyword"} {
		if len([]rune(query.Get(name))) > 200 {
			writeAPIError(w, 400, "筛选条件过长")
			return
		}
	}
	page, err := a.web.ListDemands(r.Context(), session.Account, web.DemandQuery{
		Subject: query.Get("subject"), Grade: query.Get("grade"), Keyword: query.Get("keyword"),
		Status: query.Get("status"), PageNum: pageNum, PageSize: pageSize,
	})
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeTable(w, page.Total, page.Rows)
}

func (a *API) demandStats(w http.ResponseWriter, r *http.Request, _ *identity.Session) {
	stats, err := a.web.DemandStats(r.Context())
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", stats)
}

func (a *API) getDemand(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") && !hasRole(session.Account, "TEACHER") {
		writeAPIError(w, 400, "请先选择你的身份（老师 / 学生）")
		return
	}
	demandID, ok := demandIDFromPath(w, r)
	if !ok {
		return
	}
	demand, err := a.web.GetDemand(r.Context(), demandID)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	if (hasRole(session.Account, "STUDENT") && demand.StudentID != session.Account.AccountID) ||
		(hasRole(session.Account, "TEACHER") && demand.Status == "3") {
		writeAPIError(w, 404, "需求不存在或不可查看")
		return
	}
	writeSuccess(w, "操作成功", demand)
}

func (a *API) createDemand(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") {
		writeAPIError(w, 403, "只有学生身份可以发布/管理需求")
		return
	}
	var body web.DemandInput
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	demand, err := a.web.CreateDemand(r.Context(), session.Account.AccountID, body)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "需求已发布", demand)
}

func (a *API) updateDemand(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") {
		writeAPIError(w, 403, "只有学生身份可以发布/管理需求")
		return
	}
	demandID, ok := demandIDFromPath(w, r)
	if !ok {
		return
	}
	var body web.DemandInput
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	demand, err := a.web.UpdateDemand(r.Context(), session.Account.AccountID, demandID, body)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "需求已更新", demand)
}

func (a *API) deleteDemand(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") {
		writeAPIError(w, 403, "只有学生身份可以发布/管理需求")
		return
	}
	demandID, ok := demandIDFromPath(w, r)
	if !ok {
		return
	}
	if err := a.web.DeleteDemand(r.Context(), session.Account.AccountID, demandID); err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "需求已删除", nil)
}

func (a *API) updateDemandStatus(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") {
		writeAPIError(w, 403, "只有学生身份可以发布/管理需求")
		return
	}
	demandID, ok := demandIDFromPath(w, r)
	if !ok {
		return
	}
	var body demandStatusRequest
	if !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	if err := a.web.UpdateDemandStatus(r.Context(), session.Account.AccountID, demandID, body.Status); err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "状态已更新", nil)
}

func (a *API) applyToDemand(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "TEACHER") {
		writeAPIError(w, 403, "只有老师身份可以申请联系学生")
		return
	}
	demandID, ok := demandIDFromPath(w, r)
	if !ok {
		return
	}
	var body demandApplyRequest
	if r.ContentLength != 0 && !decodeJSON(w, r, &body) {
		writeAPIError(w, 400, "请求参数格式不正确")
		return
	}
	apply, err := a.web.ApplyToDemand(r.Context(), session.Account.AccountID, demandID, body.Message)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "已提交申请，学生会在「我的」里看到你", apply)
}

func (a *API) appliedDemands(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "TEACHER") {
		writeSuccess(w, "操作成功", []uint64{})
		return
	}
	ids, err := a.web.AppliedDemandIDs(r.Context(), session.Account.AccountID)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", ids)
}

func (a *API) receivedApplications(w http.ResponseWriter, r *http.Request, session *identity.Session) {
	if !hasRole(session.Account, "STUDENT") {
		writeSuccess(w, "操作成功", []web.DemandApply{})
		return
	}
	rows, err := a.web.ReceivedApplications(r.Context(), session.Account.AccountID)
	if err != nil {
		a.writeBusinessError(w, err)
		return
	}
	writeSuccess(w, "操作成功", rows)
}

func demandIDFromPath(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	demandID, err := strconv.ParseUint(r.PathValue("demandID"), 10, 64)
	if err != nil || demandID == 0 {
		writeAPIError(w, 400, "需求编号不合法")
		return 0, false
	}
	return demandID, true
}

func parseQueryInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, err
	}
	return value, nil
}

func hasRole(account web.CustomerAccount, role string) bool {
	return account.Role != nil && strings.EqualFold(*account.Role, role)
}

func writeTable(w http.ResponseWriter, total int64, rows any) {
	writeJSON(w, http.StatusOK, map[string]any{"code": 200, "msg": "查询成功", "total": total, "rows": rows})
}
