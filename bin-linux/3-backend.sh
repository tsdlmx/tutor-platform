#!/usr/bin/env bash
# ============================================================================
# 3) 启动 Spring Boot 后端（端口 8080）
# 直接用便携包里已构建好的 tutor-admin/target/tutor-admin.jar。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

banner "后端 Spring Boot ($BACKEND_PORT)"

JAR="$ROOT/tutor/tutor-admin/target/tutor-admin.jar"
if [ ! -f "$JAR" ]; then
  echo "  [失败] 找不到 $JAR"
  exit 1
fi
if is_running "$PIDS/backend.pid"; then
  echo "  [跳过] 后端已在运行 (pid=$(cat "$PIDS/backend.pid"))"
  exit 0
fi

# 前置检查：MySQL / Redis 没起来的话，Spring 会在启动时报连接失败
(exec 3<>/dev/tcp/127.0.0.1/$MYSQL_PORT) 2>/dev/null || { echo "  [失败] MySQL($MYSQL_PORT) 未运行，请先执行 1-mysql.sh"; exit 1; }
(exec 3<>/dev/tcp/127.0.0.1/$REDIS_PORT) 2>/dev/null || { echo "  [失败] Redis($REDIS_PORT) 未运行，请先执行 2-redis.sh"; exit 1; }

cd "$ROOT/tutor" || exit 1

# 端口被别的程序占着的话，Spring 会 BindException 退出；提前报错更清楚
require_port_free "$BACKEND_PORT" "后端" || exit 1

start_bg backend "$LOGS/backend.log" \
  "$JAVA_HOME/bin/java" -jar "$JAR"

if ! wait_port 127.0.0.1 "$BACKEND_PORT" 120 "后端 127.0.0.1:$BACKEND_PORT"; then
  echo "  --- 最后 40 行日志 ---"
  tail -40 "$LOGS/backend.log"
  exit 1
fi

# 端口能连上**不等于**后端起来了：本机 8080 曾被平台 Caddy 占用，
# 探测到"端口已就绪"其实连的是 Caddy，而 Java 进程早就退出了。
# 所以必须再确认进程还活着。
if ! is_running "$PIDS/backend.pid"; then
  echo "  [失败] 端口 $BACKEND_PORT 可连接，但后端进程已退出——该端口可能被别的程序占用"
  echo "  --- 最后 40 行日志 ---"
  tail -40 "$LOGS/backend.log"
  exit 1
fi
# Swagger / Druid 已在安全加固里关掉（见 PORTING-LINUX.md §9.4），不要再往这里引导
echo "  [提示] 后端只跑接口：前端 http://$PUBLIC_IP:$WEB_PORT 会把 /prod-api 反代到这里"
echo "  [提示] 验证码测试回显开关：bash bin-linux/8-mail-echo.sh on|off|status"
