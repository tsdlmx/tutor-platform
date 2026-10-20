package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"gorm.io/gorm"
)

func (a *API) listAdminWxUsers(w http.ResponseWriter, r *http.Request) {
	pageNum, pageSize, ok := adminPageQuery(w, r)
	if !ok {
		return
	}
	query := a.db.WithContext(r.Context()).Table("t_wx_user AS wu").
		Joins("LEFT JOIN t_parent_info AS pi ON pi.parent_id = wu.parent_id").
		Joins("LEFT JOIN t_tutor_info AS ti ON ti.tutor_id = wu.tutor_id").
		Where("COALESCE(wu.del_flag, '0') = '0'")

	for _, field := range []struct{ name, column string }{
		{"nickname", "wu.nickname"},
		{"phone", "wu.phone"},
	} {
		if value := strings.TrimSpace(r.URL.Query().Get(field.name)); value != "" {
			if utf8.RuneCountInString(value) > 128 {
				writeAPIError(w, http.StatusBadRequest, "筛选条件过长")
				return
			}
			query = query.Where(field.column+" ILIKE ? ESCAPE '\\'", adminLikeContains(value))
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("userType")); value != "" {
		if value != "parent" && value != "teacher" {
			writeAPIError(w, http.StatusBadRequest, "用户类型不合法")
			return
		}
		query = query.Where("wu.user_type = ?", value)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("status")); value != "" {
		if value != "0" && value != "1" {
			writeAPIError(w, http.StatusBadRequest, "用户状态不合法")
			return
		}
		query = query.Where("wu.status = ?", value)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	rows := make([]web.AdminWxUserListItem, 0)
	err := query.Select("wu.user_id, wu.openid, wu.nickname, wu.avatar, wu.phone, wu.user_type, pi.parent_no, ti.tutor_no, wu.status, wu.last_login_time, wu.points, wu.avg_rating, wu.total_evaluations").
		Order("wu.create_time DESC NULLS LAST, wu.user_id DESC").
		Offset((pageNum - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeTable(w, total, rows)
}

func (a *API) getAdminWxUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := positivePathID(w, r, "userID", "微信用户编号")
	if !ok {
		return
	}
	var user web.AdminWxUser
	err := a.db.WithContext(r.Context()).Table("t_wx_user AS wu").
		Select("wu.user_id, wu.openid, wu.unionid, wu.inviter_id, wu.nickname, wu.avatar, wu.gender, wu.phone, wu.user_type, wu.parent_id, wu.tutor_id, pi.parent_no, ti.tutor_no, wu.status, wu.del_flag, wu.last_login_time, wu.points, wu.avg_rating, wu.total_evaluations, wu.create_time, wu.update_time, wu.remark").
		Joins("LEFT JOIN t_parent_info AS pi ON pi.parent_id = wu.parent_id").
		Joins("LEFT JOIN t_tutor_info AS ti ON ti.tutor_id = wu.tutor_id").
		Where("wu.user_id = ? AND COALESCE(wu.del_flag, '0') = '0'", userID).
		Take(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		writeAPIError(w, http.StatusNotFound, "微信用户不存在")
		return
	}
	if err != nil {
		a.adminDatabaseError(w, err)
		return
	}
	writeSuccess(w, "查询成功", user)
}
