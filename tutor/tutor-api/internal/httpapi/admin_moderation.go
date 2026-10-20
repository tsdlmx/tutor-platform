package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"gorm.io/gorm"
)

func (a *API) listAdminTutors(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	query := a.db.WithContext(r.Context()).Table("t_tutor_info").Where("COALESCE(del_flag, '0') = '0'")
	params := r.URL.Query()
	for _, field := range []struct{ name, column string }{
		{"tutorNo", "tutor_no"}, {"tutorName", "tutor_name"}, {"city", "city"}, {"province", "province"},
	} {
		if value := strings.TrimSpace(params.Get(field.name)); value != "" {
			if utf8.RuneCountInString(value) > 128 {
				writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
				return
			}
			query = query.Where(field.column+" ILIKE ? ESCAPE '\\'", adminLikeContains(value))
		}
	}
	for _, field := range []struct{ name, column string }{
		{"gender", "gender"}, {"phone", "phone"}, {"status", "status"}, {"auditStatus", "audit_status"}, {"teacherType", "teacher_type"}, {"acceptMinimalist", "accept_minimalist"},
	} {
		if value := strings.TrimSpace(params.Get(field.name)); value != "" {
			if len(value) > 64 {
				writeAPIError(w, http.StatusBadRequest, "筛选条件不合法")
				return
			}
			query = query.Where(field.column+" = ?", value)
		}
	}
	if value := strings.TrimSpace(params.Get("gradeId")); value != "" {
		gradeID, err := strconv.ParseUint(value, 10, 64)
		if err != nil || gradeID == 0 {
			writeAPIError(w, http.StatusBadRequest, "年级编号不合法")
			return
		}
		query = query.Where("grade_id = ?", gradeID)
	}
	if value := strings.TrimSpace(params.Get("subjectNames")); value != "" {
		if utf8.RuneCountInString(value) > 128 {
			writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
			return
		}
		query = query.Where("subject_names ILIKE ? ESCAPE '\\'", adminLikeContains(value))
	}
	if value := strings.TrimSpace(params.Get("beginTime")); value != "" {
		parsed, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "开始时间格式不正确")
			return
		}
		query = query.Where("create_time >= ?", parsed)
	}
	if value := strings.TrimSpace(params.Get("endTime")); value != "" {
		parsed, err := parseAdminTime(value)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "结束时间格式不正确")
			return
		}
		if len(value) == len("2006-01-02") {
			parsed = parsed.Add(24 * time.Hour)
		}
		query = query.Where("create_time < ?", parsed)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	rows := make([]web.AdminTutor, 0)
	if err := query.Order("create_time DESC NULLS LAST, tutor_id DESC").Offset((pageNum - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if err := a.attachAdminTutorQualifications(r, rows); err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	for i := range rows {
		rows[i].Address = nil
		rows[i].Longitude = nil
		rows[i].Latitude = nil
		rows[i].CrimeRecordCert = nil
		rows[i].IDCard = nil
		rows[i].OpenID = nil
		rows[i].DepositAmount = nil
		rows[i].DepositTransactionID = nil
		rows[i].Qualification = nil
	}
	writeTable(w, total, rows)
}

func (a *API) getAdminTutor(w http.ResponseWriter, r *http.Request) {
	tutorID, ok := positivePathID(w, r, "tutorID", "家教编号")
	if !ok {
		return
	}
	var tutor web.AdminTutor
	err := a.db.WithContext(r.Context()).Table("t_tutor_info").
		Where("tutor_id = ? AND COALESCE(del_flag, '0') = '0'", tutorID).Take(&tutor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(w, http.StatusNotFound, "家教信息不存在")
		return
	}
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if err := a.attachAdminTutorQualifications(r, []web.AdminTutor{tutor}); err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeSuccess(w, "查询成功", tutor)
}

func (a *API) auditAdminTutor(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TutorID     uint64  `json:"tutorId"`
		AuditStatus string  `json:"auditStatus"`
		AuditRemark *string `json:"auditRemark"`
	}
	if !decodeJSON(w, r, &body) || body.TutorID == 0 {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	if body.AuditStatus != "1" && body.AuditStatus != "2" {
		writeAPIError(w, http.StatusBadRequest, "审核结果只能是通过或拒绝")
		return
	}
	if body.AuditRemark != nil && utf8.RuneCountInString(*body.AuditRemark) > 2000 {
		writeAPIError(w, http.StatusBadRequest, "审核备注过长")
		return
	}
	principal, _ := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	actor := ""
	if principal != nil {
		actor = principal.Username
	}
	actionFields := []any{"target_id", body.TutorID, "result", body.AuditStatus}
	var changedRows int64
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		result := tx.Table("t_tutor_info").
			Where("tutor_id = ? AND COALESCE(del_flag, '0') = '0'", body.TutorID).
			Updates(map[string]any{"audit_status": body.AuditStatus, "audit_time": time.Now().UTC(), "audit_remark": body.AuditRemark, "update_time": time.Now().UTC(), "update_by": actor})
		if result.Error != nil {
			return result.Error
		}
		changedRows = result.RowsAffected
		if changedRows == 0 {
			return nil
		}
		return a.persistAdminAction(tx, r, "tutor.audit", actionFields...)
	})
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if changedRows == 0 {
		writeAPIError(w, http.StatusNotFound, "家教信息不存在")
		return
	}
	a.recordAdminAction(r, "tutor.audit", actionFields...)
	message := "已通过"
	if body.AuditStatus == "2" {
		message = "已拒绝"
	}
	writeSuccess(w, message, nil)
}

