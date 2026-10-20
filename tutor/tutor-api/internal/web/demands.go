package web

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

type DemandQuery struct {
	Subject  string
	Grade    string
	Keyword  string
	Status   string
	PageNum  int
	PageSize int
}

type DemandInput struct {
	Title       string   `json:"title"`
	SubjectList []string `json:"subjectList"`
	Subjects    string   `json:"subjects"`
	Grade       *string  `json:"grade"`
	BudgetMin   *float64 `json:"budgetMin"`
	BudgetMax   *float64 `json:"budgetMax"`
	BudgetUnit  string   `json:"budgetUnit"`
	ClassMode   string   `json:"classMode"`
	City        *string  `json:"city"`
	Description *string  `json:"description"`
}

type Page[T any] struct {
	Total int64 `json:"total"`
	Rows  []T   `json:"rows"`
}

type SubjectStat struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

type DemandStats struct {
	Total     int64         `json:"total"`
	Open      int64         `json:"open"`
	AvgBudget float64       `json:"avgBudget"`
	BySubject []SubjectStat `json:"bySubject"`
}

func (s *Service) ListDemands(ctx context.Context, account CustomerAccount, query DemandQuery) (Page[StudentDemand], error) {
	if account.Role == nil || (*account.Role != "TEACHER" && *account.Role != "STUDENT") {
		return Page[StudentDemand]{}, businessError(400, "请先选择你的身份（老师 / 学生）")
	}
	pageNum, pageSize, err := normalizePage(query.PageNum, query.PageSize)
	if err != nil {
		return Page[StudentDemand]{}, err
	}
	base := s.db.WithContext(ctx).Table("t_student_demand AS d").
		Joins("LEFT JOIN t_customer_account AS a ON a.account_id = d.student_id").
		Where("d.del_flag = ?", "0")
	if *account.Role == "STUDENT" {
		base = base.Where("d.student_id = ?", account.AccountID)
	} else {
		base = base.Where("d.status <> ?", "3")
	}
	if query.Status != "" {
		if !validDemandStatus(query.Status) {
			return Page[StudentDemand]{}, businessError(400, "需求状态不合法")
		}
		base = base.Where("d.status = ?", query.Status)
	}
	if value := strings.TrimSpace(query.Grade); value != "" {
		base = base.Where("d.grade ILIKE ? ESCAPE '\\'", likeContains(value))
	}
	if value := strings.TrimSpace(query.Subject); value != "" {
		base = base.Where("d.subjects ILIKE ? ESCAPE '\\'", likeContains(value))
	}
	if value := strings.TrimSpace(query.Keyword); value != "" {
		pattern := likeContains(value)
		base = base.Where("(d.title ILIKE ? ESCAPE '\\' OR d.description ILIKE ? ESCAPE '\\' OR d.city ILIKE ? ESCAPE '\\')", pattern, pattern, pattern)
	}
	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return Page[StudentDemand]{}, fmt.Errorf("count customer demands: %w", err)
	}
	rows := make([]StudentDemand, 0)
	err = base.Select("d.demand_id, d.student_id, d.title, d.subjects, d.grade, d.budget_min, d.budget_max, d.budget_unit, d.class_mode, d.city, d.description, d.status, d.del_flag, d.create_time, d.update_time, COALESCE(a.nickname, CONCAT(LEFT(a.email, 3), '***')) AS student_name").
		Order("d.create_time DESC NULLS LAST, d.demand_id DESC").Offset((pageNum - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	if err != nil {
		return Page[StudentDemand]{}, fmt.Errorf("list customer demands: %w", err)
	}
	for i := range rows {
		fillDemandView(&rows[i])
	}
	return Page[StudentDemand]{Total: total, Rows: rows}, nil
}

func (s *Service) GetDemand(ctx context.Context, demandID uint64) (StudentDemand, error) {
	var demand StudentDemand
	err := s.db.WithContext(ctx).Table("t_student_demand AS d").
		Select("d.demand_id, d.student_id, d.title, d.subjects, d.grade, d.budget_min, d.budget_max, d.budget_unit, d.class_mode, d.city, d.description, d.status, d.del_flag, d.create_time, d.update_time, COALESCE(a.nickname, CONCAT(LEFT(a.email, 3), '***')) AS student_name").
		Joins("LEFT JOIN t_customer_account AS a ON a.account_id = d.student_id").
		Where("d.demand_id = ? AND d.del_flag = ?", demandID, "0").Take(&demand).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return StudentDemand{}, businessError(404, "需求不存在")
	}
	if err != nil {
		return StudentDemand{}, fmt.Errorf("get customer demand: %w", err)
	}
	fillDemandView(&demand)
	return demand, nil
}

