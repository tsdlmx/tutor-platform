package identity

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/web"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// DeleteAccount implements the customer's right to erasure. The password is
// re-checked before anything is removed, and the deletion covers every table
// that holds data about this account. Audit rows are kept: they only contain a
// masked identifier and are required for security review.
func (s *Service) DeleteAccount(ctx context.Context, accountID uint64, password, clientIP string) error {
	limitKey := clientIP + "|" + fmt.Sprint(accountID)
	if err := s.rateLimit(ctx, "delete-account", limitKey, 5, 10*time.Minute); err != nil {
		return err
	}
	var account web.CustomerAccount
	if err := s.db.WithContext(ctx).First(&account, "account_id = ?", accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return businessError(401, "未登录或登录已过期")
		}
		return fmt.Errorf("load account for deletion: %w", err)
	}
	if account.PasswordHash == "" || bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), bcryptInput(password)) != nil {
		s.recordLoginAudit(ctx, loginAuditEntry{
			ActorType:  auditActorCustomer,
			Identifier: MaskIdentifier(account.Email),
			ClientIP:   clientIP,
			Result:     auditResultFailure,
			Reason:     reasonInvalidCreds,
		})
		return businessError(400, "密码不正确")
	}

	identifier := MaskIdentifier(account.Email)
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Applications attached to demands the customer posted.
		if err := tx.Exec(`DELETE FROM t_demand_apply WHERE demand_id IN (SELECT demand_id FROM t_student_demand WHERE student_id = ?)`, accountID).Error; err != nil {
			return fmt.Errorf("delete demand applications: %w", err)
		}
		// Applications the customer made as a teacher.
		if err := tx.Exec(`DELETE FROM t_demand_apply WHERE teacher_id = ?`, accountID).Error; err != nil {
			return fmt.Errorf("delete own demand applications: %w", err)
		}
		for _, statement := range []struct {
			sql   string
			label string
		}{
			{`DELETE FROM t_student_demand WHERE student_id = ?`, "student demands"},
			{`DELETE FROM t_user_post WHERE account_id = ?`, "user posts"},
			{`DELETE FROM t_teacher_profile WHERE account_id = ?`, "teacher profile"},
			{`DELETE FROM t_customer_consent WHERE account_id = ?`, "consent records"},
			{`DELETE FROM t_customer_session WHERE account_id = ?`, "customer sessions"},
			{`DELETE FROM t_customer_account WHERE account_id = ?`, "customer account"},
		} {
			if err := tx.Exec(statement.sql, accountID).Error; err != nil {
				return fmt.Errorf("delete %s: %w", statement.label, err)
			}
		}
		return nil
	}); err != nil {
		return err
	}

	s.recordLoginAudit(ctx, loginAuditEntry{
		ActorType:  auditActorCustomer,
		Identifier: identifier,
		ClientIP:   clientIP,
		Result:     auditResultSuccess,
		Reason:     reasonSelfDeletion,
	})
	return nil
}
