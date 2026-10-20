package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

type adminDataScopeRole struct {
	RoleID    uint64
	DataScope string
}

func (a *API) applyAdminDataScope(r *http.Request, query *gorm.DB, permission, deptColumn, userColumn string) (*gorm.DB, error) {
	if (deptColumn != "u.dept_id" && deptColumn != "d.dept_id") ||
		(userColumn != "" && userColumn != "u.user_id") ||
		(deptColumn == "u.dept_id" && userColumn == "") {
		return nil, errors.New("unsupported admin data scope target")
	}
	principal, ok := r.Context().Value(adminPrincipalContextKey{}).(*adminPrincipal)
	if !ok || principal == nil {
		return nil, errors.New("admin data scope missing principal")
	}
	if principal.UserID == 1 {
		return query, nil
	}

	var roles []adminDataScopeRole
	err := a.db.WithContext(r.Context()).Raw(`
SELECT DISTINCT r.role_id, COALESCE(r.data_scope, '') AS data_scope
FROM sys_user_role ur
JOIN sys_role r ON r.role_id = ur.role_id
JOIN sys_role_menu rm ON rm.role_id = r.role_id
JOIN sys_menu m ON m.menu_id = rm.menu_id
CROSS JOIN LATERAL unnest(string_to_array(COALESCE(m.perms, ''), ',')) AS perm(value)
WHERE ur.user_id = ?
  AND r.status = '0' AND COALESCE(r.del_flag, '0') = '0'
  AND m.status = '0' AND BTRIM(perm.value) = ?`, principal.UserID, permission).Scan(&roles).Error
	if err != nil {
		return nil, err
	}

	conditions := make([]string, 0, len(roles))
	args := make([]any, 0, len(roles)+1)
	seenScopes := make(map[string]struct{}, len(roles))
	customRoleIDs := make([]uint64, 0)
	for _, role := range roles {
		switch role.DataScope {
		case "1":
			return query, nil
		case "2":
			customRoleIDs = append(customRoleIDs, role.RoleID)
		case "3":
			if _, seen := seenScopes[role.DataScope]; !seen {
				conditions = append(conditions, deptColumn+" = ?")
				args = append(args, principal.DeptID)
			}
		case "4":
			if _, seen := seenScopes[role.DataScope]; !seen {
				conditions = append(conditions, deptColumn+" IN (SELECT dept_id FROM sys_dept WHERE dept_id = ? OR ? = ANY(string_to_array(COALESCE(ancestors, ''), ',')))")
				deptID := strconv.FormatUint(principal.DeptID, 10)
				args = append(args, principal.DeptID, deptID)
			}
		case "5":
			if _, seen := seenScopes[role.DataScope]; !seen {
				if userColumn == "" {
					conditions = append(conditions, deptColumn+" = 0")
				} else {
					conditions = append(conditions, userColumn+" = ?")
					args = append(args, principal.UserID)
				}
			}
		default:
			return query.Where("1 = 0"), nil
		}
		seenScopes[role.DataScope] = struct{}{}
	}
	if len(customRoleIDs) > 0 {
		conditions = append(conditions, deptColumn+" IN (SELECT dept_id FROM sys_role_dept WHERE role_id IN ?)")
		args = append(args, customRoleIDs)
	}
	if len(conditions) == 0 {
		return query.Where("1 = 0"), nil
	}
	return query.Where("("+strings.Join(conditions, " OR ")+")", args...), nil
}
