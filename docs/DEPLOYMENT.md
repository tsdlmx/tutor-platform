# 部署说明（Go 服务 + 过渡期双后端）

本文件描述如何把迁移中的 Go Web API 部署到与现有 Java 服务并存的环境，以及最终切换与回滚步骤。它基于仓库现有脚本的真实约定：Linux 侧由 `bin-linux/*.sh` 启动 MySQL、Redis、Java 后端与 `vite preview` 前端，**没有 nginx**，`/prod-api` 由 `vite preview` 代理到 Java。

## 1. 拓扑

### 过渡期（两个后端并存）

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
```

可选：`TLS_CERT_FILE` / `TLS_KEY_FILE`（由进程直接终止 TLS 时填写，两者必须成对）、`SMTP_*`。

校验行为：生产环境下 `JWT_SECRET` 仍是文档占位值时进程拒绝启动；TLS 只配一半、CORS 条目格式非法同样拒绝启动。

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

## 5. 上线步骤（过渡期）

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

## 9. 尚未覆盖

- 仓库没有 systemd/容器编排文件；`bin-linux` 脚本目前只拉起 MySQL、Redis、Java 与前端。
- `vite preview` 不是加固的生产入口：没有 HTTP/2、连接限流与细粒度访问控制，建议上线前补 nginx 配置（TLS1.2+、HSTS、静态资源缓存、`/web-api`、`/admin-api` 转 Go）。
- 服务监控页已由 Go 提供（宿主机指标 + Go 运行时 + 数据库连接池）；Java 的缓存监控接口没有 React 页面调用，未迁移。
