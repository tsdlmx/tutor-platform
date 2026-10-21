#!/usr/bin/env bash
# ============================================================================
# 4) 启动前端（端口 12500，对公网开放）
# ----------------------------------------------------------------------------
# 两种模式，用 WEB_MODE 选择：
#
#   WEB_MODE=preview（默认，给真实用户用）
#       先构建 → 用 `vite preview` 伺服 dist 里的生产产物。
#       公网首屏只有 4~5 个请求、gzip 后约 200KB（可用 vite build 产物直接对比）。
#       dist 比源码旧时会自动重建，所以改完代码直接重跑本脚本即可。
#
#   TLS（默认关闭）：WEB_TLS=1 时用 data/tls/server.{crt,key} 起 HTTPS。
#       现在只有公网 IP、没有域名，公共 CA 不给裸 IP 签证书，所以默认走 HTTP；
#       域名下来后把真证书放进 data/tls/，再 `WEB_TLS=1 bash bin-linux/4-web.sh`。
#
#   WEB_MODE=dev
#       原来的 `pnpm dev`（带 HMR，方便改前端时热更新）。
#       代价是每个模块一个请求：服务器在国内公网，首屏几百个请求、没有压缩，
#       慢很多。只建议本机调样式时用。
#
# 注意：便携包里的 tutor-web/node_modules 是 Windows 版（含 win32-x64 的
# esbuild/rollup 原生二进制），Linux 上必须重装，脚本会自动检测并处理。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

WEB_MODE="${WEB_MODE:-preview}"
WEB_TLS="${WEB_TLS:-0}"
export WEB_TLS

banner "前端 ($WEB_PORT, mode=$WEB_MODE)"

WEB="$ROOT/tutor/tutor-web"
cd "$WEB" || exit 1

if is_running "$PIDS/web.pid"; then
  echo "  [跳过] 前端已在运行 (pid=$(cat "$PIDS/web.pid"))"
  exit 0
fi

# 检测 Windows 版依赖
if [ -d node_modules ] && [ ! -d node_modules/@esbuild/linux-x64 ]; then
  echo "  [重装] node_modules 是 Windows 构建产物（缺 @esbuild/linux-x64），删除后重装"
  rm -rf node_modules
fi

if [ ! -d node_modules ]; then
  echo "  [安装] pnpm install（registry=$(grep -m1 '^registry=' .npmrc | cut -d= -f2)）"
  if ! pnpm install >>"$LOGS/web-install.log" 2>&1; then
    echo "  [失败] pnpm install 失败，见 $LOGS/web-install.log"
    tail -25 "$LOGS/web-install.log"
    exit 1
  fi
  echo "  [完成] 依赖安装完成"
fi

# dist 是否比源码旧（改过代码就得重建，否则公网看到的是旧界面）
needs_build() {
  [ -f dist/index.html ] || return 0
  [ -n "$(find src index.html vite.config.ts package.json tailwind.config.js \
      .env.production .env.development -newer dist/index.html -type f 2>/dev/null | head -1)" ]
}

if [ "$WEB_MODE" = "preview" ]; then
  if needs_build; then
    echo "  [构建] dist 不存在或已过期，执行 vite build…"
    if ! npx vite build >>"$LOGS/web-build.log" 2>&1; then
      echo "  [失败] 构建失败，见 $LOGS/web-build.log"
      tail -25 "$LOGS/web-build.log"
      exit 1
    fi
    echo "  [完成] 生产构建完成（$(du -sh dist | cut -f1)，入口 $(ls -1 dist/assets/index-*.js | head -1 | xargs basename)）"
  else
    echo "  [跳过] dist 是最新的（WEB_FORCE_BUILD=1 可强制重建）"
  fi
  [ "${WEB_FORCE_BUILD:-0}" = "1" ] && npx vite build >>"$LOGS/web-build.log" 2>&1
fi

require_port_free "$WEB_PORT" "前端" || exit 1

if [ "$WEB_MODE" = "dev" ]; then
  start_bg web "$LOGS/web.log" pnpm dev
else
  # preview：伺服 dist，并把 /prod-api 反代到后端（见 vite.config.ts 的 preview.proxy）
  start_bg web "$LOGS/web.log" pnpm exec vite preview --host 0.0.0.0 --port "$WEB_PORT"
fi

if ! wait_port 127.0.0.1 "$WEB_PORT" 90 "前端 127.0.0.1:$WEB_PORT"; then
  tail -30 "$LOGS/web.log"
  exit 1
fi
# 与后端同理：端口通不代表 Vite 起来了（vite 是 pnpm fork 出来的子进程）
if ! is_running "$PIDS/web.pid"; then
  echo "  [失败] 端口 $WEB_PORT 可连接，但前端进程已退出——该端口可能被别的程序占用"
  tail -30 "$LOGS/web.log"
  exit 1
fi
if [ "$WEB_TLS" = "1" ]; then SCHEME=https; else SCHEME=http; fi
if [ -n "${PUBLIC_IP:-}" ]; then
  echo "  [提示] 客户侧首页：$SCHEME://127.0.0.1:$WEB_PORT/        公网：$SCHEME://$PUBLIC_IP:$WEB_PORT/"
else
  echo "  [提示] 客户侧首页：$SCHEME://127.0.0.1:$WEB_PORT/        （未设置 PUBLIC_IP，不打印公网地址）"
fi
echo "  [提示] 管理后台：  $SCHEME://127.0.0.1:$WEB_PORT/admin/login  (账号 admin，口令见你的密码管理器)"
echo "  [提示] 找家教：    $SCHEME://127.0.0.1:$WEB_PORT/tutors"
if [ "$WEB_TLS" = "1" ]; then
  echo "  [提示] TLS：已启用（data/tls/server.crt）。若仍是自签证书，浏览器会提示不受信任"
else
  echo "  [提示] 协议：HTTP（TLS 未启用）。域名 + 受信任证书就绪后：WEB_TLS=1 bash bin-linux/4-web.sh"
fi