func (s *Service) CreateDemand(ctx context.Context, accountID uint64, input DemandInput) (StudentDemand, error) {
	demand, err := newDemand(accountID, input)
	if err != nil {
		return StudentDemand{}, err
	}
	demand.Status = "0"
	demand.DeletedFlag = "0"
	if err := s.db.WithContext(ctx).Create(&demand).Error; err != nil {
		return StudentDemand{}, fmt.Errorf("create student demand: %w", err)
	}
	return s.GetDemand(ctx, demand.DemandID)
}

func (s *Service) UpdateDemand(ctx context.Context, accountID, demandID uint64, input DemandInput) (StudentDemand, error) {
	if _, err := newDemand(accountID, input); err != nil {
		return StudentDemand{}, err
	}
	subjects, err := normalizeSubjects(input.SubjectList, input.Subjects)
	if err != nil {
		return StudentDemand{}, err
	}
	values := map[string]any{
		"title":       strings.TrimSpace(input.Title),
		"subjects":    subjects,
		"budget_unit": normalizedChoice(input.BudgetUnit, "hour"),
		"class_mode":  normalizedChoice(input.ClassMode, "both"),
		"update_time": time.Now().UTC(),
	}
	if input.BudgetMin != nil {
		values["budget_min"] = *input.BudgetMin
	}
	if input.BudgetMax != nil {
		values["budget_max"] = *input.BudgetMax
	}
	if input.Grade != nil {
		values["grade"] = strings.TrimSpace(*input.Grade)
	}
	if input.City != nil {
		values["city"] = strings.TrimSpace(*input.City)
	}
	if input.Description != nil {
		values["description"] = strings.TrimSpace(*input.Description)
	}
	result := s.db.WithContext(ctx).Model(&StudentDemand{}).
		Where("demand_id = ? AND student_id = ? AND del_flag = ?", demandID, accountID, "0").
		Updates(values)
	if result.Error != nil {
		return StudentDemand{}, fmt.Errorf("update student demand: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return StudentDemand{}, businessError(404, "需求不存在或不属于你")
	}
	return s.GetDemand(ctx, demandID)
}

func (s *Service) DeleteDemand(ctx context.Context, accountID, demandID uint64) error {
	result := s.db.WithContext(ctx).Model(&StudentDemand{}).
		Where("demand_id = ? AND student_id = ? AND del_flag = ?", demandID, accountID, "0").
		Updates(map[string]any{"del_flag": "2", "update_time": time.Now().UTC()})
	if result.Error != nil {
		return fmt.Errorf("delete student demand: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return businessError(404, "需求不存在或不属于你")
	}
	return nil
}

func (s *Service) UpdateDemandStatus(ctx context.Context, accountID, demandID uint64, status string) error {
	if !validDemandStatus(status) {
		return businessError(400, "状态不合法")
	}
	result := s.db.WithContext(ctx).Model(&StudentDemand{}).
		Where("demand_id = ? AND student_id = ? AND del_flag = ?", demandID, accountID, "0").
		Updates(map[string]any{"status": status, "update_time": time.Now().UTC()})
	if result.Error != nil {
		return fmt.Errorf("update demand status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return businessError(400, "状态不合法，或该需求不属于你")
	}
	return nil
}

func (s *Service) ApplyToDemand(ctx context.Context, teacherID, demandID uint64, message *string) (DemandApply, error) {
	demand, err := s.GetDemand(ctx, demandID)
	if err != nil {
		var missing *Error
		if errors.As(err, &missing) && missing.Status == 404 {
			return DemandApply{}, businessError(404, "需求不存在或已删除")
		}
		return DemandApply{}, err
	}
	if demand.Status == "3" {
		return DemandApply{}, businessError(400, "该需求已取消，无法申请")
	}
	var cleanMessage *string
	if message != nil {
		value := strings.TrimSpace(*message)
		if utf8RuneCount(value) > 500 {
			return DemandApply{}, businessError(400, "留言不能超过 500 个字符")
		}
		if value != "" {
			cleanMessage = &value
		}
	}
	apply := DemandApply{DemandID: demandID, TeacherID: teacherID, Message: cleanMessage, Status: "0"}
	result := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "demand_id"}, {Name: "teacher_id"}},
		DoNothing: true,
	}).Create(&apply)
	if result.Error != nil {
		return DemandApply{}, fmt.Errorf("apply to student demand: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return DemandApply{}, businessError(400, "你已经申请过这条需求了")
	}
	return apply, nil
}

