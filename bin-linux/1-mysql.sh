#!/usr/bin/env bash
# ============================================================================
# 1) 启动 MySQL（端口 3307）
# 首次运行会自动初始化 data/mysql-data 并建库、导表。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "MySQL ($MYSQL_PORT)"

if is_running "$PIDS/mysql.pid"; then
  echo "  [跳过] MySQL 已在运行 (pid=$(cat "$PIDS/mysql.pid"))"
  exit 0
fi

if [ ! -d "$DATA/mysql-data/mysql" ]; then
  echo "  [初始化] 数据目录为空，执行 mysqld --initialize-insecure"
  mkdir -p "$DATA/tmp" "$DATA/mysql-data" "$DATA/mysql-files"
  if ! "$MYSQL_HOME/bin/mysqld" --defaults-file="$RUNTIME/mysql/my.cnf" \
        --initialize-insecure >"$LOGS/mysql-init.log" 2>&1; then
    echo "  [失败] 初始化失败，见 $LOGS/mysql-init.log"
    tail -20 "$LOGS/mysql-init.log"
    exit 1
  fi
  echo "  [完成] 初始化完成（root 无密码，随后由 0-start-all.sh 设置）"
fi

start_bg mysql "$LOGS/mysql.log" \
  "$MYSQL_HOME/bin/mysqld" --defaults-file="$RUNTIME/mysql/my.cnf"

if ! wait_port 127.0.0.1 "$MYSQL_PORT" 90 "MySQL 127.0.0.1:$MYSQL_PORT"; then
  echo "  --- 最后 30 行日志 ---"
  tail -30 "$LOGS/mysql-error.log" 2>/dev/null || tail -30 "$LOGS/mysql.log"
  exit 1
fi
echo "  [提示] 客户端：$MYSQL_HOME/bin/mysql -h 127.0.0.1 -P $MYSQL_PORT -u root -p"$MYSQL_ROOT_PASSWORD""