func (a *API) deleteAdminTutors(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.PathValue("tutorIDs"), ",")
	if len(parts) == 0 || len(parts) > 100 {
		writeAPIError(w, http.StatusBadRequest, "家教编号数量不合法")
		return
	}
	ids := make([]uint64, 0, len(parts))
	seen := make(map[uint64]struct{}, len(parts))
	for _, part := range parts {
		id, err := strconv.ParseUint(strings.TrimSpace(part), 10, 64)
		if err != nil || id == 0 {
			writeAPIError(w, http.StatusBadRequest, "家教编号不合法")
			return
		}
		if _, exists := seen[id]; !exists {
			ids = append(ids, id)
			seen[id] = struct{}{}
		}
	}
	actionFields := []any{"target_ids", ids, "changed_rows", int64(0)}
	var changedRows int64
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		result := tx.Table("t_tutor_info").
			Where("tutor_id IN ? AND COALESCE(del_flag, '0') = '0'", ids).
			Updates(map[string]any{"del_flag": "2", "update_time": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		changedRows = result.RowsAffected
		actionFields[3] = changedRows
		if changedRows == 0 {
			return nil
		}
		return a.persistAdminAction(tx, r, "tutor.delete", actionFields...)
	})
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if changedRows == 0 {
		writeAPIError(w, http.StatusNotFound, "家教信息不存在")
		return
	}
	a.recordAdminAction(r, "tutor.delete", actionFields...)
	writeSuccess(w, "操作成功", nil)
}

func (a *API) listAdminPosts(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	var status *string
	if value := strings.TrimSpace(r.URL.Query().Get("auditStatus")); value != "" {
		if value != "0" && value != "1" && value != "2" {
			writeAPIError(w, http.StatusBadRequest, "审核状态不合法")
			return
		}
		status = &value
	}
	page, err := a.web.ListPosts(r.Context(), nil, status, pageNum, pageSize)
	if err != nil {
		var business *web.Error
		if errors.As(err, &business) {
			writeAPIError(w, business.Status, business.Message)
			return
		}
		a.adminDatabaseError(w, err)
		return
	}
	writeTable(w, page.Total, page.Rows)
}

func (a *API) countPendingAdminPosts(w http.ResponseWriter, r *http.Request) {
	var count int64
	if err := a.db.WithContext(r.Context()).Model(&web.UserPost{}).
		Where("audit_status = ? AND del_flag = ?", "0", "0").Count(&count).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeSuccess(w, "查询成功", count)
}

func (a *API) auditAdminPost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PostID      uint64  `json:"postId"`
		AuditStatus string  `json:"auditStatus"`
		AuditRemark *string `json:"auditRemark"`
	}
	if !decodeJSON(w, r, &body) || body.PostID == 0 {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	if body.AuditStatus != "1" && body.AuditStatus != "2" {
		writeAPIError(w, http.StatusBadRequest, "审核结果只能是通过或拒绝")
		return
	}
	if body.AuditRemark != nil && utf8.RuneCountInString(*body.AuditRemark) > 255 {
		writeAPIError(w, http.StatusBadRequest, "审核备注不能超过 255 个字符")
		return
	}
	actionFields := []any{"target_id", body.PostID, "result", body.AuditStatus}
	var changedRows int64
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&web.UserPost{}).
			Where("post_id = ? AND del_flag = ?", body.PostID, "0").
			Updates(map[string]any{"audit_status": body.AuditStatus, "audit_remark": body.AuditRemark, "audit_time": time.Now().UTC(), "update_time": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		changedRows = result.RowsAffected
		if changedRows == 0 {
			return nil
		}
		return a.persistAdminAction(tx, r, "user_post.audit", actionFields...)
	})
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if changedRows == 0 {
		writeAPIError(w, http.StatusNotFound, "帖子不存在")
		return
	}
	a.recordAdminAction(r, "user_post.audit", actionFields...)
	message := "已通过"
	if body.AuditStatus == "2" {
		message = "已拒绝"
	}
	writeSuccess(w, "操作成功", message)
}

