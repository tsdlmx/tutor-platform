#!/usr/bin/env bash
# ============================================================================
# 0) 一键启动全部（Linux 移植版，对应原来的 start-all.bat）
#   顺序：MySQL → Redis → 初始化数据库 → 后端 → 前端
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

FIRST_RUN=0
[ -d "$DATA/mysql-data/mysql" ] || FIRST_RUN=1

bash "$DIR/1-mysql.sh" || exit 1

if [ "$FIRST_RUN" = 1 ]; then
  # 首次运行（或数据目录被删）：必须建库导数据，否则后端启动即报表不存在
  bash "$DIR/5-init-db.sh" || exit 1
fi

bash "$DIR/2-redis.sh" || exit 1
bash "$DIR/3-backend.sh" || exit 1
bash "$DIR/4-web.sh" || exit 1

banner "全部启动完成"
cat <<EOF
  ── 本机访问 ──────────────────────────────────────────────
  电脑端管理后台   http://127.0.0.1:$WEB_PORT/admin/login     账号 admin（口令见部署记录）
  H5 移动端        http://127.0.0.1:$WEB_PORT/h5
  后端接口文档     http://127.0.0.1:$BACKEND_PORT/swagger-ui/index.html
  MySQL           127.0.0.1:$MYSQL_PORT  root / 1234  库名 tutor
  Redis           127.0.0.1:$REDIS_PORT  （无密码）

  ── 公网访问（需云安全组已放行 $WEB_PORT / $BACKEND_PORT）──
  电脑端管理后台   http://$PUBLIC_IP:$WEB_PORT/admin/login
  H5 移动端        http://$PUBLIC_IP:$WEB_PORT/h5
  后端接口文档     http://$PUBLIC_IP:$BACKEND_PORT/swagger-ui/index.html

  日志目录         $LOGS
  停止全部         bash $DIR/9-stop-all.sh
EOF
