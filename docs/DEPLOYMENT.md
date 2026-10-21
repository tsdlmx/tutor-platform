# 部署说明（Go 服务 + 过渡期双后端）

本文件描述如何把迁移后的 Go Web API 部署到与现有 Java 服务并存的环境，以及最终切换与回滚步骤。它基于仓库现有脚本的真实约定：Linux 侧由 `bin-linux/*.sh` 启动 MySQL、Redis、Java 后端、Go Web API 与 `vite preview` 前端，**没有 nginx**。

## 0. 迁移现状（2026-10-21 核对）

仓库内已经没有任何客户端依赖 Java 后端，Go 单后端上线是可行的：

| 证据 | 结论 |
| --- | --- |
| `tutor-web` 构建产物中不存在 `/dev-api`、`/prod-api` 字样 | React 管理台与 H5 只访问 `/web-api`、`/admin-api` |
| 前端 `src/api/*.ts` 调用的每条路径都能在 `internal/httpapi/router.go` 找到对应路由 | 无功能缺口（唯一对不上的 `PUT /system/tutorInfo` 是无页面引用的死代码，已删除） |
| `tutor-uniapp` 只有 3 个页面、没有 `package.json`、没有任何 `uni.request` 调用，首页是硬编码假数据，AppID 已清空 | 小程序端是不部署的静态样张，不是可用客户端 |
| 部署脚本只拉起 Java、MySQL、Redis 与前端，没有任何构建/部署 uni-app 的步骤 | 小程序不参与本次上线 |

因此「过渡期双后端」只是**可选的安全回滚路径**，不是必须经历的阶段；首次部署可以直接按 Go 单后端进行。

## 1. 拓扑

### 过渡期（两个后端并存，可选）

```
浏览器
  │  https://<host>:12500  （vite preview 伺服 dist）
  │     ├── /prod-api/*  → http://127.0.0.1:12501  Java（未迁移模块）
  │     ├── /web-api/*   → http://127.0.0.1:12502  Go（客户 Web）
  │     └── /admin-api/* → http://127.0.0.1:12502  Go（管理员认证 + 已迁移管理接口）
  ▼
Go 服务 ── PostgreSQL（权威库） ── Redis（会话、验证码、限流）
Java 服务 ── MySQL（只读来源，等待导入） ── 同一个 Redis（管理员会话）
```

**端口冲突**：Java 已占用 `12501`。过渡期必须把 Go 放到另一个端口（下文用 `12502`），并在前端 `.env.production` 中分别指定三个代理目标。`vite.config.ts` 的默认值都是 `127.0.0.1:12501`，只适用于 Java 退役之后的单后端部署。

### 切换完成（Go 单后端）

Go 接管 `12501`，前端只访问 `/web-api` 与 `/admin-api`；Java 与 MySQL 下线，`/dev-api` 反代可一并移除。

## 2. 前置资源

| 资源 | 说明 |
| --- | --- |
| Go 1.26.9+ | `go.mod` 已声明 `toolchain go1.26.9`：低版本工具链带已知标准库漏洞，不应再用于构建。构建机可联网时 Go 会自动下载该工具链，离线构建需预置。 |
| Node 20.19+ / pnpm 9+ | 前端构建与 `vite preview`；`package.json` 的 `engines` 已声明下限。 |
| PostgreSQL 13+ | 权威库，字符集 UTF8，时区 UTC。库名示例 `tutor`。 |
| Redis 6+ | 与 Java 共用同一实例和逻辑库（过渡期必需），用于管理员会话 `login_tokens:*`、验证码 `captcha_codes:*`、邮箱验证码与限流计数。 |
| SMTP | 未配置时客户注册/找回验证码接口返回 503（安全失败，不回显验证码）。 |
| 反向代理 | `vite preview` 可用但不适合作为长期生产入口；建议后续用 nginx 承担 TLS、HTTP/2、限流与静态缓存。 |

## 3. 环境变量

必填：

```
APP_ENV=production
HTTP_ADDR=127.0.0.1:12502           # 过渡期；切换后改回 127.0.0.1:12501
DATABASE_DSN=postgres://tutor_app:<密码>@127.0.0.1:5432/tutor?sslmode=require
JWT_SECRET=<64 位十六进制随机串>      # 过渡期必须与 Java token.secret 相同
REDIS_ADDR=127.0.0.1:6379
REDIS_PASSWORD=<密码>
TRUSTED_PROXY_CIDRS=127.0.0.1/32    # 只填写你实际运行的反代网段
CORS_ALLOWED_ORIGINS=               # 留空 = 仅同源；不要在生产写 *
PRIVACY_POLICY_VERSION=2026-10-21   # 生产必填：注册同意记录里存这个版本号
```

