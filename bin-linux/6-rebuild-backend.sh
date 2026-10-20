#!/usr/bin/env bash
# ============================================================================
# 6) 从源码重新构建后端并重启
# ----------------------------------------------------------------------------
# 本机装了 Maven（见 PORTING-LINUX.md 第十节），所以改了 Java 代码之后
# 走这条路径：构建 -> 停旧进程 -> 起新进程。
# 只重启后端，MySQL / Redis / 前端不受影响。
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

MVN_HOME=/home/ubuntu/PlatformE/toolchain/apache-maven-3.9.9
SETTINGS=/home/ubuntu/PlatformE/toolchain/settings.xml
M2=/home/ubuntu/PlatformE/toolchain/m2

banner "重新构建后端"

if [ ! -x "$MVN_HOME/bin/mvn" ]; then
  echo "  [失败] 找不到 Maven：$MVN_HOME/bin/mvn"
  echo "         见 PORTING-LINUX.md 第十节（工具链安装说明）"
  exit 1
fi

cd "$ROOT/tutor" || exit 1
JAR="$ROOT/tutor/tutor-admin/target/tutor-admin.jar"
BEFORE=""
[ -f "$JAR" ] && BEFORE=$(stat -c%s "$JAR")

echo "  [构建] mvn clean package（跳过测试）"
if ! "$MVN_HOME/bin/mvn" -s "$SETTINGS" -Dmaven.repo.local="$M2" \
      -q -DskipTests clean package; then
  echo "  [失败] 构建失败，后端保持原样不动"
  exit 1
fi

AFTER=$(stat -c%s "$JAR" 2>/dev/null || echo 0)
if [ "$AFTER" = "0" ]; then
  echo "  [失败] 构建完成但没找到 $JAR"
  exit 1
fi
echo "  [完成] jar 大小 ${BEFORE:-0} -> $AFTER 字节"
# 构建产物原来有 .orig-win 备份，重建时会被 clean 删掉，这里从 data/backup 还原
if [ ! -f "$JAR.orig-win" ] && [ -f "$ROOT/data/backup/tutor-admin.jar.orig-win" ]; then
  cp "$ROOT/data/backup/tutor-admin.jar.orig-win" "$JAR.orig-win"
  echo "  [还原] 原始 Windows jar 备份已放回 target/"
fi

echo
echo "  [重启] 停掉旧后端"
p=$(cat "$PIDS/backend.pid" 2>/dev/null)
if [ -n "${p:-}" ]; then
  kill -TERM -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$p" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$p" 2>/dev/null && kill -KILL -"$p" 2>/dev/null
  rm -f "$PIDS/backend.pid"
  kill_port "$BACKEND_PORT" backend
  echo "  [停止] 旧后端 pid=$p"
else
  echo "  [跳过] 没有记录在案的旧后端进程"
fi

bash "$DIR/3-backend.sh"
