package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/tsdlmx/tutor-platform/tutor-api/internal/database"
)

const batchSize = 500

var identifierPattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

type tableSpec struct {
	name          string
	primaryKey    string
	required      []string
	excluded      []string
	resetSequence bool
}

var importTables = []tableSpec{
	// Admin passwords stay in MySQL; Go uses Java-issued sessions during the transition.
	{name: "sys_user", primaryKey: "user_id", required: []string{"user_id", "user_name", "status", "del_flag"}, excluded: []string{"password"}},
	{name: "sys_role", primaryKey: "role_id", required: []string{"role_id", "role_key", "status", "del_flag"}},
	{name: "sys_user_role", primaryKey: "user_id", required: []string{"user_id", "role_id"}},
	{name: "sys_role_menu", primaryKey: "role_id", required: []string{"role_id", "menu_id"}},
	{name: "sys_dept", primaryKey: "dept_id", required: []string{"dept_id", "parent_id", "ancestors", "dept_name", "status"}},
	{name: "sys_role_dept", primaryKey: "role_id", required: []string{"role_id", "dept_id"}},
	{name: "sys_menu", primaryKey: "menu_id", required: []string{"menu_id", "status", "perms"}},
	{name: "sys_oper_log", primaryKey: "oper_id", required: []string{"oper_id", "title", "business_type", "oper_time"}, excluded: []string{"oper_param", "json_result", "error_msg"}, resetSequence: true},
	{name: "t_customer_account", primaryKey: "account_id", required: []string{"account_id", "email", "password"}, resetSequence: true},
	{name: "t_teacher_profile", primaryKey: "account_id", required: []string{"account_id"}},
	{name: "t_student_demand", primaryKey: "demand_id", required: []string{"demand_id", "student_id", "title"}, resetSequence: true},
	{name: "t_demand_apply", primaryKey: "apply_id", required: []string{"apply_id", "demand_id", "teacher_id"}, resetSequence: true},
	{name: "t_user_post", primaryKey: "post_id", required: []string{"post_id", "account_id", "content", "audit_status"}, resetSequence: true},
	{name: "t_tutor_info", primaryKey: "tutor_id", required: []string{"tutor_id", "subject_names"}, resetSequence: true},
	{name: "t_tutor_qualification", primaryKey: "qualification_id", required: []string{"qualification_id", "tutor_id"}, resetSequence: true},
	{name: "t_parent_info", primaryKey: "parent_id", required: []string{"parent_id", "parent_no"}},
	{name: "t_wx_user", primaryKey: "user_id", required: []string{"user_id", "status", "del_flag"}},
}

func main() {
	apply := flag.Bool("apply", false, "write the preflighted legacy rows to the empty PostgreSQL tables")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(*apply); err != nil {
		logger.Error("legacy import stopped", "error_type", fmt.Sprintf("%T", err))
		fmt.Fprintln(os.Stderr, "legacy import stopped; no completion was confirmed")
		os.Exit(1)
	}
}

