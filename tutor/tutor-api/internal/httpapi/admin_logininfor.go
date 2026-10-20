package httpapi

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/identity"
	"gorm.io/gorm"
)

// loginAuditRow is the raw audit record. Personal identifiers are already masked
// when they are written, so the listing never needs to un-mask anything.
type loginAuditRow struct {
	AuditID    uint64    `gorm:"column:audit_id"`
	ActorType  string    `gorm:"column:actor_type"`
	Identifier string    `gorm:"column:identifier"`
	ClientIP   string    `gorm:"column:client_ip"`
	UserAgent  string    `gorm:"column:user_agent"`
	Result     string    `gorm:"column:result"`
	Reason     string    `gorm:"column:reason"`
	CreatedAt  time.Time `gorm:"column:created_at"`
}

// loginInforListItem matches the shape the login-log screen already consumes.
type loginInforListItem struct {
	InfoID        uint64 `json:"infoId"`
	UserName      string `json:"userName"`
	IPAddr        string `json:"ipaddr"`
	LoginLocation string `json:"loginLocation"`
	Browser       string `json:"browser"`
	OS            string `json:"os"`
	Status        string `json:"status"`
	Msg           string `json:"msg"`
	LoginTime     string `json:"loginTime"`
}

// listAdminLoginInfors serves the login-log screen from the audit table instead
// of the legacy MySQL table. Filters map to what the screen offers: account,
// client address, result, and a time range.
func (a *API) listAdminLoginInfors(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	query := a.db.WithContext(r.Context()).Table("sys_login_audit")

	if value := strings.TrimSpace(r.URL.Query().Get("userName")); value != "" {
		if utf8.RuneCountInString(value) > 128 {
			writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
			return
		}
		// Stored identifiers are masked, so the filter compares against the mask of
		// what the operator typed: entering "admin" finds the rows stored as "adm***"
		// without the audit table ever holding the raw value.
		query = query.Where("identifier = ?", identity.MaskIdentifier(value))
	}
	if value := strings.TrimSpace(r.URL.Query().Get("ipaddr")); value != "" {
		if utf8.RuneCountInString(value) > 128 {
			writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
			return
		}
		query = query.Where("client_ip = ?", value)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		switch value {
		case "0":
			query = query.Where("result = ?", "success")
		case "1":
			query = query.Where("result = ?", "failure")
		default:
			writeAPIError(w, http.StatusBadRequest, "登录状态不合法")
			return
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("beginTime")); value != "" {
		begin, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "开始时间格式不正确")
			return
		}
		query = query.Where("created_at >= ?", begin)
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
		query = query.Where("created_at < ?", end)
	}

	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	rows := make([]loginAuditRow, 0, pageSize)
	if err := query.Select("audit_id, actor_type, identifier, client_ip, user_agent, result, reason, created_at").
		Order("created_at DESC, audit_id DESC").
		Offset((pageNum - 1) * pageSize).
		Limit(pageSize).
		Scan(&rows).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}

	items := make([]loginInforListItem, 0, len(rows))
	for _, row := range rows {
		browser, operatingSystem := describeUserAgent(row.UserAgent)
		items = append(items, loginInforListItem{
			InfoID:    row.AuditID,
			UserName:  row.Identifier,
			IPAddr:    row.ClientIP,
			Browser:   browser,
			OS:        operatingSystem,
			Status:    loginAuditStatus(row.Result),
			Msg:       identity.AuditReasonText(row.ActorType, row.Reason),
			LoginTime: row.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	writeTable(w, total, items)
}

// loginAuditStatus maps the stored result to the legacy "0 success / 1 failure"
// values that the screen renders badges from.
func loginAuditStatus(result string) string {
	if result == "success" {
		return "0"
	}
	return "1"
}
