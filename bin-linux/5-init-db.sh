#!/usr/bin/env bash
# ============================================================================
# 5) 初始化 / 重建数据库（端口 3307）
# 对应原 README-RUN.md 第三节「重新导入数据库」的 Linux 版本：
#   建库 tutor → 导表结构 tutor.sql → 应用补丁 → 导入演示数据
# 可重复执行（tutor.sql 自带 DROP TABLE IF EXISTS，demo-seed.sql 也幂等）。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "初始化数据库 tutor"

MYSQL_BIN="$MYSQL_HOME/bin/mysql"
SQL_DIR="$ROOT/tutor/sql"

(exec 3<>/dev/tcp/127.0.0.1/$MYSQL_PORT) 2>/dev/null || { echo "  [失败] MySQL($MYSQL_PORT) 未运行，请先执行 1-mysql.sh"; exit 1; }

# 首次初始化后 root 无密码，这里统一设置成 1234（与原 application-druid.yml 一致）
if "$MYSQL_BIN" -h 127.0.0.1 -P "$MYSQL_PORT" -u root -p1234 -e 'SELECT 1' >/dev/null 2>&1; then
  echo "  [就绪] root 密码已是 1234"
else
  echo "  [设置] 首次运行：为 root 设置密码 1234"
  # 注意：这里不能用 `if ! cmd | tail`，管道的退出码是 tail 的，会漏掉真正的失败
  PW_OUT=$("$MYSQL_BIN" -h 127.0.0.1 -P "$MYSQL_PORT" -u root --skip-password -e "
        ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '1234';
        CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '1234';
        GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
        FLUSH PRIVILEGES;" 2>&1)
  PW_RC=$?
  printf '%s\n' "$PW_OUT" | grep -v 'Using a password' | tail -3
  if [ "$PW_RC" -ne 0 ]; then
    echo "  [失败] 设置 root 密码失败（exit=$PW_RC）"
    exit 1
  fi
fi

MYSQL="$MYSQL_BIN -h 127.0.0.1 -P $MYSQL_PORT -u root -p1234 --default-character-set=utf8mb4"

echo "  [建库] CREATE DATABASE IF NOT EXISTS tutor"
$MYSQL -e "CREATE DATABASE IF NOT EXISTS tutor DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;" 2>&1 | grep -v 'Using a password' || true

echo "  [导入] sql/tutor.sql（表结构，35 张表）"
$MYSQL tutor <"$SQL_DIR/tutor.sql" 2>&1 | grep -v 'Using a password' || true

echo "  [导入] sql/patch-01-subject-names.sql（补 subject_names 列）"
$MYSQL tutor <"$SQL_DIR/patch-01-subject-names.sql" 2>&1 | grep -v 'Using a password' || true

echo "  [导入] sql/demo-seed.sql（演示数据）"
$MYSQL tutor <"$SQL_DIR/demo-seed.sql" 2>&1 | grep -v 'Using a password' || true

echo
echo "  [校验] 关键表行数"
$MYSQL --table tutor -e "
  SELECT 't_tutor_info' AS 表, COUNT(*) AS 行数 FROM t_tutor_info
  UNION ALL SELECT 't_parent_info', COUNT(*) FROM t_parent_info
  UNION ALL SELECT 't_student_info', COUNT(*) FROM t_student_info
  UNION ALL SELECT 't_wx_user', COUNT(*) FROM t_wx_user
  UNION ALL SELECT 'sys_user', COUNT(*) FROM sys_user
  UNION ALL SELECT 'sys_role', COUNT(*) FROM sys_role;" 2>&1 | grep -v 'Using a password'
echo "  [完成] 数据库 tutor 已就绪"
