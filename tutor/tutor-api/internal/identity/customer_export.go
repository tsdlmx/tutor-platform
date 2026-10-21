package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"gorm.io/gorm"
)

// exportRowLimit caps each collection so a single account with a very long
// history cannot produce an unbounded response.
const exportRowLimit = 5000

// CustomerDataExport is the portable copy of everything the service holds about a
// customer. It never contains other people's data: received applications carry
// only the application itself, not the applicant's identity.
type CustomerDataExport struct {
	SchemaVersion        string                      `json:"schemaVersion"`
	ExportedAt           time.Time                   `json:"exportedAt"`
	Account              web.CustomerAccount         `json:"account"`
	Consents             []CustomerExportConsent     `json:"consents"`
	TeacherProfile       *web.TeacherProfile         `json:"teacherProfile,omitempty"`
	Posts                []web.UserPost              `json:"posts"`
	Demands              []web.StudentDemand         `json:"demands"`
	ReceivedApplications []CustomerExportApplication `json:"receivedApplications"`
	SentApplications     []CustomerExportApplication `json:"sentApplications"`
	Truncated            bool                        `json:"truncated"`
}

type CustomerExportConsent struct {
	ConsentType   string    `json:"consentType"`
	PolicyVersion string    `json:"policyVersion"`
	ConsentedAt   time.Time `json:"consentedAt"`
}

// CustomerExportApplication omits the counterpart's account id on purpose.
type CustomerExportApplication struct {
	ApplyID   uint64     `json:"applyId"`
	DemandID  uint64     `json:"demandId"`
	Status    string     `json:"status"`
	Message   *string    `json:"message,omitempty"`
	CreatedAt *time.Time `json:"createTime,omitempty"`
	UpdatedAt *time.Time `json:"updateTime,omitempty"`
}

// ExportCustomerData implements the data-portability request: it returns the
// account, its consents, and every record the customer owns.
func (s *Service) ExportCustomerData(ctx context.Context, accountID uint64) (CustomerDataExport, error) {
	var account web.CustomerAccount
	if err := s.db.WithContext(ctx).First(&account, "account_id = ?", accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CustomerDataExport{}, businessError(401, "未登录或登录已过期")
		}
		return CustomerDataExport{}, fmt.Errorf("load account for export: %w", err)
	}
	account.PasswordHash = ""
	if account.Nickname == nil {
		account.Nickname = stringPointer("")
	}

	export := CustomerDataExport{
		SchemaVersion: "1",
		ExportedAt:    time.Now().UTC(),
		Account:       account,
	}

	var consents []CustomerExportConsent
	if err := s.db.WithContext(ctx).Table("t_customer_consent").
		Select("consent_type, policy_version, consented_at").
		Where("account_id = ?", accountID).
		Order("consented_at ASC").
		Scan(&consents).Error; err != nil {
		return CustomerDataExport{}, fmt.Errorf("load consents for export: %w", err)
	}
	export.Consents = consents

	var profile web.TeacherProfile
	err := s.db.WithContext(ctx).First(&profile, "account_id = ?", accountID).Error
	switch {
	case err == nil:
		export.TeacherProfile = &profile
	case errors.Is(err, gorm.ErrRecordNotFound):
	default:
		return CustomerDataExport{}, fmt.Errorf("load teacher profile for export: %w", err)
	}

	if err := s.db.WithContext(ctx).
		Where("account_id = ? AND del_flag = ?", accountID, "0").
		Order("post_id ASC").Limit(exportRowLimit).
		Find(&export.Posts).Error; err != nil {
		return CustomerDataExport{}, fmt.Errorf("load posts for export: %w", err)
	}
	if err := s.db.WithContext(ctx).
		Where("student_id = ? AND del_flag = ?", accountID, "0").
		Order("demand_id ASC").Limit(exportRowLimit).
		Find(&export.Demands).Error; err != nil {
		return CustomerDataExport{}, fmt.Errorf("load demands for export: %w", err)
	}

	received := make([]CustomerExportApplication, 0)
	if err := s.db.WithContext(ctx).Table("t_demand_apply AS a").
		Select("a.apply_id, a.demand_id, a.status, a.message, a.create_time, a.update_time").
		Joins("JOIN t_student_demand AS d ON d.demand_id = a.demand_id").
		Where("d.student_id = ?", accountID).
		Order("a.apply_id ASC").Limit(exportRowLimit).
		Scan(&received).Error; err != nil {
		return CustomerDataExport{}, fmt.Errorf("load received applications for export: %w", err)
	}
	export.ReceivedApplications = received

	sent := make([]CustomerExportApplication, 0)
	if err := s.db.WithContext(ctx).Table("t_demand_apply").
		Select("apply_id, demand_id, status, message, create_time, update_time").
		Where("teacher_id = ?", accountID).
		Order("apply_id ASC").Limit(exportRowLimit).
		Scan(&sent).Error; err != nil {
		return CustomerDataExport{}, fmt.Errorf("load sent applications for export: %w", err)
	}
	export.SentApplications = sent

	for _, length := range []int{len(export.Posts), len(export.Demands), len(received), len(sent)} {
		if length >= exportRowLimit {
			export.Truncated = true
		}
	}
	return export, nil
}

// MarshalExport renders the export as indented JSON for the download endpoint.
func (e CustomerDataExport) MarshalExport() ([]byte, error) {
	return json.MarshalIndent(e, "", "  ")
}
