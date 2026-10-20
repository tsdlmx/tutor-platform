package httpapi

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

type adminRoleRow struct {
	RoleID     uint64
	RoleName   string
	RoleKey    string
	RoleSort   *int
	DataScope  string
	Status     string
	CreateTime string
	Remark     string
	Admin      bool
}

func (a *API) listAdminRoles(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}

	query := a.db.WithContext(r.Context()).Table("sys_role AS r").
		Joins("LEFT JOIN sys_user_role AS ur ON ur.role_id = r.role_id").
		Joins("LEFT JOIN sys_user AS u ON u.user_id = ur.user_id").
		Joins("LEFT JOIN sys_dept AS d ON d.dept_id = u.dept_id").
		Where("r.del_flag = '0'")
	query, err := a.applyAdminDataScope(r, query, "system:role:list", "d.dept_id", "")
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	for _, field := range []struct{ name, column string }{
		{"roleName", "r.role_name"},
		{"roleKey", "r.role_key"},
	} {
		value := strings.TrimSpace(r.URL.Query().Get(field.name))
		if value == "" {
			continue
		}
		if utf8.RuneCountInString(value) > 128 {
			writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
			return
		}
		query = query.Where(field.column+" ILIKE ?", adminLikeContains(value))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		if value != "0" && value != "1" {
			writeAPIError(w, http.StatusBadRequest, "角色状态不合法")
			return
		}
		query = query.Where("r.status = ?", value)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("beginTime")); value != "" {
		begin, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "开始时间格式不正确")
			return
		}
		query = query.Where("r.create_time >= ?", begin)
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
		query = query.Where("r.create_time < ?", end)
	}

	var total int64
	if err := query.Distinct("r.role_id").Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	var source []adminRoleRow
	const columns = `
r.role_id,
COALESCE(r.role_name, '') AS role_name,
COALESCE(r.role_key, '') AS role_key,
r.role_sort,
COALESCE(r.data_scope, '') AS data_scope,
COALESCE(r.status, '') AS status,
COALESCE(TO_CHAR(r.create_time, 'YYYY-MM-DD HH24:MI:SS'), '') AS create_time,
COALESCE(r.remark, '') AS remark,
(r.role_id = 1) AS admin`
	if err := query.Distinct().Select(columns).
		Order("r.role_sort ASC NULLS LAST, r.role_id ASC").
		Offset((pageNum - 1) * pageSize).
		Limit(pageSize).
		Scan(&source).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	rows := make([]web.AdminRoleListItem, 0, len(source))
	for _, item := range source {
		rows = append(rows, web.AdminRoleListItem{
			RoleID:     item.RoleID,
			RoleName:   item.RoleName,
			RoleKey:    item.RoleKey,
			RoleSort:   item.RoleSort,
			DataScope:  item.DataScope,
			Status:     item.Status,
			CreateTime: item.CreateTime,
			Remark:     item.Remark,
			Admin:      item.Admin,
		})
	}
	writeTable(w, total, rows)
}