func (a *API) listAdminCustomerAccounts(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	query := a.db.WithContext(r.Context()).Model(&web.CustomerAccount{})
	params := r.URL.Query()
	for _, field := range []struct{ name, column string }{{"role", "role"}, {"status", "status"}} {
		if value := strings.TrimSpace(params.Get(field.name)); value != "" {
			if field.name == "role" && value != "TEACHER" && value != "STUDENT" {
				writeAPIError(w, http.StatusBadRequest, "账号身份不合法")
				return
			}
			if field.name == "status" && value != "0" && value != "1" {
				writeAPIError(w, http.StatusBadRequest, "账号状态不合法")
				return
			}
			query = query.Where(field.column+" = ?", value)
		}
	}
	for _, field := range []struct{ name, column string }{{"email", "email"}, {"nickname", "nickname"}} {
		if value := strings.TrimSpace(params.Get(field.name)); value != "" {
			if utf8.RuneCountInString(value) > 128 {
				writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
				return
			}
			query = query.Where(field.column+" ILIKE ? ESCAPE '\\'", adminLikeContains(value))
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	rows := make([]web.CustomerAccount, 0)
	if err := query.Order("create_time DESC NULLS LAST, account_id DESC").Offset((pageNum - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeTable(w, total, rows)
}

func (a *API) getAdminCustomerAccount(w http.ResponseWriter, r *http.Request) {
	accountID, ok := positivePathID(w, r, "accountID", "账号编号")
	if !ok {
		return
	}
	var account web.CustomerAccount
	err := a.db.WithContext(r.Context()).First(&account, "account_id = ?", accountID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(w, http.StatusNotFound, "账号不存在")
		return
	}
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeSuccess(w, "查询成功", account)
}

func (a *API) updateAdminCustomerAccountStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccountID uint64 `json:"accountId"`
		Status    string `json:"status"`
	}
	if !decodeJSON(w, r, &body) || body.AccountID == 0 || (body.Status != "0" && body.Status != "1") {
		writeAPIError(w, http.StatusBadRequest, "请求参数格式不正确")
		return
	}
	actionFields := []any{"target_id", body.AccountID, "status", body.Status}
	var changedRows int64
	var accountExists bool
	err := a.db.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&web.CustomerAccount{}).
			Where("account_id = ?", body.AccountID).Update("status", body.Status)
		if result.Error != nil {
			return result.Error
		}
		changedRows = result.RowsAffected
		accountExists = changedRows > 0
		if changedRows == 0 {
			var count int64
			if err := tx.Model(&web.CustomerAccount{}).Where("account_id = ?", body.AccountID).Count(&count).Error; err != nil {
				return err
			}
			accountExists = count > 0
			return nil
		}
		return a.persistAdminAction(tx, r, "customer_account.status", actionFields...)
	})
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	if !accountExists {
		writeAPIError(w, http.StatusNotFound, "账号不存在")
		return
	}
	if changedRows > 0 {
		a.recordAdminAction(r, "customer_account.status", actionFields...)
	}
	message := "账号已启用"
	if body.Status == "1" {
		message = "账号已停用"
	}
	writeSuccess(w, message, nil)
}

func (a *API) attachAdminTutorQualifications(r *http.Request, tutors []web.AdminTutor) error {
	if len(tutors) == 0 {
		return nil
	}
	ids := make([]uint64, 0, len(tutors))
	for i := range tutors {
		ids = append(ids, tutors[i].TutorID)
	}
	var qualifications []web.AdminTutorQualification
	err := a.db.WithContext(r.Context()).Raw(`
SELECT DISTINCT ON (tutor_id)
       qualification_id, tutor_id, teacher_certificate, teaching_experience,
       character_intro, honor_images, other_advantage, resume_url, create_time, update_time
FROM t_tutor_qualification
WHERE tutor_id IN ?
ORDER BY tutor_id, qualification_id DESC`, ids).Scan(&qualifications).Error
	if err != nil {
		return err
	}
	byTutor := make(map[uint64]*web.AdminTutorQualification, len(qualifications))
	for i := range qualifications {
		q := qualifications[i]
		byTutor[q.TutorID] = &q
	}
	for i := range tutors {
		tutors[i].Qualification = byTutor[tutors[i].TutorID]
	}
	return nil
}

func adminPageQuery(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	parse := func(name string, fallback int) (int, error) {
		value := strings.TrimSpace(r.URL.Query().Get(name))
		if value == "" {
			return fallback, nil
		}
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			return 0, fmt.Errorf("invalid %s", name)
		}
		return parsed, nil
	}
	pageNum, err := parse("pageNum", 1)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "分页参数不合法")
		return 0, 0, false
	}
	pageSize, err := parse("pageSize", 10)
	if err != nil || pageSize > 100 || pageNum > int(^uint(0)>>1)/pageSize {
		writeAPIError(w, http.StatusBadRequest, "分页参数超出范围")
		return 0, 0, false
	}
	return pageNum, pageSize, true
}

func adminLikeContains(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "%", `\%`)
	value = strings.ReplaceAll(value, "_", `\_`)
	return "%" + value + "%"
}

func parseAdminTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, errors.New("invalid time")
}

func (a *API) adminDatabaseError(w http.ResponseWriter, err error) {
	a.logger.Error("admin query failed", "error_type", fmt.Sprintf("%T", err))
	writeAPIError(w, http.StatusInternalServerError, "服务暂时不可用")
}
