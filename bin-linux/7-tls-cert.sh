#!/usr/bin/env bash
# ============================================================================
# 7) 生成 / 更换站点 TLS 证书（HTTPS）
# ----------------------------------------------------------------------------
# 现状：这台机器没有域名，只有公网 IP（82.156.178.102），而 Let's Encrypt 等
# 公共 CA **不给裸 IP 签证书**，所以这里生成的是「自签证书」：
#   ✅ 传输是加密的（抓包看不到内容）
#   ⚠️  浏览器首次访问会提示「证书不受信任」，需要点「继续前往」，
#      或把 data/tls/server.crt 导入系统的「受信任根证书」后就没有提示。
#
# 想拿到浏览器地址栏的绿锁（无警告），两条路（都需要你操作控制台/域名）：
#   A. 有域名 + DNS API（推荐）：用 acme.sh 的 DNS-01 申请真证书，不需要 80/443
#        curl https://get.acme.sh | sh -s email=you@example.com
#        export CF_Token=...            # 或阿里云 Ali_Key/Ali_Secret
#        ~/.acme.sh/acme.sh --issue -d tutor.example.com --dns dns_cf
#        ~/.acme.sh/acme.sh --install-cert -d tutor.example.com \
#          --key-file  <项目>/data/tls/server.key \
#          --fullchain-file <项目>/data/tls/server.crt
#      然后把证书放进 data/tls/（同名），重跑 bash bin-linux/4-web.sh 即可。
#   B. 让 443 端口可用：在腾讯云安全组放行 443，并让平台 Caddy/反代把你的域名
#      转到 12500；本机是普通用户，绑不了 1024 以下端口，所以只能靠前置代理。
#
# 换完证书一定要重启前端：bash bin-linux/4-web.sh（会重新加载 data/tls）
# ============================================================================
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "$DIR/_common.sh"

TLS_DIR="$DATA/tls"
mkdir -p "$TLS_DIR"

FORCE="${1:-}"
if [ -f "$TLS_DIR/server.crt" ] && [ -f "$TLS_DIR/server.key" ] && [ "$FORCE" != "--force" ]; then
  echo "  [跳过] 证书已存在：$TLS_DIR/server.crt（要重新生成：bash bin-linux/7-tls-cert.sh --force）"
else
  cat > "$TLS_DIR/openssl.cnf" <<CNF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_ext

[dn]
C  = CN
O  = Tutor Platform
OU = Self-signed
CN = $PUBLIC_IP

[v3_ext]
basicConstraints = critical, CA:FALSE
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @san

[san]
IP.1  = $PUBLIC_IP
IP.2  = 127.0.0.1
DNS.1 = localhost
CNF
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$TLS_DIR/server.key" -out "$TLS_DIR/server.crt" \
    -config "$TLS_DIR/openssl.cnf" -extensions v3_ext >/dev/null 2>&1
  chmod 600 "$TLS_DIR/server.key"
  chmod 644 "$TLS_DIR/server.crt"
  echo "  [生成] 自签证书：$TLS_DIR/server.crt（825 天有效，SAN 含 $PUBLIC_IP / 127.0.0.1 / localhost）"
fi

echo
echo "=== 证书信息 ==="
openssl x509 -in "$TLS_DIR/server.crt" -noout -subject -dates -ext subjectAltName 2>/dev/null | sed 's/^/  /'
echo
echo "=== 指纹（导入「受信任根证书」时用来核对）==="
openssl x509 -in "$TLS_DIR/server.crt" -noout -fingerprint -sha256 | sed 's/^/  /'
echo
echo "  [提示] 改完证书重启前端：bash bin-linux/4-web.sh"
echo "  [提示] 访问地址：https://$PUBLIC_IP:$WEB_PORT/"
