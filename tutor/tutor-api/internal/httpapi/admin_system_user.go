package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
)

type adminSystemUserRow struct {
	UserID      uint64
	DeptID      *uint64
	UserName    string
	NickName    string
	Email       string
	Phonenumber string
	Sex         string
	Avatar      string
	Status      string
	DeptName    string
	LoginIP     string
	LoginDate   string
	CreateBy    string
	CreateTime  string
	Remark      string
}

func (a *API) listAdminSystemUsers(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}

	query := a.db.WithContext(r.Context()).Table("sys_user AS u").
		Joins("LEFT JOIN sys_dept AS d ON d.dept_id = u.dept_id").
		Where("u.del_flag = '0'")
	query, err := a.applyAdminDataScope(r, query, "system:user:list", "u.dept_id", "u.user_id")
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	for _, field := range []struct{ name, column string }{
		{"userName", "u.user_name"},
		{"phonenumber", "u.phonenumber"},
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
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		if value != "0" && value != "1" {
			writeAPIError(w, http.StatusBadRequest, "用户状态不合法")
			return
		}
		query = query.Where("u.status = ?", value)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("deptId")); value != "" && value != "0" {
		deptID, err := strconv.ParseUint(value, 10, 64)
		if err != nil || deptID == 0 {
			writeAPIError(w, http.StatusBadRequest, "部门编号不合法")
			return
		}
		deptIDText := strconv.FormatUint(deptID, 10)
		query = query.Where("(u.dept_id = ? OR u.dept_id IN (SELECT dept_id FROM sys_dept WHERE ? = ANY(string_to_array(COALESCE(ancestors, ''), ','))))", deptID, deptIDText)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("beginTime")); value != "" {
		begin, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "开始时间格式不正确")
			return
		}
		query = query.Where("u.create_time >= ?", begin)
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
		query = query.Where("u.create_time < ?", end)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	var source []adminSystemUserRow
	const columns = `
u.user_id,
u.dept_id,
COALESCE(u.user_name, '') AS user_name,
COALESCE(u.nick_name, '') AS nick_name,
COALESCE(u.email, '') AS email,
COALESCE(u.phonenumber, '') AS phonenumber,
COALESCE(u.sex, '') AS sex,
COALESCE(u.avatar, '') AS avatar,
COALESCE(u.status, '') AS status,
COALESCE(d.dept_name, '') AS dept_name,
COALESCE(u.login_ip, '') AS login_ip,
COALESCE(TO_CHAR(u.login_date, 'YYYY-MM-DD HH24:MI:SS'), '') AS login_date,
COALESCE(u.create_by, '') AS create_by,
COALESCE(TO_CHAR(u.create_time, 'YYYY-MM-DD HH24:MI:SS'), '') AS create_time,
COALESCE(u.remark, '') AS remark`
	if err := query.Select(columns).
		Order("u.create_time DESC NULLS LAST, u.user_id DESC").
		Offset((pageNum - 1) * pageSize).
		Limit(pageSize).
		Scan(&source).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	rows := make([]web.AdminSystemUserListItem, 0, len(source))
	for _, item := range source {
		var department *web.AdminSystemUserDepartment
		if item.DeptID != nil || item.DeptName != "" {
			department = &web.AdminSystemUserDepartment{DeptID: item.DeptID, DeptName: item.DeptName}
		}
		rows = append(rows, web.AdminSystemUserListItem{
			UserID:      item.UserID,
			DeptID:      item.DeptID,
			UserName:    item.UserName,
			NickName:    item.NickName,
			Email:       item.Email,
			PhoneNumber: item.Phonenumber,
			Sex:         item.Sex,
			Avatar:      item.Avatar,
			Status:      item.Status,
			Dept:        department,
			LoginIP:     item.LoginIP,
			LoginDate:   item.LoginDate,
			CreateBy:    item.CreateBy,
			CreateTime:  item.CreateTime,
			Remark:      item.Remark,
		})
	}
	writeTable(w, total, rows)
}
