#!/usr/bin/env bash
# ============================================================================
# 9) 停止全部服务（Go Web API / 前端 / Redis / MySQL）
#    Java 后端已移除。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "停止全部服务"

# 前端 / Go API / Redis：按 pid 杀整个进程组，再按端口兜底清理
stop_one web "$WEB_PORT"
stop_one go-api "$GO_API_PORT"
stop_one redis "$REDIS_PORT"

# MySQL 优先用 mysqladmin 优雅关闭（会 flush + 干净落盘）
if is_running "$PIDS/mysql.pid"; then
  "$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -P "$MYSQL_PORT" -u root -p1234 shutdown >/dev/null 2>&1 \
    && echo "  [停止] MySQL（已优雅关闭）"
  for _ in $(seq 1 30); do
    is_running "$PIDS/mysql.pid" || break
    sleep 0.5
  done
fi
stop_one mysql "$MYSQL_PORT"

echo
echo "残留检查（应为空）："
for p in "$MYSQL_PORT" "$REDIS_PORT" "$GO_API_PORT" "$WEB_PORT"; do
  ss -ltn 2>/dev/null | awk -v p=":$p\$" '$4 ~ p {print "  仍被占用: " $4}'
done
ps -eo pid,args | grep -E 'tutor-api|[n]ode_modules/\.bin/vite|[r]edis-server|mysqld' \
  | grep -v grep | grep -v 'bin-linux' || echo "  （无残留进程 ✓）"
