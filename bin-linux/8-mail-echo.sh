#!/usr/bin/env bash
# ============================================================================
# 8) 验证码「测试回显」开关（只在跑自动化验证时开）
# ----------------------------------------------------------------------------
# 后端的 customer.mail.test-echo 默认 false：验证码只发真实邮箱，接口不返回。
# 但 tools/verify-customer-api.py / verify-customer-browser.py / verify-mobile-nav.py
# 用的是 example.com 这类收不到信的测试域名（也读不了真实邮箱），必须让后端回显。
#
#   bash bin-linux/8-mail-echo.sh on     # 打开 + 重启后端（跑验证前）
#   bash bin-linux/8-mail-echo.sh off    # 关掉 + 重启后端（验证后，别忘了）
#   bash bin-linux/8-mail-echo.sh status # 只看当前状态
#
# 回显只对 MAIL_TEST_ECHO_DOMAINS（example.com,demo.com,test.local）生效，
# 真实邮箱永远走 SMTP —— 所以忘了关也不会把真人的验证码泄漏出去；
# 但公开站点上线前请务必确认它是 false。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

ENV_FILE="$DATA/mail.env"
ACTION="${1:-status}"

current() { grep -E '^MAIL_TEST_ECHO=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2; }

set_value() { # on|off → 写 true/false（Spring 的布尔绑定只认这几个值）
  local want=$1
  case "$want" in
    on)  want=true ;;
    off) want=false ;;
  esac
  [ -f "$ENV_FILE" ] || { echo "  [失败] 找不到 $ENV_FILE"; exit 1; }
  if grep -qE '^MAIL_TEST_ECHO=' "$ENV_FILE"; then
    sed -i "s/^MAIL_TEST_ECHO=.*/MAIL_TEST_ECHO=$want/" "$ENV_FILE"
  else
    printf 'MAIL_TEST_ECHO=%s\n' "$want" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

restart_backend() {
  if is_running "$PIDS/backend.pid"; then
    local pid
    pid=$(cat "$PIDS/backend.pid")
    echo "  [停止] 后端 (pid=$pid)"
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    for _ in $(seq 1 30); do
      is_running "$PIDS/backend.pid" || break
      sleep 1
    done
    rm -f "$PIDS/backend.pid"
  fi
  bash "$DIR/3-backend.sh"
}

banner "验证码测试回显"
case "$ACTION" in
  on|off)
    set_value "$ACTION"
    echo "  [写入] $ENV_FILE → MAIL_TEST_ECHO=$(current)"
    restart_backend
    ;;
  status)
    echo "  当前 MAIL_TEST_ECHO=$(current)"
    echo "  （false = 只在真实邮箱收码；true = 测试域名回显，仅跑验证时用）"
    ;;
  *)
    echo "  用法：bash bin-linux/8-mail-echo.sh on|off|status"
    exit 1
    ;;
esac