func run(apply bool) error {
	legacyDSN := strings.TrimSpace(os.Getenv("LEGACY_MYSQL_DSN"))
	if legacyDSN == "" {
		return errors.New("LEGACY_MYSQL_DSN is required")
	}
	postgresDSN := strings.TrimSpace(os.Getenv("DATABASE_DSN"))
	if postgresDSN == "" {
		return errors.New("DATABASE_DSN is required")
	}
	legacy, err := gorm.Open(mysql.Open(legacyDSN), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return fmt.Errorf("connect to legacy MySQL: %w", err)
	}
	legacySQL, err := legacy.DB()
	if err != nil {
		return fmt.Errorf("open legacy MySQL pool: %w", err)
	}
	defer legacySQL.Close()

	target, err := database.Open(postgresDSN)
	if err != nil {
		return fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	postgresSQL, err := target.DB()
	if err != nil {
		return fmt.Errorf("open PostgreSQL pool: %w", err)
	}
	defer postgresSQL.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	var report []tableReport
	var adminCredentialReport tableReport
	var adminLoginConfigReport tableReport
	err = legacy.WithContext(ctx).Transaction(func(source *gorm.DB) error {
		var err error
		report, err = preflight(ctx, source, target)
		if err != nil {
			return err
		}
		adminCredentialReport, err = preflightAdminCredentials(ctx, source, target)
		if err != nil {
			return err
		}
		adminLoginConfigReport, err = preflightAdminLoginConfig(ctx, source, target)
		if err != nil {
			return err
		}
		if duplicates, err := countCaseFoldedEmails(ctx, source); err != nil {
			return fmt.Errorf("check customer email uniqueness: %w", err)
		} else if duplicates > 0 {
			return errors.New("legacy customer emails collide when compared case-insensitively; resolve duplicates before import")
		}
		if !apply {
			return nil
		}
		for _, table := range report {
			if table.destinationRows != 0 {
				return fmt.Errorf("destination table %s is not empty", table.name)
			}
		}
		if adminCredentialReport.destinationRows != 0 {
			return errors.New("destination table sys_user_auth is not empty")
		}
		if adminLoginConfigReport.destinationRows != 0 {
			return errors.New("destination table sys_admin_auth_config is not empty")
		}
		return target.WithContext(ctx).Transaction(func(destination *gorm.DB) error {
			for i, spec := range importTables {
				table := report[i]
				if err := copyTable(ctx, source, destination, spec, table.columns, table.sourceRows); err != nil {
					return fmt.Errorf("copy %s: %w", spec.name, err)
				}
				if spec.resetSequence {
					if err := resetIdentitySequence(destination, spec.name, spec.primaryKey); err != nil {
						return fmt.Errorf("reset identity for %s: %w", spec.name, err)
					}
				}
			}
			for i, spec := range importTables {
				var imported int64
				if err := destination.Table(spec.name).Count(&imported).Error; err != nil {
					return fmt.Errorf("count imported rows in %s: %w", spec.name, err)
				}
				var expected int64
				for _, item := range report {
					if item.name == spec.name {
						expected = item.sourceRows
						break
					}
				}
				if imported != expected {
					return fmt.Errorf("row count mismatch for %s", spec.name)
				}
				report[i].destinationRows = imported
			}
			if err := copyAdminCredentials(ctx, source, destination, adminCredentialReport.sourceRows); err != nil {
				return fmt.Errorf("copy administrator credentials: %w", err)
			}
			if err := destination.Table("sys_user_auth").Count(&adminCredentialReport.destinationRows).Error; err != nil {
				return fmt.Errorf("count imported administrator credentials: %w", err)
			}
			if adminCredentialReport.destinationRows != adminCredentialReport.sourceRows {
				return errors.New("row count mismatch for sys_user_auth")
			}
			if err := copyAdminLoginConfig(ctx, source, destination, adminLoginConfigReport.sourceRows); err != nil {
				return fmt.Errorf("copy administrator login configuration: %w", err)
			}
			if err := destination.Table("sys_admin_auth_config").Count(&adminLoginConfigReport.destinationRows).Error; err != nil {
				return fmt.Errorf("count imported administrator login configuration: %w", err)
			}
			if adminLoginConfigReport.destinationRows != adminLoginConfigReport.sourceRows {
				return errors.New("row count mismatch for sys_admin_auth_config")
			}
			return nil
		})
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return err
	}

	if apply {
		fmt.Println("Legacy import transaction committed; imported customer Web, public tutor, admin authorization credentials and login settings, safe operation-log metadata, minimum department data-scope tables, and historical WeChat user tables. Request parameters, response bodies, and error details were excluded; existing sessions were not copied.")
	} else {
		fmt.Println("Dry run complete; no rows were written. Review the counts, excluded operation-log payload fields, and department-scope tables, then pass --apply to import into empty PostgreSQL tables.")
	}
	for _, item := range report {
		fmt.Printf("%-26s source=%d destination=%d common_columns=%d\n", item.name, item.sourceRows, item.destinationRows, len(item.columns))
	}
	fmt.Printf("%-26s source=%d destination=%d common_columns=%d\n", adminCredentialReport.name, adminCredentialReport.sourceRows, adminCredentialReport.destinationRows, len(adminCredentialReport.columns))
	fmt.Printf("%-26s source=%d destination=%d common_columns=%d\n", adminLoginConfigReport.name, adminLoginConfigReport.sourceRows, adminLoginConfigReport.destinationRows, len(adminLoginConfigReport.columns))
	return nil
}

type tableReport struct {
	name            string
	sourceRows      int64
	destinationRows int64
	columns         []string
}

func preflight(ctx context.Context, source, destination *gorm.DB) ([]tableReport, error) {
	reports := make([]tableReport, 0, len(importTables))
	for _, spec := range importTables {
		if !source.Migrator().HasTable(spec.name) {
			return nil, fmt.Errorf("required legacy table %s does not exist", spec.name)
		}
		if !destination.Migrator().HasTable(spec.name) {
			return nil, fmt.Errorf("destination table %s is missing; apply versioned migrations first", spec.name)
		}
		sourceColumns, err := columnNames(source, spec.name)
		if err != nil {
			return nil, fmt.Errorf("read legacy columns for %s: %w", spec.name, err)
		}
		destinationColumns, err := columnNames(destination, spec.name)
		if err != nil {
			return nil, fmt.Errorf("read destination columns for %s: %w", spec.name, err)
		}
		sourceSet := make(map[string]struct{}, len(sourceColumns))
		for _, column := range sourceColumns {
			sourceSet[strings.ToLower(column)] = struct{}{}
		}
		for _, required := range spec.required {
			if _, ok := sourceSet[required]; !ok {
				return nil, fmt.Errorf("legacy table %s lacks required column %s", spec.name, required)
			}
		}
		destinationSet := make(map[string]struct{}, len(destinationColumns))
		for _, column := range destinationColumns {
			destinationSet[strings.ToLower(column)] = struct{}{}
		}
		for _, required := range spec.required {
			if _, ok := destinationSet[required]; !ok {
				return nil, fmt.Errorf("destination table %s lacks required column %s", spec.name, required)
			}
		}
		common := make([]string, 0, len(sourceColumns))
		for _, column := range sourceColumns {
			name := strings.ToLower(column)
			if containsColumn(spec.excluded, name) {
				continue
			}
			if _, ok := destinationSet[name]; ok {
				if !identifierPattern.MatchString(name) {
					return nil, fmt.Errorf("unsupported column identifier in %s", spec.name)
				}
				common = append(common, name)
			}
		}
		if _, ok := destinationSet[spec.primaryKey]; !ok {
			return nil, fmt.Errorf("destination table %s lacks primary key %s", spec.name, spec.primaryKey)
		}
		var sourceRows, destinationRows int64
		if err := source.WithContext(ctx).Table(spec.name).Count(&sourceRows).Error; err != nil {
			return nil, fmt.Errorf("count legacy rows in %s: %w", spec.name, err)
		}
		if err := destination.WithContext(ctx).Table(spec.name).Count(&destinationRows).Error; err != nil {
			return nil, fmt.Errorf("count destination rows in %s: %w", spec.name, err)
		}
		reports = append(reports, tableReport{name: spec.name, sourceRows: sourceRows, destinationRows: destinationRows, columns: common})
	}
	return reports, nil
}

func preflightAdminCredentials(ctx context.Context, source, destination *gorm.DB) (tableReport, error) {
	const sourceTable = "sys_user"
	const destinationTable = "sys_user_auth"
	if !source.Migrator().HasTable(sourceTable) {
		return tableReport{}, errors.New("required legacy table sys_user does not exist")
	}
	if !destination.Migrator().HasTable(destinationTable) {
		return tableReport{}, errors.New("destination table sys_user_auth is missing; apply versioned migrations first")
	}
	sourceColumns, err := columnNames(source, sourceTable)
	if err != nil {
		return tableReport{}, fmt.Errorf("read legacy administrator credential columns: %w", err)
	}
	destinationColumns, err := columnNames(destination, destinationTable)
	if err != nil {
		return tableReport{}, fmt.Errorf("read administrator credential destination columns: %w", err)
	}
	if !containsColumn(sourceColumns, "user_id") || !containsColumn(sourceColumns, "password") {
		return tableReport{}, errors.New("legacy sys_user lacks required administrator credential columns")
	}
	if !containsColumn(destinationColumns, "user_id") || !containsColumn(destinationColumns, "password_hash") {
		return tableReport{}, errors.New("destination sys_user_auth lacks required columns")
	}
	var invalidHashes int64
	if err := source.WithContext(ctx).Table(sourceTable).
		Where("password IS NULL OR CHAR_LENGTH(password) <> 60 OR LEFT(password, 4) NOT IN (?, ?, ?)", "$2a$", "$2b$", "$2y$").
		Count(&invalidHashes).Error; err != nil {
		return tableReport{}, fmt.Errorf("validate legacy administrator credential formats: %w", err)
	}
	if invalidHashes != 0 {
		return tableReport{}, errors.New("legacy administrator credentials contain unsupported password hashes")
	}
	var sourceRows, destinationRows int64
	if err := source.WithContext(ctx).Table(sourceTable).Count(&sourceRows).Error; err != nil {
		return tableReport{}, fmt.Errorf("count legacy administrator credentials: %w", err)
	}
	if err := destination.WithContext(ctx).Table(destinationTable).Count(&destinationRows).Error; err != nil {
		return tableReport{}, fmt.Errorf("count destination administrator credentials: %w", err)
	}
	return tableReport{
		name:            destinationTable,
		sourceRows:      sourceRows,
		destinationRows: destinationRows,
		columns:         []string{"user_id", "password_hash"},
	}, nil
}

func copyAdminCredentials(ctx context.Context, source, destination *gorm.DB, expected int64) error {
	rows, err := source.WithContext(ctx).Raw("SELECT `user_id`, `password` FROM `sys_user` ORDER BY `user_id`").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	batch := make([]map[string]any, 0, batchSize)
	var copied int64
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := destination.Table("sys_user_auth").CreateInBatches(batch, len(batch)).Error; err != nil {
			return err
		}
		copied += int64(len(batch))
		batch = batch[:0]
		return nil
	}
	for rows.Next() {
		var userID any
		var passwordHash any
		if err := rows.Scan(&userID, &passwordHash); err != nil {
			return err
		}
		if userID == nil || passwordHash == nil {
			return errors.New("legacy administrator credential row is incomplete")
		}
		if value, ok := passwordHash.([]byte); ok {
			passwordHash = string(value)
		}
		batch = append(batch, map[string]any{"user_id": userID, "password_hash": passwordHash})
		if len(batch) == cap(batch) {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := flush(); err != nil {
		return err
	}
	if copied != expected {
		return errors.New("legacy administrator credential row count changed during import")
	}
	return nil
}

func preflightAdminLoginConfig(ctx context.Context, source, destination *gorm.DB) (tableReport, error) {
	const sourceTable = "sys_config"
	const destinationTable = "sys_admin_auth_config"
	if !source.Migrator().HasTable(sourceTable) {
		return tableReport{}, errors.New("required legacy table sys_config does not exist")
	}
	if !destination.Migrator().HasTable(destinationTable) {
		return tableReport{}, errors.New("destination table sys_admin_auth_config is missing; apply versioned migrations first")
	}
	sourceColumns, err := columnNames(source, sourceTable)
	if err != nil {
		return tableReport{}, fmt.Errorf("read legacy login configuration columns: %w", err)
	}
	destinationColumns, err := columnNames(destination, destinationTable)
	if err != nil {
		return tableReport{}, fmt.Errorf("read login configuration destination columns: %w", err)
	}
	if !containsColumn(sourceColumns, "config_key") || !containsColumn(sourceColumns, "config_value") {
		return tableReport{}, errors.New("legacy sys_config lacks required login configuration columns")
	}
	if !containsColumn(destinationColumns, "config_key") || !containsColumn(destinationColumns, "config_value") {
		return tableReport{}, errors.New("destination sys_admin_auth_config lacks required columns")
	}
	var invalidCaptchaValues int64
	if err := source.WithContext(ctx).Table(sourceTable).
		Where("config_key = ? AND LOWER(TRIM(config_value)) NOT IN (?, ?)", "sys.account.captchaEnabled", "true", "false").
		Count(&invalidCaptchaValues).Error; err != nil {
		return tableReport{}, fmt.Errorf("validate legacy captcha configuration: %w", err)
	}
	if invalidCaptchaValues != 0 {
		return tableReport{}, errors.New("legacy captcha configuration has an unsupported value")
	}
	var oversizedBlacklistValues int64
	if err := source.WithContext(ctx).Table(sourceTable).
		Where("config_key = ? AND CHAR_LENGTH(config_value) > ?", "sys.login.blackIPList", 4096).
		Count(&oversizedBlacklistValues).Error; err != nil {
		return tableReport{}, fmt.Errorf("validate legacy login blacklist configuration: %w", err)
	}
	if oversizedBlacklistValues != 0 {
		return tableReport{}, errors.New("legacy login blacklist configuration is too long")
	}
	var sourceRows, destinationRows int64
	if err := source.WithContext(ctx).Table(sourceTable).
		Where("config_key IN ?", []string{"sys.account.captchaEnabled", "sys.login.blackIPList"}).
		Count(&sourceRows).Error; err != nil {
		return tableReport{}, fmt.Errorf("count legacy administrator login settings: %w", err)
	}
	if err := destination.WithContext(ctx).Table(destinationTable).Count(&destinationRows).Error; err != nil {
		return tableReport{}, fmt.Errorf("count destination administrator login settings: %w", err)
	}
	return tableReport{
		name:            destinationTable,
		sourceRows:      sourceRows,
		destinationRows: destinationRows,
		columns:         []string{"config_key", "config_value"},
	}, nil
}

func copyAdminLoginConfig(ctx context.Context, source, destination *gorm.DB, expected int64) error {
	rows, err := source.WithContext(ctx).Table("sys_config").
		Select("config_key, config_value").
		Where("config_key IN ?", []string{"sys.account.captchaEnabled", "sys.login.blackIPList"}).
		Order("config_key").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	items := make([]map[string]any, 0, 2)
	for rows.Next() {
		var key any
		var value any
		if err := rows.Scan(&key, &value); err != nil {
			return err
		}
		if key == nil || value == nil {
			return errors.New("legacy administrator login setting is incomplete")
		}
		if bytes, ok := key.([]byte); ok {
			key = string(bytes)
		}
		if bytes, ok := value.([]byte); ok {
			value = string(bytes)
		}
		items = append(items, map[string]any{"config_key": key, "config_value": value})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if int64(len(items)) != expected {
		return errors.New("legacy administrator login settings changed during import")
	}
	if len(items) == 0 {
		return nil
	}
	return destination.Table("sys_admin_auth_config").CreateInBatches(items, len(items)).Error
}

func containsColumn(columns []string, target string) bool {
	for _, column := range columns {
		if strings.EqualFold(column, target) {
			return true
		}
	}
	return false
}
func columnNames(db *gorm.DB, table string) ([]string, error) {
	columns, err := db.Migrator().ColumnTypes(table)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(columns))
	for _, column := range columns {
		name := column.Name()
		if !identifierPattern.MatchString(name) {
			return nil, fmt.Errorf("unsupported column identifier in %s", table)
		}
		names = append(names, name)
	}
	return names, nil
}

func countCaseFoldedEmails(ctx context.Context, source *gorm.DB) (int64, error) {
	var duplicates int64
	err := source.WithContext(ctx).Raw(`SELECT COUNT(*) FROM (
SELECT LOWER(email) FROM t_customer_account GROUP BY LOWER(email) HAVING COUNT(*) > 1
) AS duplicate_emails`).Scan(&duplicates).Error
	return duplicates, err
}

func copyTable(ctx context.Context, source, destination *gorm.DB, spec tableSpec, columns []string, expected int64) error {
	quotedColumns := make([]string, len(columns))
	for i, column := range columns {
		quotedColumns[i] = "`" + column + "`"
	}
	query := "SELECT " + strings.Join(quotedColumns, ", ") + " FROM `" + spec.name + "` ORDER BY `" + spec.primaryKey + "`"
	rows, err := source.WithContext(ctx).Raw(query).Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	batch := make([]map[string]any, 0, batchSize)
	var copied int64
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := destination.Table(spec.name).CreateInBatches(batch, len(batch)).Error; err != nil {
			return err
		}
		copied += int64(len(batch))
		batch = batch[:0]
		return nil
	}
	for rows.Next() {
		values := make([]any, len(columns))
		scanTargets := make([]any, len(columns))
		for i := range values {
			scanTargets[i] = &values[i]
		}
		if err := rows.Scan(scanTargets...); err != nil {
			return err
		}
		item := make(map[string]any, len(columns))
		for i, column := range columns {
			if bytes, ok := values[i].([]byte); ok {
				item[column] = string(bytes)
			} else {
				item[column] = values[i]
			}
		}
		batch = append(batch, item)
		if len(batch) == cap(batch) {
			if err := flush(); err != nil {
				return err
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := flush(); err != nil {
		return err
	}
	if copied != expected {
		return errors.New("source row count changed during import")
	}
	return nil
}

func resetIdentitySequence(destination *gorm.DB, table, column string) error {
	if !identifierPattern.MatchString(table) || !identifierPattern.MatchString(column) {
		return errors.New("invalid identity identifier")
	}
	query := fmt.Sprintf(`SELECT setval(pg_get_serial_sequence('%s', '%s'), COALESCE(MAX("%s"), 1), COUNT(*) > 0) FROM "%s"`, table, column, column, table)
	var sequenceValue int64
	return destination.Raw(query).Scan(&sequenceValue).Error
}