可选：`TLS_CERT_FILE` / `TLS_KEY_FILE`（由进程直接终止 TLS 时填写，两者必须成对）、`SMTP_*`。

校验行为：生产环境下 `JWT_SECRET` 仍是文档占位值、`PRIVACY_POLICY_VERSION` 为空、TLS 只配一半、CORS 条目格式非法时，进程拒绝启动。

生成密钥：

```bash
openssl rand -hex 32
```

前端构建期变量（`tutor/tutor-web/.env.production`，过渡期）。前端已没有默认后端前缀，只访问 `/web-api` 与 `/admin-api`：

```
VITE_CUSTOMER_API_BASE_URL=/web-api
VITE_WEB_API_PROXY_PREFIX=/web-api
VITE_WEB_API_PROXY_TARGET=http://127.0.0.1:12502
VITE_ADMIN_API_PROXY_PREFIX=/admin-api
VITE_ADMIN_API_PROXY_TARGET=http://127.0.0.1:12502
# 隐私政策与用户协议的公开地址（注册页勾选同意时链接到此）；上线前必须发布并配置
VITE_PRIVACY_POLICY_URL=https://<你的域名>/privacy
# 过渡期兜底（当前没有页面调用，随 Java 退役删除）
VITE_PROXY_PREFIX=/dev-api
VITE_PROXY_TARGET=http://127.0.0.1:12501
```

构建后可用 `grep -R "/dev-api" dist/assets` 自检：已迁移彻底时产物中不应出现该前缀。

## 4. 数据库权限

应用账号不要用超级用户。最小权限示例：

```sql
CREATE ROLE tutor_app LOGIN PASSWORD '<密码>';
GRANT CONNECT ON DATABASE tutor TO tutor_app;
GRANT USAGE ON SCHEMA public TO tutor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tutor_app;
-- 审计表只允许追加，阻止应用侧篡改历史
REVOKE UPDATE, DELETE, TRUNCATE ON sys_login_audit, sys_oper_log FROM tutor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tutor_app;
```

迁移由 `cmd/migrate` 执行，需要建表权限；建议用一个单独的迁移账号，或由 DBA 在变更窗口手工执行 `internal/database/migrations/*.sql`。

## 5. 上线步骤

Linux 部署机推荐直接用仓库脚本（编译、迁移、探活、日志都封装好了）：

```bash
# 1) 准备配置（不提交）：从 tutor/tutor-api/.env.example 复制
cp tutor/tutor-api/.env.example data/go-api.env
#   填入真实的 DATABASE_DSN / JWT_SECRET / REDIS_ADDR / PRIVACY_POLICY_VERSION 等

# 2) 启动（缺省监听 12502；有 go 工具链时自动编译并先跑迁移）
bash bin-linux/3b-go-api.sh

# 3) 前端按第 3 节变量重新构建并发布
bash bin-linux/4-web.sh

# 4) 停止：bash bin-linux/9-stop-all.sh（会一并停掉 go-api）
```

把 `GO_API_PORT` 设为 `12501`（或 `BACKEND_PORT` 对应值）、停掉 Java 之后，就是 Go 单后端。

Windows 开发机用 `3b-go-api.bat`（实现是同目录的 `3b-go-api.ps1`），行为与 `3b-go-api.sh` 对齐：同样读 `data\go-api.env`，有 go 工具链就编译，先应用迁移再起服务，最后校验 `/health/ready`；日志写 `data\logs\go-api.log`，pid 写 `data\pids\go-api.pid`。端口以 env 文件里的 `HTTP_ADDR` 为准（未设置时默认只监听 `127.0.0.1:12502`），`-Port 12501` 用于切到正式端口，`-SkipBuild` 复用已有二进制，`-Stop` 停止。`start-all.bat` 在存在 `data\go-api.env` 时会一并拉起，`stop-all.bat` 会一并停掉。

## 5.1 生产部署产物（nginx + systemd）

仓库提供以下可直接落地的配置，替代"`vite preview` 当生产入口 + `setsid nohup` 拉进程"的临时做法：

| 文件 | 用途 |
| --- | --- |
| `deploy/nginx/tutor.conf` | 站点配置：80→443 跳转、TLS1.2/1.3、HSTS、安全响应头与 CSP、SPA 兜底、静态长缓存、`/web-api` 与 `/admin-api` 反代（剥前缀）、登录接口单独限流、拒绝点文件 |
| `deploy/nginx/snippets/tutor-proxy.conf` | 反代公共参数（转发头、超时、`Connection ""`） |
| `deploy/nginx/snippets/tutor-headers.conf` | 公共安全响应头（见下方注意事项） |
| `deploy/systemd/tutor-api.service` | 进程守护：`EnvironmentFile` 读密钥、`Restart=always`、`ProtectSystem=strict` 等沙箱项、日志进 journald、`SIGTERM` 优雅退出 |
| `deploy/logrotate/tutor` | nginx 访问/错误日志按周轮转、保留 26 周（约 6 个月），`postrotate` 让 nginx 重开日志 |
| `deploy/systemd/journald-tutor.conf` | 服务日志保留：总量上限 2G、单文件 64M、保留 26 周、压缩 |

