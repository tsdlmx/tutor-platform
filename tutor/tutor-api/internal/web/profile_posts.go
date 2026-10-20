package web

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ProfileInput struct {
	RealName       string   `json:"realName"`
	Gender         *string  `json:"gender"`
	Age            *int     `json:"age"`
	City           *string  `json:"city"`
	Education      *string  `json:"education"`
	School         *string  `json:"school"`
	Major          *string  `json:"major"`
	Subjects       *string  `json:"subjects"`
	SubjectList    []string `json:"subjectList"`
	Grades         *string  `json:"grades"`
	HourlyRate     *float64 `json:"hourlyRate"`
	ExperienceYear *int     `json:"experienceYears"`
	AvailableTime  *string  `json:"availableTime"`
	Intro          *string  `json:"intro"`
	Certificates   *string  `json:"certificates"`
	Contact        *string  `json:"contact"`
}

type AccountBrief struct {
	AccountID   uint64     `json:"accountId"`
	Email       *string    `json:"email,omitempty"`
	Nickname    *string    `json:"nickname"`
	Role        *string    `json:"role"`
	CreatedAt   *time.Time `json:"createTime"`
	LastLoginAt *time.Time `json:"lastLoginTime,omitempty"`
}

type ProfilePayload struct {
	Account   AccountBrief    `json:"account"`
	Profile   *TeacherProfile `json:"profile"`
	PostCount int64           `json:"postCount"`
}

type PostInput struct {
	Content   string   `json:"content"`
	ImageList []string `json:"imageList"`
}

func (s *Service) SaveTeacherProfile(ctx context.Context, accountID uint64, input ProfileInput) (TeacherProfile, error) {
	realName := strings.TrimSpace(input.RealName)
	if realName == "" {
		return TeacherProfile{}, businessError(400, "请填写真实姓名")
	}
	if utf8.RuneCountInString(realName) > 64 {
		return TeacherProfile{}, businessError(400, "真实姓名不能超过 64 个字符")
	}
	now := time.Now().UTC()
	values := map[string]any{"real_name": realName, "update_time": now}
	addString := func(column string, value *string, max int) error {
		if value == nil {
			return nil
		}
		cleaned := strings.TrimSpace(*value)
		if max > 0 && utf8.RuneCountInString(cleaned) > max {
			return businessError(400, column+"长度超出限制")
		}
		values[column] = cleaned
		return nil
	}
	for _, field := range []struct {
		column string
		value  *string
		max    int
	}{
		{"gender", input.Gender, 1}, {"city", input.City, 64}, {"education", input.Education, 32},
		{"school", input.School, 128}, {"major", input.Major, 128}, {"grades", input.Grades, 255},
		{"available_time", input.AvailableTime, 255}, {"contact", input.Contact, 128},
	} {
		if err := addString(field.column, field.value, field.max); err != nil {
			return TeacherProfile{}, err
		}
	}
	for _, field := range []struct {
		column string
		value  *string
	}{
		{"intro", input.Intro}, {"certificates", input.Certificates},
	} {
		if err := addString(field.column, field.value, 0); err != nil {
			return TeacherProfile{}, err
		}
	}
	if input.Age != nil {
		if *input.Age < 0 || *input.Age > 120 {
			return TeacherProfile{}, businessError(400, "年龄不合法")
		}
		values["age"] = *input.Age
	}
	if gender, ok := values["gender"].(string); ok && gender != "0" && gender != "1" && gender != "2" {
		return TeacherProfile{}, businessError(400, "性别不合法")
	}
	if input.HourlyRate != nil {
		if *input.HourlyRate < 0 || *input.HourlyRate > 99_999_999.99 {
			return TeacherProfile{}, businessError(400, "期望时薪不合法")
		}
		values["hourly_rate"] = *input.HourlyRate
	}
	if input.ExperienceYear != nil {
		if *input.ExperienceYear < 0 || *input.ExperienceYear > 80 {
			return TeacherProfile{}, businessError(400, "教龄不合法")
		}
		values["experience_years"] = *input.ExperienceYear
	}
	if len(input.SubjectList) > 0 {
		subjects, err := normalizeSubjects(input.SubjectList, "")
		if err != nil {
			return TeacherProfile{}, err
		}
		values["subjects"] = subjects
	} else if input.Subjects != nil {
		values["subjects"] = strings.TrimSpace(*input.Subjects)
	}
	if value, ok := values["subjects"].(string); ok && utf8.RuneCountInString(value) > 255 {
		return TeacherProfile{}, businessError(400, "可授科目过长")
	}
	insertValues := make(map[string]any, len(values)+2)
	for key, value := range values {
		insertValues[key] = value
	}
	insertValues["account_id"] = accountID
	insertValues["create_time"] = now
	updateValues := make(map[string]any, len(values))
	for key, value := range values {
		updateValues[key] = value
	}
	if err := s.db.WithContext(ctx).Table("t_teacher_profile").Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "account_id"}},
		DoUpdates: clause.Assignments(updateValues),
	}).Create(&insertValues).Error; err != nil {
		return TeacherProfile{}, fmt.Errorf("save teacher profile: %w", err)
	}
	return s.GetTeacherProfile(ctx, accountID)
}

