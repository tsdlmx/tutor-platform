package web

import "time"

// AdminWxUserListItem contains only fields shown in the historical-user table.
type AdminWxUserListItem struct {
	UserID           uint64     `gorm:"column:user_id" json:"userId"`
	OpenID           *string    `gorm:"column:openid" json:"openid,omitempty"`
	Nickname         *string    `gorm:"column:nickname" json:"nickname,omitempty"`
	Avatar           *string    `gorm:"column:avatar" json:"avatar,omitempty"`
	Phone            *string    `gorm:"column:phone" json:"phone,omitempty"`
	UserType         *string    `gorm:"column:user_type" json:"userType,omitempty"`
	ParentNo         *string    `gorm:"column:parent_no" json:"parentNo,omitempty"`
	TutorNo          *string    `gorm:"column:tutor_no" json:"tutorNo,omitempty"`
	Status           *string    `gorm:"column:status" json:"status,omitempty"`
	LastLoginTime    *time.Time `gorm:"column:last_login_time" json:"lastLoginTime,omitempty"`
	Points           *float64   `gorm:"column:points" json:"points,omitempty"`
	AvgRating        *float64   `gorm:"column:avg_rating" json:"avgRating,omitempty"`
	TotalEvaluations *int       `gorm:"column:total_evaluations" json:"totalEvaluations,omitempty"`
}

// AdminWxUser is the authorized detail view of a historical miniapp account.
type AdminWxUser struct {
	UserID           uint64     `gorm:"column:user_id" json:"userId"`
	OpenID           *string    `gorm:"column:openid" json:"openid,omitempty"`
	UnionID          *string    `gorm:"column:unionid" json:"unionid,omitempty"`
	InviterID        *uint64    `gorm:"column:inviter_id" json:"inviterId,omitempty"`
	Nickname         *string    `gorm:"column:nickname" json:"nickname,omitempty"`
	Avatar           *string    `gorm:"column:avatar" json:"avatar,omitempty"`
	Gender           *int       `gorm:"column:gender" json:"gender,omitempty"`
	Phone            *string    `gorm:"column:phone" json:"phone,omitempty"`
	UserType         *string    `gorm:"column:user_type" json:"userType,omitempty"`
	ParentID         *uint64    `gorm:"column:parent_id" json:"parentId,omitempty"`
	TutorID          *uint64    `gorm:"column:tutor_id" json:"tutorId,omitempty"`
	ParentNo         *string    `gorm:"column:parent_no" json:"parentNo,omitempty"`
	TutorNo          *string    `gorm:"column:tutor_no" json:"tutorNo,omitempty"`
	Status           *string    `gorm:"column:status" json:"status,omitempty"`
	DeletedFlag      *string    `gorm:"column:del_flag" json:"delFlag,omitempty"`
	LastLoginTime    *time.Time `gorm:"column:last_login_time" json:"lastLoginTime,omitempty"`
	Points           *float64   `gorm:"column:points" json:"points,omitempty"`
	AvgRating        *float64   `gorm:"column:avg_rating" json:"avgRating,omitempty"`
	TotalEvaluations *int       `gorm:"column:total_evaluations" json:"totalEvaluations,omitempty"`
	CreateTime       *time.Time `gorm:"column:create_time" json:"createTime,omitempty"`
	UpdateTime       *time.Time `gorm:"column:update_time" json:"updateTime,omitempty"`
	Remark           *string    `gorm:"column:remark" json:"remark,omitempty"`
}
