package web

import "time"

// CustomerAccount is isolated from the admin user model by design. Password
// hashes are never serialized in an API response.
type CustomerAccount struct {
	AccountID    uint64     `gorm:"column:account_id;primaryKey;autoIncrement" json:"accountId"`
	Email        string     `gorm:"column:email;size:128;not null" json:"email"`
	PasswordHash string     `gorm:"column:password;size:100;not null" json:"-"`
	Nickname     *string    `gorm:"column:nickname;size:64" json:"nickname"`
	Role         *string    `gorm:"column:role;size:16" json:"role"`
	Status       string     `gorm:"column:status;size:1;not null;default:0" json:"status"`
	LastLoginAt  *time.Time `gorm:"column:last_login_time" json:"lastLoginTime"`
	CreatedAt    *time.Time `gorm:"column:create_time;autoCreateTime" json:"createTime"`
	UpdatedAt    *time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
}

func (CustomerAccount) TableName() string { return "t_customer_account" }

type CustomerSession struct {
	SessionKey string     `gorm:"column:session_key;primaryKey;size:32"`
	AccountID  uint64     `gorm:"column:account_id;not null;index:idx_customer_session_account"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;not null;index:idx_customer_session_expiry"`
	RevokedAt  *time.Time `gorm:"column:revoked_at"`
	CreatedAt  time.Time  `gorm:"column:create_time;autoCreateTime"`
}

func (CustomerSession) TableName() string { return "t_customer_session" }

type TeacherProfile struct {
	AccountID      uint64     `gorm:"column:account_id;primaryKey" json:"accountId"`
	RealName       *string    `gorm:"column:real_name;size:64" json:"realName"`
	Gender         string     `gorm:"column:gender;size:1;default:0" json:"gender"`
	Age            *int       `gorm:"column:age" json:"age"`
	City           *string    `gorm:"column:city;size:64" json:"city"`
	Education      *string    `gorm:"column:education;size:32" json:"education"`
	School         *string    `gorm:"column:school;size:128" json:"school"`
	Major          *string    `gorm:"column:major;size:128" json:"major"`
	Subjects       *string    `gorm:"column:subjects;size:255" json:"subjects"`
	Grades         *string    `gorm:"column:grades;size:255" json:"grades"`
	HourlyRate     *float64   `gorm:"column:hourly_rate;type:numeric(10,2)" json:"hourlyRate"`
	ExperienceYear *int       `gorm:"column:experience_years" json:"experienceYears"`
	AvailableTime  *string    `gorm:"column:available_time;size:255" json:"availableTime"`
	Intro          *string    `gorm:"column:intro;type:text" json:"intro"`
	Certificates   *string    `gorm:"column:certificates;type:text" json:"certificates"`
	Contact        *string    `gorm:"column:contact;size:128" json:"contact"`
	CreatedAt      *time.Time `gorm:"column:create_time;autoCreateTime" json:"createTime"`
	UpdatedAt      *time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
	SubjectList    []string   `gorm:"-" json:"subjectList,omitempty"`
}

func (TeacherProfile) TableName() string { return "t_teacher_profile" }

type StudentDemand struct {
	DemandID    uint64     `gorm:"column:demand_id;primaryKey;autoIncrement" json:"demandId"`
	StudentID   uint64     `gorm:"column:student_id;not null;index:idx_demand_student" json:"studentId"`
	Title       string     `gorm:"column:title;size:128;not null" json:"title"`
	Subjects    string     `gorm:"column:subjects;size:255;not null" json:"subjects"`
	Grade       *string    `gorm:"column:grade;size:32" json:"grade"`
	BudgetMin   *float64   `gorm:"column:budget_min;type:numeric(10,2)" json:"budgetMin"`
	BudgetMax   *float64   `gorm:"column:budget_max;type:numeric(10,2)" json:"budgetMax"`
	BudgetUnit  string     `gorm:"column:budget_unit;size:16;default:hour" json:"budgetUnit"`
	ClassMode   string     `gorm:"column:class_mode;size:16;default:both" json:"classMode"`
	City        *string    `gorm:"column:city;size:64" json:"city"`
	Description *string    `gorm:"column:description;type:text" json:"description"`
	Status      string     `gorm:"column:status;size:1;default:0;index:idx_demand_status" json:"status"`
	DeletedFlag string     `gorm:"column:del_flag;size:1;default:0" json:"delFlag,omitempty"`
	CreatedAt   *time.Time `gorm:"column:create_time;autoCreateTime;index:idx_demand_create" json:"createTime"`
	UpdatedAt   *time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
	SubjectList []string   `gorm:"-" json:"subjectList,omitempty"`
	StudentName *string    `gorm:"column:student_name;->" json:"studentName,omitempty"`
	StatusText  *string    `gorm:"-" json:"statusText,omitempty"`
}

func (StudentDemand) TableName() string { return "t_student_demand" }

type DemandApply struct {
	ApplyID     uint64     `gorm:"column:apply_id;primaryKey;autoIncrement" json:"applyId"`
	DemandID    uint64     `gorm:"column:demand_id;not null;uniqueIndex:uk_apply_demand_teacher;index:idx_apply_demand" json:"demandId"`
	TeacherID   uint64     `gorm:"column:teacher_id;not null;uniqueIndex:uk_apply_demand_teacher;index:idx_apply_teacher" json:"teacherId"`
	Message     *string    `gorm:"column:message;size:500" json:"message"`
	Status      string     `gorm:"column:status;size:1;not null;default:0" json:"status"`
	CreatedAt   *time.Time `gorm:"column:create_time;autoCreateTime" json:"createTime"`
	UpdatedAt   *time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
	DemandTitle *string    `gorm:"column:demand_title;->" json:"demandTitle,omitempty"`
	DemandSubj  *string    `gorm:"column:demand_subjects;->" json:"demandSubjects,omitempty"`
	DemandGrade *string    `gorm:"column:demand_grade;->" json:"demandGrade,omitempty"`
	TeacherName *string    `gorm:"column:teacher_name;->" json:"teacherName,omitempty"`
	TeacherRole *string    `gorm:"column:teacher_role;->" json:"teacherRole,omitempty"`
}

func (DemandApply) TableName() string { return "t_demand_apply" }

type UserPost struct {
	PostID      uint64     `gorm:"column:post_id;primaryKey;autoIncrement" json:"postId"`
	AccountID   uint64     `gorm:"column:account_id;not null;index:idx_post_account" json:"accountId"`
	Content     string     `gorm:"column:content;type:text;not null" json:"content"`
	Images      *string    `gorm:"column:images;size:1000" json:"images"`
	AuditStatus string     `gorm:"column:audit_status;size:1;not null;default:0;index:idx_post_audit" json:"auditStatus"`
	AuditRemark *string    `gorm:"column:audit_remark;size:255" json:"auditRemark"`
	AuditAt     *time.Time `gorm:"column:audit_time" json:"auditTime"`
	DeletedFlag string     `gorm:"column:del_flag;size:1;default:0" json:"delFlag,omitempty"`
	CreatedAt   *time.Time `gorm:"column:create_time;autoCreateTime;index:idx_post_create" json:"createTime"`
	UpdatedAt   *time.Time `gorm:"column:update_time;autoUpdateTime" json:"updateTime"`
	ImageList   []string   `gorm:"-" json:"imageList,omitempty"`
	AuthorName  *string    `gorm:"column:author_name;->" json:"authorName,omitempty"`
	AuthorRole  *string    `gorm:"column:author_role;->" json:"authorRole,omitempty"`
}

func (UserPost) TableName() string { return "t_user_post" }