func (s *Service) GetTeacherProfile(ctx context.Context, accountID uint64) (TeacherProfile, error) {
	var profile TeacherProfile
	err := s.db.WithContext(ctx).First(&profile, "account_id = ?", accountID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return TeacherProfile{}, businessError(404, "简历不存在")
	}
	if err != nil {
		return TeacherProfile{}, fmt.Errorf("get teacher profile: %w", err)
	}
	profile.SubjectList = splitCSV(profile.Subjects)
	return profile, nil
}

func (s *Service) BuildProfilePayload(ctx context.Context, accountID uint64, includeEmail bool) (ProfilePayload, error) {
	var account CustomerAccount
	if err := s.db.WithContext(ctx).First(&account, "account_id = ?", accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProfilePayload{}, businessError(404, "账号不存在")
		}
		return ProfilePayload{}, fmt.Errorf("get profile account: %w", err)
	}
	brief := AccountBrief{
		AccountID: account.AccountID, Nickname: account.Nickname, Role: account.Role,
		CreatedAt: account.CreatedAt, LastLoginAt: account.LastLoginAt,
	}
	if includeEmail {
		brief.Email = &account.Email
	}
	var profile *TeacherProfile
	if account.Role != nil && *account.Role == "TEACHER" {
		loaded, err := s.GetTeacherProfile(ctx, accountID)
		if err == nil {
			profile = &loaded
		} else {
			var missing *Error
			if !errors.As(err, &missing) || missing.Status != 404 {
				return ProfilePayload{}, err
			}
		}
	}
	var postCount int64
	if err := s.db.WithContext(ctx).Model(&UserPost{}).Where("account_id = ? AND del_flag = ? AND audit_status = ?", accountID, "0", "1").Count(&postCount).Error; err != nil {
		return ProfilePayload{}, fmt.Errorf("count approved profile posts: %w", err)
	}
	return ProfilePayload{Account: brief, Profile: profile, PostCount: postCount}, nil
}

