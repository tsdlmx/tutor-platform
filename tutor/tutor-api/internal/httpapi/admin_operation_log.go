package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

func (a *API) listAdminOperationLogs(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}

	query := a.db.WithContext(r.Context()).Table("sys_oper_log")
	for _, field := range []struct{ name, column string }{
		{"title", "title"},
		{"operName", "oper_name"},
	} {
		value := strings.TrimSpace(r.URL.Query().Get(field.name))
		if value == "" {
			continue
		}
		if utf8.RuneCountInString(value) > 128 {
			writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
			return
		}
		query = query.Where(field.column+" ILIKE ? ESCAPE '\\'", adminLikeContains(value))
	}

	if value := strings.TrimSpace(r.URL.Query().Get("businessType")); value != "" {
		businessType, err := strconv.Atoi(value)
		if err != nil || businessType < 0 || businessType > 9 {
			writeAPIError(w, http.StatusBadRequest, "操作类型不合法")
			return
		}
		query = query.Where("business_type = ?", businessType)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		status, err := strconv.Atoi(value)
		if err != nil || (status != 0 && status != 1) {
			writeAPIError(w, http.StatusBadRequest, "操作状态不合法")
			return
		}
		query = query.Where("status = ?", status)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("beginTime")); value != "" {
		begin, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "开始时间格式不正确")
			return
		}
		query = query.Where("oper_time >= ?", begin)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("endTime")); value != "" {
		end, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "结束时间格式不正确")
			return
		}
		if len(value) == len("2006-01-02") {
			end = end.Add(24 * time.Hour)
		}
		query = query.Where("oper_time < ?", end)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	rows := make([]web.AdminOperationLog, 0)
	const safeColumns = `
oper_id,
COALESCE(title, '') AS title,
COALESCE(business_type, 0) AS business_type,
COALESCE(method, '') AS method,
COALESCE(request_method, '') AS request_method,
COALESCE(operator_type, 0) AS operator_type,
COALESCE(oper_name, '') AS oper_name,
COALESCE(dept_name, '') AS dept_name,
COALESCE(oper_url, '') AS oper_url,
COALESCE(oper_ip, '') AS oper_ip,
COALESCE(oper_location, '') AS oper_location,
CASE WHEN COALESCE(action_meta, '') IN ('', '{}') THEN '历史请求参数未迁移' ELSE action_meta END AS oper_param,
'' AS json_result,
COALESCE(status, 0) AS status,
'' AS error_msg,
COALESCE(TO_CHAR(oper_time, 'YYYY-MM-DD HH24:MI:SS'), '') AS oper_time,
COALESCE(cost_time, 0) AS cost_time`
	if err := query.Select(safeColumns).
		Order("oper_id DESC").
		Offset((pageNum - 1) * pageSize).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeTable(w, total, rows)
}