安装（Ubuntu/Debian 系示例）：

```bash
sudo install -d /srv/tutor-web /srv/tutor-api/var /etc/nginx/snippets
sudo cp -r tutor/tutor-web/dist/* /srv/tutor-web/
sudo install -m 0644 deploy/nginx/tutor.conf /etc/nginx/conf.d/tutor.conf
sudo install -m 0644 deploy/nginx/snippets/*.conf /etc/nginx/snippets/

# 日志留存：nginx 侧走 logrotate，服务侧走 journald
sudo install -d /etc/logrotate.d /etc/systemd/journald.conf.d
sudo install -m 0644 deploy/logrotate/tutor /etc/logrotate.d/tutor
sudo install -m 0644 deploy/systemd/journald-tutor.conf /etc/systemd/journald.conf.d/tutor.conf
sudo logrotate -d /etc/logrotate.d/tutor     # 演练，确认能解析
sudo systemctl restart systemd-journald

sudo install -m 0644 deploy/systemd/tutor-api.service /etc/systemd/system/

# 配置里的 tutor.example.com 与证书路径要换成自己的
sudo nginx -t && sudo systemctl reload nginx

sudo useradd --system --home /srv/tutor-api --shell /usr/sbin/nologin tutor-api
sudo install -o tutor-api -g tutor-api -m 0600 data/go-api.env /srv/tutor-api/go-api.env
sudo install -o tutor-api -g tutor-api -m 0755 runtime/tutor-api /srv/tutor-api/tutor-api
sudo install -o tutor-api -g tutor-api -m 0755 runtime/tutor-api-migrate /srv/tutor-api/tutor-api-migrate
sudo systemctl daemon-reload && sudo systemctl enable --now tutor-api
journalctl -u tutor-api -f
```

两个坑（都已在本仓库的配置里规避，改动时别踩回去）：

1. **nginx 的 `add_header` 不向下继承**：某一层只要自己写了 `add_header`，父级的全部 `add_header` 都会被丢弃。SPA 外壳由 `location = /index.html`（带 `Cache-Control`）处理，因此公共安全头必须用 `include .../tutor-headers.conf` 在该 location 与 `/assets/` 里再引用一次，否则页面响应会**没有 HSTS/CSP/X-Frame-Options**。
2. **systemd 单元文件不支持行内注释**：`ProtectSystem=strict  # 说明` 会被当成非法值而**整行失效**（加固项静默不生效）。注释必须单独成行。

验证情况（详见 `docs/VERIFICATION-RESULTS.md`）：`nginx -t` 用 nginx 1.30.6 通过；实际拉起 nginx + 假上游后 13 项功能检查全部通过（跳转、5 个安全头、CSP 内容、SPA 兜底、`index.html` 不缓存、两个前缀剥离开关转发、登录限流返回 503）；`systemd-analyze verify` 通过（只剩"二进制尚未安装"这一预期提示）。

仍需部署方补齐：证书签发（Let's Encrypt 或企业 CA）、`server_name` 与证书路径替换、`/srv/tutor-web` 的发版方式（当前脚本仍用 `vite preview`，切到 nginx 后 `4-web.sh` 只需构建并拷贝 dist）。

手工部署时等价步骤如下：

```bash
# 1) 编译
cd tutor/tutor-api && go build -trimpath -o ../../runtime/tutor-api ./cmd/server
go build -trimpath -o ../../runtime/tutor-api-migrate ./cmd/migrate

# 2) 执行迁移（幂等，带 advisory lock 与 checksum 校验；只读 DATABASE_DSN）
DATABASE_DSN=... ../../runtime/tutor-api-migrate

# 3) 导入旧 MySQL 数据（一次性，写模式要求目标表为空）
#    先跑只读预检，核对表行数与冲突后再 --apply
LEGACY_MYSQL_DSN=... DATABASE_DSN=... go run ./cmd/import-legacy
LEGACY_MYSQL_DSN=... DATABASE_DSN=... go run ./cmd/import-legacy --apply

# 4) 启动并探活
systemd-run 或 nohup ./runtime/tutor-api &
curl -fsS http://127.0.0.1:12502/health/live
curl -fsS http://127.0.0.1:12502/health/ready     # 依赖 PostgreSQL 与 Redis

# 5) 前端按第 3 节变量重新构建并发布
```