func (s *Service) ListPosts(ctx context.Context, accountID *uint64, auditStatus *string, pageNum, pageSize int) (Page[UserPost], error) {
	pageNum, pageSize, err := normalizePage(pageNum, pageSize)
	if err != nil {
		return Page[UserPost]{}, err
	}
	query := s.db.WithContext(ctx).Table("t_user_post AS p").
		Joins("LEFT JOIN t_customer_account AS a ON a.account_id = p.account_id").
		Where("p.del_flag = ?", "0")
	if accountID != nil {
		query = query.Where("p.account_id = ?", *accountID)
	}
	if auditStatus != nil && *auditStatus != "" {
		query = query.Where("p.audit_status = ?", *auditStatus)
	}
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return Page[UserPost]{}, fmt.Errorf("count user posts: %w", err)
	}
	rows := make([]UserPost, 0)
	err = query.Select("p.post_id, p.account_id, p.content, p.images, p.audit_status, p.audit_remark, p.audit_time, p.del_flag, p.create_time, p.update_time, COALESCE(a.nickname, CONCAT(LEFT(a.email, 3), '***')) AS author_name, a.role AS author_role").
		Order("p.create_time DESC NULLS LAST, p.post_id DESC").Offset((pageNum - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	if err != nil {
		return Page[UserPost]{}, fmt.Errorf("list user posts: %w", err)
	}
	for i := range rows {
		rows[i].ImageList = splitCSV(rows[i].Images)
	}
	return Page[UserPost]{Total: total, Rows: rows}, nil
}

func (s *Service) PublishPost(ctx context.Context, accountID uint64, input PostInput) (UserPost, error) {
	content := strings.TrimSpace(input.Content)
	if content == "" {
		return UserPost{}, businessError(400, "说点什么再发布吧")
	}
	if utf8.RuneCountInString(content) > 1000 {
		return UserPost{}, businessError(400, "内容不能超过 1000 字")
	}
	images := make([]string, 0, len(input.ImageList))
	for _, raw := range input.ImageList {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if !safeImageReference(value) {
			return UserPost{}, businessError(400, "图片地址只支持 HTTPS 或站内相对路径")
		}
		images = append(images, value)
	}
	imagesString := strings.Join(images, ",")
	if len(imagesString) > 1000 {
		return UserPost{}, businessError(400, "图片地址总长度超出限制")
	}
	var imageValue *string
	if imagesString != "" {
		imageValue = &imagesString
	}
	var account CustomerAccount
	if err := s.db.WithContext(ctx).Select("account_id", "email", "nickname", "role").First(&account, "account_id = ?", accountID).Error; err != nil {
		return UserPost{}, fmt.Errorf("load post author: %w", err)
	}
	authorName := ""
	if account.Nickname != nil && strings.TrimSpace(*account.Nickname) != "" {
		authorName = strings.TrimSpace(*account.Nickname)
	} else {
		runes := []rune(account.Email)
		if len(runes) > 3 {
			authorName = string(runes[:3]) + "***"
		} else {
			authorName = "***"
		}
	}
	post := UserPost{AccountID: accountID, Content: content, Images: imageValue, AuditStatus: "0", DeletedFlag: "0", ImageList: images, AuthorName: &authorName, AuthorRole: account.Role}
	if err := s.db.WithContext(ctx).Create(&post).Error; err != nil {
		return UserPost{}, fmt.Errorf("publish user post: %w", err)
	}
	return post, nil
}

func (s *Service) DeleteOwnPost(ctx context.Context, accountID, postID uint64) error {
	result := s.db.WithContext(ctx).Model(&UserPost{}).
		Where("post_id = ? AND account_id = ? AND del_flag = ?", postID, accountID, "0").
		Updates(map[string]any{"del_flag": "2", "update_time": time.Now().UTC()})
	if result.Error != nil {
		return fmt.Errorf("delete user post: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return businessError(404, "帖子不存在或不属于你")
	}
	return nil
}

func splitCSV(value *string) []string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return []string{}
	}
	parts := strings.FieldsFunc(*value, func(r rune) bool { return r == ',' || r == '，' })
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if cleaned := strings.TrimSpace(part); cleaned != "" {
			result = append(result, cleaned)
		}
	}
	return result
}

func safeImageReference(value string) bool {
	if strings.ContainsAny(value, "\r\n,") || len(value) > 400 {
		return false
	}
	if strings.HasPrefix(value, "/") {
		return !strings.HasPrefix(value, "//") && !strings.Contains(value, "\\")
	}
	parsed, err := url.ParseRequestURI(value)
	return err == nil && parsed.Host != "" && parsed.User == nil && strings.EqualFold(parsed.Scheme, "https")
}