func (s *Service) AppliedDemandIDs(ctx context.Context, teacherID uint64) ([]uint64, error) {
	ids := make([]uint64, 0)
	err := s.db.WithContext(ctx).Model(&DemandApply{}).Where("teacher_id = ?", teacherID).
		Order("create_time DESC NULLS LAST, apply_id DESC").Pluck("demand_id", &ids).Error
	return ids, err
}

func (s *Service) ReceivedApplications(ctx context.Context, studentID uint64) ([]DemandApply, error) {
	rows := make([]DemandApply, 0)
	err := s.db.WithContext(ctx).Table("t_demand_apply AS ap").
		Select("ap.apply_id, ap.demand_id, ap.teacher_id, ap.message, ap.status, ap.create_time, ap.update_time, d.title AS demand_title, d.subjects AS demand_subjects, d.grade AS demand_grade, COALESCE(a.nickname, CONCAT(LEFT(a.email, 3), '***')) AS teacher_name, 'TEACHER' AS teacher_role").
		Joins("JOIN t_student_demand AS d ON d.demand_id = ap.demand_id AND d.del_flag = '0'").
		Joins("LEFT JOIN t_customer_account AS a ON a.account_id = ap.teacher_id").
		Where("d.student_id = ?", studentID).
		Order("ap.create_time DESC NULLS LAST, ap.apply_id DESC").Find(&rows).Error
	return rows, err
}

func (s *Service) DemandStats(ctx context.Context) (DemandStats, error) {
	var result DemandStats
	base := s.db.WithContext(ctx).Model(&StudentDemand{}).Where("del_flag = ? AND status <> ?", "0", "3")
	if err := base.Count(&result.Total).Error; err != nil {
		return DemandStats{}, fmt.Errorf("count demands for stats: %w", err)
	}
	if err := s.db.WithContext(ctx).Model(&StudentDemand{}).Where("del_flag = ? AND status = ?", "0", "0").Count(&result.Open).Error; err != nil {
		return DemandStats{}, fmt.Errorf("count open demands: %w", err)
	}
	var average float64
	if err := s.db.WithContext(ctx).Model(&StudentDemand{}).Select("COALESCE(ROUND(AVG(budget_max), 2), 0)").
		Where("del_flag = ? AND status <> ? AND budget_max IS NOT NULL", "0", "3").Scan(&average).Error; err != nil {
		return DemandStats{}, fmt.Errorf("calculate average demand budget: %w", err)
	}
	result.AvgBudget = average
	result.BySubject = make([]SubjectStat, 0)
	const subjectStatsSQL = `SELECT trim(split.subject_name) AS name, count(*) AS count
FROM t_student_demand
CROSS JOIN LATERAL regexp_split_to_table(subjects, '[,，]') AS split(subject_name)
WHERE del_flag = '0' AND status <> '3' AND subjects IS NOT NULL AND subjects <> ''
GROUP BY trim(split.subject_name)
HAVING trim(split.subject_name) <> ''
ORDER BY name`
	if err := s.db.WithContext(ctx).Raw(subjectStatsSQL).Scan(&result.BySubject).Error; err != nil {
		return DemandStats{}, fmt.Errorf("count subjects for demand stats: %w", err)
	}
	return result, nil
}

