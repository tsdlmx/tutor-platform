package web

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"gorm.io/gorm"
)

type TutorDirectoryFilter struct {
	GradeID       *uint64
	Subject       string
	Constellation string
	SortBy        string
	Latitude      *float64
	Longitude     *float64
}

// TutorDirectoryRecord contains the public subset read from the legacy-aligned
// tutor table. Identity and payment fields are intentionally absent.
type TutorDirectoryRecord struct {
	TutorID             uint64               `gorm:"column:tutor_id" json:"tutorId"`
	TutorNo             *string              `gorm:"column:tutor_no" json:"tutorNo,omitempty"`
	Province            *string              `gorm:"column:province" json:"province,omitempty"`
	City                *string              `gorm:"column:city" json:"city,omitempty"`
	District            *string              `gorm:"column:district" json:"district,omitempty"`
	TutorName           *string              `gorm:"column:tutor_name" json:"tutorName,omitempty"`
	Gender              *string              `gorm:"column:gender" json:"gender,omitempty"`
	Age                 *int                 `gorm:"column:age" json:"age,omitempty"`
	Phone               *string              `gorm:"column:phone" json:"phone,omitempty"`
	AvatarImages        *string              `gorm:"column:avatar_images" json:"avatarImages,omitempty"`
	TeacherType         *string              `gorm:"column:teacher_type" json:"teacherType,omitempty"`
	GradeID             *uint64              `gorm:"column:grade_id" json:"gradeId,omitempty"`
	University          *string              `gorm:"column:university" json:"university,omitempty"`
	Major               *string              `gorm:"column:major" json:"major,omitempty"`
	SubjectNames        *string              `gorm:"column:subject_names" json:"subjectNames,omitempty"`
	TutorableGradeNames *string              `gorm:"column:tutorable_grade_names" json:"tutorableGradeNames,omitempty"`
	TeachingMode        *string              `gorm:"column:teaching_mode" json:"teachingMode,omitempty"`
	AvailableTime       *string              `gorm:"column:available_time" json:"availableTime,omitempty"`
	ExpectedSalary      *float64             `gorm:"column:expected_salary" json:"expectedSalary,omitempty"`
	TrialTime           *string              `gorm:"column:trial_time" json:"trialTime,omitempty"`
	MiddleScore         *float64             `gorm:"column:middle_score" json:"middleScore,omitempty"`
	HighScore           *float64             `gorm:"column:high_score" json:"highScore,omitempty"`
	ServiceCount        *int                 `gorm:"column:service_count" json:"serviceCount,omitempty"`
	AvgScore            *float64             `gorm:"column:avg_score" json:"avgScore,omitempty"`
	PersonalProfile     *string              `gorm:"column:personal_profile" json:"personalProfile,omitempty"`
	AuditStatus         *string              `gorm:"column:audit_status" json:"auditStatus,omitempty"`
	DepositStatus       *string              `gorm:"column:deposit_status" json:"depositStatus,omitempty"`
	Distance            *float64             `gorm:"column:distance" json:"-"`
	Qualification       *PublicQualification `gorm:"-" json:"qualification,omitempty"`
}

type PublicQualification struct {
	QualificationID    uint64  `json:"qualificationId"`
	TutorID            uint64  `json:"tutorId"`
	TeachingExperience *string `json:"teachingExperience,omitempty"`
	OtherAdvantage     *string `json:"otherAdvantage,omitempty"`
}

type tutorQualificationRow struct {
	QualificationID    uint64  `gorm:"column:qualification_id"`
	TutorID            uint64  `gorm:"column:tutor_id"`
	TeachingExperience *string `gorm:"column:teaching_experience"`
	OtherAdvantage     *string `gorm:"column:other_advantage"`
}

