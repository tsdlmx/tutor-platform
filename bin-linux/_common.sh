#!/usr/bin/env bash
# ============================================================================
# 家教中介平台 —— 公共环境（Linux 移植版）
# ----------------------------------------------------------------------------
# 原便携包带的是 Windows 运行时（jdk8/win、mysql-*-winx64、redis-server.exe、
# node.exe）和 .bat 脚本，在 Linux 上全都不可用。这里改为本机可用的等价物：
#   JDK 8  → runtime-linux/jdk8        （OpenJDK 1.8.0_504）
#   MySQL  → runtime-linux/mysql       （MySQL 8.0.46）
#   Redis  → runtime-linux/redis       （Redis 7.0.15）
#   Node   → runtime-linux/node        （指向本机 Node 24.19.0 + pnpm）
# 所有运行时都从 .deb 解包到项目内的私有前缀，不需要 root。
# ============================================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/runtime-linux"
DATA="$ROOT/data"
LOGS="$DATA/logs"
PIDS="$DATA/pids"

mkdir -p "$LOGS" "$PIDS" "$DATA/redis" "$DATA/uploadPath"

# 真实发信凭据：data/mail.env（不存在就跳过，后端走开发模式）
# 只在这里 source 一次，所有 bin-linux 脚本（含 3-backend.sh）都继承这些环境变量
if [ -f "$DATA/mail.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DATA/mail.env"
  set +a
fi

# .deb 解出来的共享库（liblzf / libjemalloc / libevent / libprotobuf-lite）
export LD_LIBRARY_PATH="$RUNTIME/opt/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

export JAVA_HOME="$RUNTIME/jdk8"
export MYSQL_HOME="$RUNTIME/mysql"
export REDIS_HOME="$RUNTIME/redis"
export PATH="$JAVA_HOME/bin:$MYSQL_HOME/bin:$REDIS_HOME/bin:$RUNTIME/node/bin:$PATH"

# 中文字符集：容器里 LANG 常为空，JDK8 会退回 ASCII 导致中文乱码
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"
export JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8"

# 端口
#   MySQL 3307 —— 沿用原便携包（只监听本机/内网，不对公网开放）
#   Redis 6379 —— 只监听 127.0.0.1
#   前端 12500 / 后端 12501 —— 这两个是**对公网开放**的端口，
#   需要在云厂商安全组里放行；公网地址见 PUBLIC_IP。
MYSQL_PORT=3307
REDIS_PORT=6379
BACKEND_PORT=12501
WEB_PORT=12500

# 迁移后的 Go Web API（bin-linux/3b-go-api.sh）。与 Java 并存期间用独立端口，
# 配置来自 data/go-api.env；Java 退役后把它改成 BACKEND_PORT 即可。
GO_API_PORT="${GO_API_PORT:-12502}"
PG_PORT="${PG_PORT:-5432}"

# 本机公网 IP（腾讯云 NAT，网卡上只有内网 10.2.0.9）
PUBLIC_IP="${PUBLIC_IP:-82.156.178.102}"

MYSQL_SOCKET="$DATA/mysql.sock"

# ---------------------------------------------------------------------------
is_running() { # pidfile
  local f=$1
  [ -f "$f" ] || return 1
  local p
  p=$(cat "$f" 2>/dev/null)
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

wait_port() { # host port timeout_sec label
  local h=$1 p=$2 t=${3:-60} label=${4:-"$1:$2"} i=0
  while ! (exec 3<>"/dev/tcp/$h/$p") 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge "$t" ]; then
      echo "  [超时] $label 在 ${t}s 内未就绪"
      return 1
    fi
    sleep 1
  done
  echo "  [就绪] $label"
}

start_bg() { # name logfile cmd...
  local name=$1 log=$2
  shift 2
  setsid nohup "$@" >>"$log" 2>&1 &
  echo $! >"$PIDS/$name.pid"
  echo "  [启动] $name pid=$(cat "$PIDS/$name.pid") 日志=$log"
}

kill_port() { # port label —— 兜底：清掉还占着该端口的残留进程
  # 为什么需要：pnpm/npm 这类父进程会再 fork 出真正干活的子进程
  # （pnpm dev -> node .../node_modules/.bin/vite）。只 kill 父进程的话，
  # 子进程会继续占着 5173，下次启动就"端口已占用"了。
  local port=$1 label=$2 pid
  for pid in $(ss -ltnp 2>/dev/null \
      | awk -v p=":$port\$" '$4 ~ p {print $NF}' \
      | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    [ "$pid" = "$$" ] && continue
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
      echo "  [清理] $label 端口 $port 上的残留进程 pid=$pid"
    fi
  done
}

stop_one() { # name [port]
  local name=$1 port=${2:-} f="$PIDS/$1.pid"
  if is_running "$f"; then
    local p
    p=$(cat "$f")
    # setsid 启动过 => pid 就是进程组组长，杀整组（负数 pid）
    kill -TERM -"$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$p" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$p" 2>/dev/null && { kill -KILL -"$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null; }
    echo "  [停止] $name (pid=$p)"
  else
    echo "  [跳过] $name 未在运行"
  fi
  rm -f "$f"
  [ -n "$port" ] && kill_port "$port" "$name"
  return 0
}

port_in_use() { # port —— 端口是否已被占用
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

port_owner() { # port —— 谁占着（别人的进程可能看不到名字）
  local info
  info="$(ss -ltnp 2>/dev/null | awk -v p=":$1\$" '$4 ~ p {print $NF}' | head -1)"
  [ -n "$info" ] && echo "$info" || echo "未知进程（可能是其他用户的进程）"
}

require_port_free() { # port label
  if port_in_use "$1"; then
    echo "  [失败] $2 需要端口 $1，但它已被占用：$(port_owner "$1")"
    echo "         请先停掉占用者，或改用其他端口。"
    return 1
  fi
  return 0
}

banner() { echo; echo "=== $* ==="; }