func newDemand(accountID uint64, input DemandInput) (StudentDemand, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return StudentDemand{}, businessError(400, "请填写需求标题")
	}
	if utf8RuneCount(title) > 128 {
		return StudentDemand{}, businessError(400, "需求标题不能超过 128 个字符")
	}
	subjects, err := normalizeSubjects(input.SubjectList, input.Subjects)
	if err != nil {
		return StudentDemand{}, err
	}
	if input.BudgetMin != nil && input.BudgetMax != nil && *input.BudgetMax < *input.BudgetMin {
		return StudentDemand{}, businessError(400, "预算上限不能小于下限")
	}
	budgetUnit := normalizedChoice(input.BudgetUnit, "hour")
	if budgetUnit != "hour" && budgetUnit != "lesson" && budgetUnit != "month" {
		return StudentDemand{}, businessError(400, "预算单位不合法")
	}
	classMode := normalizedChoice(input.ClassMode, "both")
	if classMode != "online" && classMode != "offline" && classMode != "both" {
		return StudentDemand{}, businessError(400, "授课方式不合法")
	}
	return StudentDemand{
		StudentID:   accountID,
		Title:       title,
		Subjects:    subjects,
		Grade:       cleanStringPointer(input.Grade),
		BudgetMin:   input.BudgetMin,
		BudgetMax:   input.BudgetMax,
		BudgetUnit:  budgetUnit,
		ClassMode:   classMode,
		City:        cleanStringPointer(input.City),
		Description: cleanStringPointer(input.Description),
	}, nil
}

func normalizeSubjects(list []string, raw string) (string, error) {
	values := list
	if len(values) == 0 {
		values = strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == '，' })
	}
	seen := make(map[string]struct{}, len(values))
	cleaned := make([]string, 0, len(values))
	for _, item := range values {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		cleaned = append(cleaned, value)
	}
	if len(cleaned) == 0 {
		return "", businessError(400, "请至少选择一个科目")
	}
	subjects := strings.Join(cleaned, ",")
	if utf8RuneCount(subjects) > 255 {
		return "", businessError(400, "科目内容过长")
	}
	return subjects, nil
}

func validDemandStatus(status string) bool {
	return status == "0" || status == "1" || status == "2" || status == "3"
}

func fillDemandView(demand *StudentDemand) {
	if demand == nil {
		return
	}
	demand.SubjectList = strings.FieldsFunc(demand.Subjects, func(r rune) bool { return r == ',' || r == '，' })
	for i := range demand.SubjectList {
		demand.SubjectList[i] = strings.TrimSpace(demand.SubjectList[i])
	}
	labels := map[string]string{"0": "待接单", "1": "已接单", "2": "已完成", "3": "已取消"}
	label := labels[demand.Status]
	if label == "" {
		label = "未知"
	}
	demand.StatusText = &label
}

func normalizePage(pageNum, pageSize int) (int, int, error) {
	if pageNum <= 0 {
		pageNum = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 || pageNum > math.MaxInt/pageSize {
		return 0, 0, businessError(400, "分页参数超出范围")
	}
	return pageNum, pageSize, nil
}

func likeContains(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "%", `\%`)
	value = strings.ReplaceAll(value, "_", `\_`)
	return "%" + value + "%"
}

func normalizedChoice(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func cleanStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cleaned := strings.TrimSpace(*value)
	return &cleaned
}

func utf8RuneCount(value string) int { return len([]rune(value)) }
