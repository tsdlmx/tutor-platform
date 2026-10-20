#!/usr/bin/env bash
# 上线前验收脚本（可在 CI 或部署机上直接跑）。
#
# 覆盖：Go 构建/静态检查/漏洞扫描、前端冻结安装/类型检查/构建、构建产物不得残留
# 已退役后端前缀、迁移文件命名规范、前端依赖审计。
#
# 用法：
#   bash scripts/verify.sh              # 全部检查
#   SKIP_AUDIT=1 bash scripts/verify.sh # 跳过需要访问 npmjs registry 的依赖审计
#
# 退出码非 0 表示存在阻断项。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/tutor/tutor-api"
WEB="$ROOT/tutor/tutor-web"
MIGRATIONS="$API/internal/database/migrations"

failures=0
step() { printf '\n==> %s\n' "$1"; }
ok()   { printf '    [通过] %s\n' "$1"; }
bad()  { printf '    [失败] %s\n' "$1"; failures=$((failures + 1)); }
skip() { printf '    [跳过] %s\n' "$1"; }

step "Go：构建与静态检查"
if ! command -v go >/dev/null 2>&1; then
  bad "未找到 go 命令"
else
  if ( cd "$API" && go build ./... ); then ok "go build"; else bad "go build"; fi
  if ( cd "$API" && go vet ./... ); then ok "go vet"; else bad "go vet"; fi
  unformatted="$( cd "$API" && gofmt -l . )"
  if [ -z "$unformatted" ]; then ok "gofmt"; else bad "gofmt 未格式化：$unformatted"; fi
fi

step "Go：依赖漏洞扫描"
if command -v govulncheck >/dev/null 2>&1; then
  if ( cd "$API" && govulncheck ./... >/tmp/govulncheck.log 2>&1 ); then
    ok "govulncheck 无可达漏洞"
  else
    bad "govulncheck 报告可达漏洞：$(grep -E 'GO-[0-9]{4}-[0-9]+' /tmp/govulncheck.log | sort -u | tr '\n' ' ')"
  fi
else
  skip "govulncheck 未安装（go install golang.org/x/vuln/cmd/govulncheck@latest）"
fi

step "迁移文件命名"
bad_migrations=0
for file in "$MIGRATIONS"/*.sql; do
  name="$(basename "$file")"
  case "$name" in
    [0-9][0-9][0-9][0-9][0-9][0-9]_*.sql) ;;
    *) bad "迁移文件名不符合 000000_name.sql：$name"; bad_migrations=1 ;;
  esac
done
[ "$bad_migrations" -eq 0 ] && ok "全部迁移文件名合规"

step "前端：冻结安装、类型检查、构建"
if ! command -v corepack >/dev/null 2>&1 && ! command -v pnpm >/dev/null 2>&1; then
  bad "未找到 pnpm/corepack"
else
  if ( cd "$WEB" && corepack pnpm install --frozen-lockfile ); then ok "pnpm install --frozen-lockfile"; else bad "锁文件与 package.json 不一致"; fi
  if ( cd "$WEB" && corepack pnpm typecheck ); then ok "pnpm typecheck"; else bad "pnpm typecheck"; fi
  if ( cd "$WEB" && corepack pnpm build ); then ok "pnpm build"; else bad "pnpm build"; fi
fi

step "前端产物：不得残留已退役后端前缀"
if [ -d "$WEB/dist/assets" ]; then
  if grep -R -q -E '"/dev-api"|"/prod-api"' "$WEB/dist/assets"; then
    bad "构建产物仍引用 /dev-api 或 /prod-api"
  else
    ok "产物只引用 /web-api 与 /admin-api"
  fi
else
  bad "缺少构建产物 dist/assets"
fi

step "前端依赖审计"
if [ "${SKIP_AUDIT:-0}" = "1" ]; then
  skip "SKIP_AUDIT=1"
elif command -v corepack >/dev/null 2>&1; then
  if ( cd "$WEB" && corepack pnpm audit --registry https://registry.npmjs.org --audit-level high >/tmp/pnpm-audit.log 2>&1 ); then
    ok "无 high/critical 依赖漏洞"
  else
    # 已知 dev-only 残留（braces、postcss-selector-parser）不在巡检阻断范围内
    if grep -q "high\|critical" /tmp/pnpm-audit.log; then
      bad "存在 high/critical 依赖漏洞，详见 /tmp/pnpm-audit.log"
    else
      ok "仅有低风险依赖告警"
    fi
  fi
else
  skip "pnpm 不可用"
fi

printf '\n==> 结论：'
if [ "$failures" -eq 0 ]; then
  echo "全部检查通过"
  exit 0
fi
echo "$failures 项未通过"
exit 1