导入顺序说明：`cmd/import-legacy` 是快照导入，不是持续同步。导入前必须冻结 MySQL 侧的管理员账号、角色与部门维护操作，否则 Go 侧读到的是旧快照。

## 6. 健康检查与优雅退出

| 接口 | 用途 |
| --- | --- |
| `GET /health/live` | 进程存活，返回 `{"status":"ok"}` |
| `GET /health/ready` | 依赖就绪，PostgreSQL + Redis 各 2 秒超时探测，失败返回 503 |

进程收到 `SIGTERM`/`SIGINT` 后停止接受新连接，最多等待 10 秒完成在途请求。反代摘流应先于进程退出（先摘流量、再发信号）。

## 7. 日志与审计保留

- 服务日志为 JSON，写 stdout，由部署方采集；请求日志含 `method`、`path`、`request_id`、`duration_ms`，不含查询串、请求体与令牌。
- 审计在数据库：`sys_oper_log`（管理写操作）与 `sys_login_audit`（登录/注册/改密）。
- 等保要求审计留存 ≥ 6 个月：由运维按 `created_at` 定时归档，应用不做自动删除。归档示例：

```sql
-- 每月执行一次，导出到期数据后删除（仅在确认归档成功后执行）
COPY (SELECT * FROM sys_login_audit WHERE created_at < now() - interval '6 months')
  TO '/archive/sys_login_audit.csv' CSV HEADER;
```

## 8. 切换与回滚

切换前提：React 前端已不再依赖 `/dev-api`（构建产物中不含该前缀，漏写 baseURL 会直接 404），且 `sys_login_audit`、`sys_oper_log` 的最终 MySQL 快照已导入。

切换步骤：

1. 冻结 MySQL 写入（停 Java 的写操作或切只读）。
2. 跑最后一次 `cmd/import-legacy`（预检 + `--apply`）。
3. Go 改绑 `12501`，前端三个代理目标全部指向 `12501`。
4. 停 Java，`/dev-api` 前缀从反代移除（仅剩小程序过渡还在用它，若小程序也已迁移则可完全删除）。
5. 冒烟：管理员登录与验证码、`/getInfo`、教师审核、帖子审核、客户账号状态、在线会话与强制下线、个人中心改密。

回滚：保留 Java 与 MySQL 的只读快照和原进程启动脚本；把 Go 退回 `12502`、前端代理改回原值、重启 Java 即可。切换后仍在 PostgreSQL 写入的数据不会回流 MySQL，回滚前必须评估这段时间的业务写入。

## 9. 发布前验收

```bash
bash scripts/verify.sh              # 全部验收项
SKIP_AUDIT=1 bash scripts/verify.sh # 无外网时跳过依赖审计
```

脚本逐项检查：Go 构建 / `go vet` / `gofmt`、`govulncheck` 可达漏洞、迁移文件命名、前端冻结安装与类型检查与构建、构建产物不得残留 `/dev-api`、`/prod-api`（前端已彻底脱离 Java 的回归护栏）、前端 high/critical 依赖漏洞。任一项失败退出码非 0。

建议接入 CI：在合并前与发布前各跑一次；`govulncheck` 与 `pnpm audit` 需要外网，离线环境用 `SKIP_AUDIT=1` 并改为在联网构建机上单独执行。

## 10. 尚未覆盖

- 已提供 nginx 站点配置与 systemd 单元（§5.1），但仓库内的启动脚本仍是 `setsid nohup` + pid 文件的方式（无开机自启/崩溃拉起）；生产应改用 §5.1 的 systemd 单元，Windows 侧（`3b-go-api.bat`）同样只是隐藏窗口进程。
- `bin-linux` 脚本把 Go 日志写到 `data/logs/go-api.log`，不轮转；生产应改用 §5.1 的 systemd 单元（日志进 journald，配合 `deploy/systemd/journald-tutor.conf` 的保留策略）。
- `vite preview` 不是加固的生产入口：没有 HTTP/2、连接限流与细粒度访问控制。§5.1 的 nginx 配置已验证可用，上线前应切换过去。
- 服务监控页已由 Go 提供（宿主机指标 + Go 运行时 + 数据库连接池）；Java 的缓存监控接口没有 React 页面调用，未迁移。
- 迁移与核心链路已在 PostgreSQL 16.2 上实测通过（见 `docs/VERIFICATION-RESULTS.md`）；`cmd/import-legacy` 对真实 MySQL 的预检与导入尚未验证，首次部署仍必须先在预发库跑一次预检并核对行数。
