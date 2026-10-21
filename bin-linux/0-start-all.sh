#!/usr/bin/env bash
# ============================================================================
# 0) 一键启动全部（Linux 移植版，对应原来的 start-all.bat）
#   顺序：MySQL（旧数据来源）→ Redis → Go Web API → 前端
#   Java 后端已移除，需要旧实现时从 tag legacy-java-final 取回。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

FIRST_RUN=0
[ -d "$DATA/mysql-data/mysql" ] || FIRST_RUN=1

bash "$DIR/1-mysql.sh" || exit 1

if [ "$FIRST_RUN" = 1 ]; then
  # 首次运行（或数据目录被删）：导入旧库，供 cmd/import-legacy 使用
  bash "$DIR/5-init-db.sh" || exit 1
fi

bash "$DIR/2-redis.sh" || exit 1

if [ -f "$DATA/go-api.env" ]; then
  bash "$DIR/3b-go-api.sh" || exit 1
else
  echo
  echo "  [跳过] Go Web API 未配置（缺少 $DATA/go-api.env）"
  echo "         从 tutor/tutor-api/.env.example 复制一份并填入真实值"
fi

bash "$DIR/4-web.sh" || exit 1

banner "全部启动完成"
cat <<EOF
  ── 本机访问 ──────────────────────────────────────────────
  电脑端管理后台   http://127.0.0.1:$WEB_PORT/admin/login     账号见部署记录
  H5 移动端        http://127.0.0.1:$WEB_PORT/
  Go API 健康检查  http://127.0.0.1:$GO_API_PORT/health/ready
  接口文档         见 README.md 第二节（无 Swagger）
  MySQL           127.0.0.1:$MYSQL_PORT  root / 1234  库名 tutor（仅旧数据来源）
  Redis           127.0.0.1:$REDIS_PORT  （无密码）

  ── 公网访问（需云安全组已放行 $WEB_PORT；Go API 只应被反代访问）──
  电脑端管理后台   http://$PUBLIC_IP:$WEB_PORT/admin/login
  H5 移动端        http://$PUBLIC_IP:$WEB_PORT/

  日志目录         $LOGS
  停止全部         bash $DIR/9-stop-all.sh
EOF
