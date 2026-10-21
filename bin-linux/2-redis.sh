#!/usr/bin/env bash
# ============================================================================
# 2) 启动 Redis（端口 6379）
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "Redis ($REDIS_PORT)"

if is_running "$PIDS/redis.pid"; then
  echo "  [跳过] Redis 已在运行 (pid=$(cat "$PIDS/redis.pid"))"
  exit 0
fi

require_port_free "$REDIS_PORT" "Redis" || exit 1

start_bg redis "$LOGS/redis.log" \
  "$REDIS_HOME/bin/redis-server" "$RUNTIME/redis/redis.conf"

if ! wait_port 127.0.0.1 "$REDIS_PORT" 30 "Redis 127.0.0.1:$REDIS_PORT"; then
  tail -20 "$LOGS/redis.log"
  exit 1
fi
is_running "$PIDS/redis.pid" || { echo "  [失败] Redis 进程已退出"; tail -20 "$LOGS/redis.log"; exit 1; }
if [ -n "${REDIS_PASSWORD:-}" ]; then
  echo "  [提示] 自检：$REDIS_HOME/bin/redis-cli -a \"\$REDIS_PASSWORD\" ping  →  PONG（口令取 REDIS_PASSWORD / data/secrets.env）"
else
  echo "  [提示] 自检：$REDIS_HOME/bin/redis-cli ping  →  PONG（未设置 REDIS_PASSWORD；口令文件可放 $REDIS_PASSWORD_FILE）"
fi
