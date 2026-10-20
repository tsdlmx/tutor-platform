package web

import "time"

// AdminTutor is the protected management view of a tutor record. Unlike the
// public directory projection it includes review fields needed by the existing
// admin detail drawer. It is returned only after a server-side permission check.
type AdminTutor struct {
	TutorID              uint64                   `gorm:"column:tutor_id" json:"tutorId"`
	TutorNo              *string                  `gorm:"column:tutor_no" json:"tutorNo,omitempty"`
	Province             *string                  `gorm:"column:province" json:"province,omitempty"`
	City                 *string                  `gorm:"column:city" json:"city,omitempty"`
	District             *string                  `gorm:"column:district" json:"district,omitempty"`
	Address              *string                  `gorm:"column:address" json:"address,omitempty"`
	Longitude            *float64                 `gorm:"column:longitude" json:"longitude,omitempty"`
	Latitude             *float64                 `gorm:"column:latitude" json:"latitude,omitempty"`
	NativePlace          *string                  `gorm:"column:native_place" json:"nativePlace,omitempty"`
	TutorName            *string                  `gorm:"column:tutor_name" json:"tutorName,omitempty"`
	Gender               *string                  `gorm:"column:gender" json:"gender,omitempty"`
	Age                  *int                     `gorm:"column:age" json:"age,omitempty"`
	Phone                *string                  `gorm:"column:phone" json:"phone,omitempty"`
	AvatarImages         *string                  `gorm:"column:avatar_images" json:"avatarImages,omitempty"`
	TeacherType          *string                  `gorm:"column:teacher_type" json:"teacherType,omitempty"`
	CrimeRecordCert      *string                  `gorm:"column:crime_record_cert" json:"crimeRecordCert,omitempty"`
	IDCard               *string                  `gorm:"column:id_card" json:"idCard,omitempty"`
	OpenID               *string                  `gorm:"column:openid" json:"openid,omitempty"`
	LikeCount            *int                     `gorm:"column:like_count" json:"likeCount,omitempty"`
	GradeID              *uint64                  `gorm:"column:grade_id" json:"gradeId,omitempty"`
	GradeName            *string                  `gorm:"-" json:"gradeName,omitempty"`
	University           *string                  `gorm:"column:university" json:"university,omitempty"`
	Major                *string                  `gorm:"column:major" json:"major,omitempty"`
	SubjectIDs           *string                  `gorm:"column:subject_ids" json:"subjectIds,omitempty"`
	SubjectNames         *string                  `gorm:"column:subject_names" json:"subjectNames,omitempty"`
	TutorableGradeIDs    *string                  `gorm:"column:tutorable_grade_ids" json:"tutorableGradeIds,omitempty"`
	TutorableGradeNames  *string                  `gorm:"column:tutorable_grade_names" json:"tutorableGradeNames,omitempty"`
	StudentRequire       *string                  `gorm:"column:student_require" json:"studentRequire,omitempty"`
	TeachingMode         *string                  `gorm:"column:teaching_mode" json:"teachingMode,omitempty"`
	AvailableTime        *string                  `gorm:"column:available_time" json:"availableTime,omitempty"`
	ExpectedSalary       *float64                 `gorm:"column:expected_salary" json:"expectedSalary,omitempty"`
	TrialTime            *string                  `gorm:"column:trial_time" json:"trialTime,omitempty"`
	MiddleScore          *float64                 `gorm:"column:middle_score" json:"middleScore,omitempty"`
	HighScore            *float64                 `gorm:"column:high_score" json:"highScore,omitempty"`
	Constellation        *string                  `gorm:"column:constellation" json:"constellation,omitempty"`
	ServiceCount         *int                     `gorm:"column:service_count" json:"serviceCount,omitempty"`
	AvgScore             *float64                 `gorm:"column:avg_score" json:"avgScore,omitempty"`
	Points               *int                     `gorm:"column:points" json:"points,omitempty"`
	LabHours             *int                     `gorm:"column:lab_hours" json:"labHours,omitempty"`
	DIYHours             *int                     `gorm:"column:diy_hours" json:"diyHours,omitempty"`
	AcceptMinimalist     *string                  `gorm:"column:accept_minimalist" json:"acceptMinimalist,omitempty"`
	OtherInfo            *string                  `gorm:"column:other_info" json:"otherInfo,omitempty"`
	PersonalProfile      *string                  `gorm:"column:personal_profile" json:"personalProfile,omitempty"`
	Status               *string                  `gorm:"column:status" json:"status,omitempty"`
	AuditStatus          *string                  `gorm:"column:audit_status" json:"auditStatus,omitempty"`
	AuditTime            *time.Time               `gorm:"column:audit_time" json:"auditTime,omitempty"`
	AuditRemark          *string                  `gorm:"column:audit_remark" json:"auditRemark,omitempty"`
	DeletedFlag          *string                  `gorm:"column:del_flag" json:"delFlag,omitempty"`
	DepositAmount        *float64                 `gorm:"column:deposit_amount" json:"depositAmount,omitempty"`
	DepositTransactionID *string                  `gorm:"column:deposit_transaction_id" json:"depositTransactionId,omitempty"`
	DepositStatus        *string                  `gorm:"column:deposit_status" json:"depositStatus,omitempty"`
	Qualification        *AdminTutorQualification `gorm:"-" json:"qualification,omitempty"`
	CreateBy             *string                  `gorm:"column:create_by" json:"createBy,omitempty"`
	CreateTime           *time.Time               `gorm:"column:create_time" json:"createTime,omitempty"`
	UpdateBy             *string                  `gorm:"column:update_by" json:"updateBy,omitempty"`
	UpdateTime           *time.Time               `gorm:"column:update_time" json:"updateTime,omitempty"`
	Remark               *string                  `gorm:"column:remark" json:"remark,omitempty"`
}

type AdminTutorQualification struct {
	QualificationID    uint64     `gorm:"column:qualification_id" json:"qualificationId"`
	TutorID            uint64     `gorm:"column:tutor_id" json:"tutorId"`
	TeacherCertificate *string    `gorm:"column:teacher_certificate" json:"teacherCertificate,omitempty"`
	TeachingExperience *string    `gorm:"column:teaching_experience" json:"teachingExperience,omitempty"`
	CharacterIntro     *string    `gorm:"column:character_intro" json:"characterIntro,omitempty"`
	HonorImages        *string    `gorm:"column:honor_images" json:"honorImages,omitempty"`
	OtherAdvantage     *string    `gorm:"column:other_advantage" json:"otherAdvantage,omitempty"`
	ResumeURL          *string    `gorm:"column:resume_url" json:"resumeUrl,omitempty"`
	CreateTime         *time.Time `gorm:"column:create_time" json:"createTime,omitempty"`
	UpdateTime         *time.Time `gorm:"column:update_time" json:"updateTime,omitempty"`
}
