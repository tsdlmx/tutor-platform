#!/usr/bin/env bash
# ============================================================================
# 家教中介平台 —— 公共环境（Linux 移植版）
# ----------------------------------------------------------------------------
# 原便携包带的是 Windows 运行时和 .bat 脚本，在 Linux 上全都不可用。这里改为
# 本机可用的等价物（都从 .deb 解包到项目内的私有前缀，不需要 root）：
#   MySQL  → runtime-linux/mysql       （MySQL 8.0.46，仅作旧数据来源）
#   Redis  → runtime-linux/redis       （Redis 7.0.15）
#   Node   → runtime-linux/node        （指向本机 Node 24.19.0 + pnpm）
# 后端是 Go 服务（tutor/tutor-api），不再需要 JDK；Java 后端已移除，
# 需要旧实现时从 tag legacy-java-final 取回。
# ============================================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/runtime-linux"
DATA="$ROOT/data"
LOGS="$DATA/logs"
PIDS="$DATA/pids"

mkdir -p "$LOGS" "$PIDS" "$DATA/redis" "$DATA/uploadPath"

# 发信凭据：data/mail.env（不存在就跳过；Go 服务的 SMTP 由 data/go-api.env 提供）
# 只在这里 source 一次，所有 bin-linux 脚本都继承这些环境变量
if [ -f "$DATA/mail.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DATA/mail.env"
  set +a
fi

# 本机密钥：data/secrets.env（不存在就跳过）。优先于环境变量的默认值，
# 因此生产部署把真实口令写在这里（或直接导出同名环境变量），不要改脚本。
#   MYSQL_ROOT_PASSWORD / REDIS_PASSWORD / PUBLIC_IP / SECRETS_DIR / REDIS_PASSWORD_FILE
if [ -f "$DATA/secrets.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DATA/secrets.env"
  set +a
fi

# 下面这些变量都可由 data/secrets.env 或同名环境变量覆盖；
# 括号里的值只是本地开发默认值，生产必须覆盖。
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-1234}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
# 密钥/口令文件的搜索目录（脚本只用来打印提示，不自动读取这里的文件）
SECRETS_DIR="${SECRETS_DIR:-$HOME/.dsh/secrets}"
REDIS_PASSWORD_FILE="${REDIS_PASSWORD_FILE:-$SECRETS_DIR/redis-password.txt}"
# 公网地址：留空则所有脚本不打印公网访问行（自签证书脚本会要求显式提供）
PUBLIC_IP="${PUBLIC_IP:-}"

# .deb 解出来的共享库（liblzf / libjemalloc / libevent / libprotobuf-lite）
export LD_LIBRARY_PATH="$RUNTIME/opt/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

export MYSQL_HOME="$RUNTIME/mysql"
export REDIS_HOME="$RUNTIME/redis"
export PATH="$MYSQL_HOME/bin:$REDIS_HOME/bin:$RUNTIME/node/bin:$PATH"

# 中文字符集：容器里 LANG 常为空
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

# 端口
#   MySQL 3307 —— 仅作旧数据来源（只监听本机/内网，不对公网开放）
#   Redis 6379 —— 只监听 127.0.0.1
#   Go API 12501 / 前端 12500 —— 这两个是**对公网开放**的端口，
#   需要在云厂商安全组里放行；公网地址见 PUBLIC_IP（未设置则不打印）。
MYSQL_PORT=3307
REDIS_PORT=6379
WEB_PORT=12500

# Go Web API（bin-linux/3b-go-api.sh），配置来自 data/go-api.env
GO_API_PORT="${GO_API_PORT:-12501}"
PG_PORT="${PG_PORT:-5432}"

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
