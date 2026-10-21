#!/usr/bin/env bash
# ============================================================================
# 3b) 启动 Go Web API（迁移后的后端）
# ----------------------------------------------------------------------------
# 这是当前唯一的后端，默认监听 GO_API_PORT(12501)。
#
# 配置放在 data/go-api.env（不随仓库提交），变量见 tutor/tutor-api/.env.example：
#   DATABASE_DSN / JWT_SECRET / REDIS_ADDR / REDIS_PASSWORD
#   TRUSTED_PROXY_CIDRS / PRIVACY_POLICY_VERSION　等
#
# 依赖：PostgreSQL（PG_PORT，默认 5432）、Redis、可选 go 工具链。
# 有 go 工具链就现场编译，否则要求 $RUNTIME/tutor-api 已存在。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "Go Web API ($GO_API_PORT)"

ENVFILE="$DATA/go-api.env"
if [ ! -f "$ENVFILE" ]; then
  echo "  [失败] 缺少 $ENVFILE"
  echo "         从 tutor/tutor-api/.env.example 复制一份并填入真实值；密钥不要写进仓库。"
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENVFILE"
set +a

for required in DATABASE_DSN JWT_SECRET REDIS_ADDR; do
  eval "value=\${$required:-}"
  if [ -z "$value" ]; then
    echo "  [失败] $ENVFILE 里缺少 $required"
    exit 1
  fi
done

if is_running "$PIDS/go-api.pid"; then
  echo "  [跳过] Go Web API 已在运行 (pid=$(cat "$PIDS/go-api.pid"))"
  exit 0
fi

# 前置检查：PostgreSQL / Redis 没起来的话服务会启动失败
PG_PORT="${PG_PORT:-5432}"
(exec 3<>/dev/tcp/127.0.0.1/"$PG_PORT") 2>/dev/null || { echo "  [失败] PostgreSQL($PG_PORT) 未运行"; exit 1; }
(exec 3<>/dev/tcp/127.0.0.1/"$REDIS_PORT") 2>/dev/null || { echo "  [失败] Redis($REDIS_PORT) 未运行，请先执行 2-redis.sh"; exit 1; }

SRC="$ROOT/tutor/tutor-api"
BIN="$RUNTIME/tutor-api"
MIGRATE="$RUNTIME/tutor-api-migrate"

if command -v go >/dev/null 2>&1; then
  echo "  [构建] 使用本机 go 工具链编译"
  ( cd "$SRC" && go build -trimpath -o "$BIN" ./cmd/server && go build -trimpath -o "$MIGRATE" ./cmd/migrate ) || {
    echo "  [失败] 编译失败，请检查 go 版本（go.mod 要求 toolchain go1.26.9）"
    exit 1
  }
elif [ ! -x "$BIN" ] || [ ! -x "$MIGRATE" ]; then
  echo "  [失败] 本机没有 go 工具链，且 $BIN / $MIGRATE 不存在"
  echo "         请先在构建机上执行 go build 并把两个二进制放到 $RUNTIME/"
  exit 1
fi

# 迁移是幂等的：带 advisory lock 与 checksum 校验，已应用的版本会被跳过
echo "  [迁移] 应用 PostgreSQL 版本化迁移"
if ! "$MIGRATE"; then
  echo "  [失败] 数据库迁移失败"
  exit 1
fi

require_port_free "$GO_API_PORT" "Go Web API" || exit 1

start_bg go-api "$LOGS/go-api.log" "$BIN"

if ! wait_port 127.0.0.1 "$GO_API_PORT" 60 "Go Web API 127.0.0.1:$GO_API_PORT"; then
  echo "  --- 最后 40 行日志 ---"
  tail -40 "$LOGS/go-api.log"
  exit 1
fi

# 端口可连接不等于进程健康：还要确认进程活着、依赖真的就绪
if ! is_running "$PIDS/go-api.pid"; then
  echo "  [失败] 端口 $GO_API_PORT 可连接，但进程已退出——该端口可能被别的程序占用"
  echo "  --- 最后 40 行日志 ---"
  tail -40 "$LOGS/go-api.log"
  exit 1
fi
if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS --max-time 5 "http://127.0.0.1:$GO_API_PORT/health/ready" >/dev/null; then
    echo "  [失败] /health/ready 未通过（PostgreSQL 或 Redis 不可用）"
    tail -40 "$LOGS/go-api.log"
    exit 1
  fi
  echo "  [就绪] /health/ready"
fi

echo "  [提示] 前端需把 /web-api 与 /admin-api 反代到 127.0.0.1:$GO_API_PORT"
echo "  [提示] 生产入口应使用 deploy/nginx 的配置（见 docs/DEPLOYMENT.md §5.1）"
echo "  [提示] 日志：$LOGS/go-api.log"