func (s *Service) ListPublicTutors(ctx context.Context, filter TutorDirectoryFilter) ([]TutorDirectoryRecord, error) {
	if filter.SortBy != "" && filter.SortBy != "distance" && filter.SortBy != "score" {
		return nil, businessError(400, "排序方式不合法")
	}
	if utf8RuneCount(filter.Subject) > 128 || utf8RuneCount(filter.Constellation) > 32 {
		return nil, businessError(400, "筛选条件过长")
	}
	if filter.Latitude != nil && (math.IsNaN(*filter.Latitude) || math.IsInf(*filter.Latitude, 0) || *filter.Latitude < -90 || *filter.Latitude > 90) {
		return nil, businessError(400, "纬度不合法")
	}
	if filter.Longitude != nil && (math.IsNaN(*filter.Longitude) || math.IsInf(*filter.Longitude, 0) || *filter.Longitude < -180 || *filter.Longitude > 180) {
		return nil, businessError(400, "经度不合法")
	}
	query := s.db.WithContext(ctx).Table("t_tutor_info AS t").
		Where("t.del_flag = ? AND t.status = ? AND t.audit_status = ?", "0", "0", "1")
	if filter.GradeID != nil {
		query = query.Where("? = ANY(string_to_array(replace(COALESCE(t.tutorable_grade_ids, ''), ' ', ''), ','))", fmt.Sprint(*filter.GradeID))
	}
	if subject := strings.TrimSpace(filter.Subject); subject != "" {
		query = query.Where("t.subject_names ILIKE ? ESCAPE '\\'", likeContains(subject))
	}
	if constellation := strings.TrimSpace(filter.Constellation); constellation != "" {
		query = query.Where("t.constellation = ?", constellation)
	}
	// The directory list is unauthenticated, so it deliberately omits the contact
	// number. Bulk harvesting a page of tutors must not yield their phone numbers;
	// the detail route still returns it for the explicit contact action.
	columns := "t.tutor_id, t.tutor_no, t.province, t.city, t.district, t.tutor_name, t.gender, t.age, t.avatar_images, t.teacher_type, t.grade_id, t.university, t.major, t.subject_names, t.tutorable_grade_names, t.teaching_mode, t.available_time, t.expected_salary, t.trial_time, t.middle_score, t.high_score, t.service_count, t.avg_score, t.personal_profile, t.audit_status, t.deposit_status"
	switch {
	case filter.SortBy == "distance" && filter.Latitude != nil && filter.Longitude != nil:
		query = query.Select(columns+", CASE WHEN t.latitude IS NULL OR t.longitude IS NULL THEN NULL ELSE 6371 * 2 * asin(sqrt(LEAST(1, power(sin(radians(t.latitude - ?) / 2), 2) + cos(radians(?)) * cos(radians(t.latitude)) * power(sin(radians(t.longitude - ?) / 2), 2)))) END AS distance", *filter.Latitude, *filter.Latitude, *filter.Longitude).
			Order("distance ASC NULLS LAST, t.like_count DESC NULLS LAST, t.create_time DESC NULLS LAST, t.tutor_id DESC")
	case filter.SortBy == "score":
		query = query.Select(columns).Order("t.avg_score DESC NULLS LAST, t.like_count DESC NULLS LAST, t.create_time DESC NULLS LAST, t.tutor_id DESC")
	default:
		query = query.Select(columns).Order("t.create_time DESC NULLS LAST, t.tutor_id DESC")
	}
	rows := make([]TutorDirectoryRecord, 0)
	if err := query.Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list public tutor directory: %w", err)
	}
	if len(rows) == 0 {
		return rows, nil
	}
	ids := make([]uint64, len(rows))
	for i := range rows {
		ids[i] = rows[i].TutorID
	}
	qualifications, err := s.latestPublicQualifications(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Qualification = qualifications[rows[i].TutorID]
	}
	return rows, nil
}

func (s *Service) GetPublicTutor(ctx context.Context, tutorID uint64) (TutorDirectoryRecord, error) {
	var record TutorDirectoryRecord
	err := s.db.WithContext(ctx).Table("t_tutor_info AS t").
		Select("t.tutor_id, t.tutor_no, t.province, t.city, t.district, t.tutor_name, t.gender, t.age, t.phone, t.avatar_images, t.teacher_type, t.grade_id, t.university, t.major, t.subject_names, t.tutorable_grade_names, t.teaching_mode, t.available_time, t.expected_salary, t.trial_time, t.middle_score, t.high_score, t.service_count, t.avg_score, t.personal_profile, t.audit_status, t.deposit_status").
		Where("t.tutor_id = ? AND t.del_flag = ? AND t.status = ? AND t.audit_status = ?", tutorID, "0", "0", "1").
		Take(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return TutorDirectoryRecord{}, businessError(404, "家教信息不存在或暂不可用")
	}
	if err != nil {
		return TutorDirectoryRecord{}, fmt.Errorf("get public tutor: %w", err)
	}
	qualifications, err := s.latestPublicQualifications(ctx, []uint64{tutorID})
	if err != nil {
		return TutorDirectoryRecord{}, err
	}
	record.Qualification = qualifications[tutorID]
	return record, nil
}

func (s *Service) latestPublicQualifications(ctx context.Context, tutorIDs []uint64) (map[uint64]*PublicQualification, error) {
	var records []tutorQualificationRow
	err := s.db.WithContext(ctx).Table("t_tutor_qualification").
		Select("qualification_id, tutor_id, teaching_experience, other_advantage").
		Where("tutor_id IN ?", tutorIDs).
		Order("qualification_id DESC").Find(&records).Error
	if err != nil {
		return nil, fmt.Errorf("load public tutor qualifications: %w", err)
	}
	result := make(map[uint64]*PublicQualification, len(tutorIDs))
	for _, record := range records {
		if _, exists := result[record.TutorID]; exists {
			continue
		}
		result[record.TutorID] = &PublicQualification{
			QualificationID: record.QualificationID, TutorID: record.TutorID,
			TeachingExperience: record.TeachingExperience, OtherAdvantage: record.OtherAdvantage,
		}
	}
	return result, nil
}
