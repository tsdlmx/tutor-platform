# Agent 开发指南

面向在本仓库协作的 AI agent 与开发者。**内部协作仓库**，不是开源项目：优先保证"能跑、边界清楚、不误提交密钥"，而不是社区式的完善度。

仓库中的旧说明（`PORTING-LINUX.md`、`tutor/README-RUN.md`、`docs/CUSTOMER-API.md` 等）记录的是历史状态，可能与当前实现不同。**改动前一律以源码、配置、锁文件和正在使用的脚本为准。**

## 1. 项目结构

| 路径 | 说明 |
| --- | --- |
| `tutor/tutor-api/` | **Go Web API（当前唯一在用的后端）**，模块 `github.com/tsdlmx/tutor-platform/tutor-api` |
| `tutor/tutor-web/` | React 18 + TypeScript + Vite 6 前端，同时承载管理台（`/admin/**`）与客户 H5 |
| `tutor/tutor-admin/`、`tutor/tutor-common/`、`tutor/tutor-framework/`、`tutor/tutor-system/`、`tutor/tutor-quartz/`、`tutor/tutor-generator/` | Java（Spring Boot 2.5）后端，**已无客户端依赖，仅作回滚路径** |
| `tutor/tutor-uniapp/` | uni-app 静态样张（3 个页面、无 `package.json`、无接口调用），**不部署** |
| `deploy/` | 生产部署产物：`nginx/`、`systemd/`、`logrotate/` |
| `scripts/verify.sh` | 上线前验收脚本（本地与 CI 共用） |
| `bin-linux/` | Linux 启动脚本（MySQL/Redis/Java/Go/前端） |
| `*.bat`、`3b-go-api.ps1` | Windows 启动脚本 |
| `docs/` | 部署、等保、隐私、验证记录、ADR |
| `data/` | **本地运行时目录（已 gitignore）**：`go-api.env`、日志、pid、上传目录 |

Go 服务的包职责：

| 包 | 职责 |
| --- | --- |
| `cmd/server` | 进程启动、HTTP 服务器参数、优雅退出、可选 TLS |
| `cmd/migrate` | 按序应用 `internal/database/migrations/*.sql` |
| `cmd/import-legacy` | 旧 MySQL 一次性导入（默认只读预检，`--apply` 才写） |
| `internal/config` | 环境变量加载与启动期校验（密钥长度、占位值、CORS、TLS 成对等） |
| `internal/database` | GORM 连接池与迁移执行器（advisory lock + checksum） |
| `internal/identity` | 客户与管理员身份、会话、验证码、限流、登录审计、账号注销/导出 |
| `internal/web` | 数据模型与业务查询（客户、需求、帖子、家教、管理列表投影） |
| `internal/httpapi` | 路由、中间件（`security`/`recover`/`requestLog`）、handler、响应信封 |

## 2. 版本要求

| 组件 | 要求 | 说明 |
| --- | --- | --- |
| Go | **1.26.9** | `go.mod` 有 `toolchain go1.26.9`；更早的标准库有已修复漏洞（`govulncheck` 会报），不要降级 |
| pnpm | **≥10** | 锁文件由 pnpm 12 写入（只含 `snapshots` 段），**pnpm 9 连 `--version` 都会报 `packages field missing or empty`** |
| Node | ≥20.19 | `package.json` engines |
| PostgreSQL | 13+ | 权威库；迁移只在真实 PG 上验证过 16.2 |
| Redis | 6+ | 会话、验证码、限流计数 |
| Java / MySQL | 可选 | 仅回滚路径与旧数据来源 |

## 3. 后端约定（Go）

**响应契约**：一律 `{code, msg, data}`；分页 `{code, msg, total, rows}`。用 `writeSuccess` / `writeAPIError` / `writeTable`，业务错误用 `identity.Error` 或 `web.Error` 交给 `writeBusinessError` 映射，**不要手写裸 `http.Error`**。错误文案是固定中文，不拼内部细节。

**新增管理接口的三件套**：

1. 路由：`mux.HandleFunc("METHOD /path", a.adminAuth("<菜单权限>", a.handler))`；只要求登录时权限传 `""`。
2. 授权：handler 内不再做权限判断（中间件已做），但**对象级归属必须在查询条件里过滤**（参照 `applyAdminDataScope`）。
3. 审计：写操作必须在**同一个事务**里调用 `persistAdminAction(tx, r, "<action>", 白名单字段...)`；白名单只有 `target_id`/`target_ids`/`result`/`status`/`changed_rows`，**禁止把请求体、返回体、异常文本写进审计**。

**客户接口**：`a.customerAuth(a.handler)`，handler 拿到 `*identity.Session`。任何按 ID 读取他人资源的地方都要按 `session.Account.AccountID` 过滤；返回给客户的对象不得包含他人邮箱、手机号、最后登录时间。

**会话与令牌**：管理员 token HS512 + Redis `login_tokens:<32位hex>`（24 小时、剩余 <20 分钟续期）；客户会话落 PostgreSQL（`t_customer_session`，可吊销）。每个管理员请求都从 PG 重载账号状态与权限，所以**不要**把权限缓存进 token 或进程内。

**日志**：结构化 JSON；只记 `method`/`path`/`request_id`/`duration_ms`/动作与目标 id。**不得出现** JWT、会话 id、验证码、口令、完整邮箱或手机号。

**迁移**：只新增 `internal/database/migrations/NNNNNN_name.sql`；**禁止修改已应用的迁移**（checksum 校验会拒绝）；**禁止**在启动时 `AutoMigrate`。改 schema 的同时要同步 `internal/web` 模型与 `internal/identity` 查询。

**性能**：`/monitor/server` 的宿主机指标有 3 秒 TTL 缓存（`hostMetricsCache`），删掉它会让 50 并发下的 p50 从 ~9ms 退化到 ~500ms。

## 4. 前端约定（tutor-web）

- **没有默认后端前缀**：每个 `requestData/requestPage/requestOk` 调用必须显式写 `baseURL: '/web-api'`（客户）或 `'/admin-api'`（管理员）。漏写会打到同源直接 404——这是刻意的，用于防止新代码悄悄回挂到 Java 的 `/dev-api`。
- 接口封装集中在 `src/api/*.ts`，一个函数一个接口；类型放 `src/types/api.ts`。
- 登录态：管理员 `src/store/auth.tsx`（`setUnauthorizedHandler` 处理 401），客户 `src/store/customerAuth.tsx`。两套 token 的 storage key 不同，**不要混用**。
- 时间显示统一用 `formatDateTime`（解析 RFC3339 转本地时间、去小数秒）；不要直接渲染后端时间字段。
- 构建产物里不允许出现 `/dev-api`、`/prod-api`（`scripts/verify.sh` 会检查）。

## 5. 数据库与数据边界

- PostgreSQL 是权威库；MySQL 只作为迁移来源与回滚路径，**应用层不得直接读写 MySQL**。
- 审计表（`sys_login_audit`、`sys_oper_log`）在应用侧**只追加**：不要新增修改/删除/清空接口。归档是运维任务（见 `docs/DEPLOYMENT.md` §7）。
- 管理员口令哈希只在 `sys_user_auth.password_hash`；`sys_user` 表**没有** password 列（迁移 000004 已删），不要加回去。
- `cmd/import-legacy` 是**快照写入**（目标表必须为空），不是同步工具；对真实 MySQL 的预检与导入**尚未在本仓库环境验证过**。

## 6. 部署产物与两个必记的坑

| 文件 | 用途 |
| --- | --- |
| `deploy/nginx/tutor.conf` + `deploy/nginx/snippets/*` | TLS、HSTS、CSP、SPA 兜底、`/web-api` `/admin-api` 反代、登录限流 |
| `deploy/systemd/tutor-api.service` | 进程守护与沙箱加固 |
| `deploy/systemd/journald-tutor.conf`、`deploy/logrotate/tutor` | 日志留存 ≥6 个月 |

1. **nginx 的 `add_header` 不向下继承**：某层只要自己写了 `add_header`，父级全部 `add_header` 会被丢弃。给某个 location 加缓存头时，必须同时 `include snippets/tutor-headers.conf`，否则该路径**没有 HSTS/CSP/X-Frame-Options**。
2. **systemd 单元文件不支持行内注释**：`ProtectSystem=strict  # 说明` 会让该行**静默失效**。注释必须单独成行。

改完用 `nginx -t` 与 `systemd-analyze verify` 各验一次（方法见 `docs/VERIFICATION-RESULTS.md` §4）。

## 7. 配置与本地运行

- Go 服务配置放 `data/go-api.env`（或直接给环境变量），模板是 `tutor/tutor-api/.env.example`。**该文件含真实 `DATABASE_DSN` 与 `JWT_SECRET`，绝不要提交**；`data/` 已在 `.gitignore` 里。
- 端口：Go 12501（与 Java 并存期用 12502）、Web dev 12500、`vite preview` 4173、PostgreSQL 5432、Redis 6379、MySQL 3307。
- 启动：Windows `.\3b-go-api.bat`，Linux `bash bin-linux/3b-go-api.sh`（两者读同一份 `data\go-api.env`，有 Go 工具链就编译、先迁移后起服务、最后校验 `/health/ready`）。

## 8. 安全与数据边界（硬性）

- 服务端必须校验对象级权限与角色权限，**不能**依赖前端隐藏按钮或客户端传来的资源 ID。
- 不记录 JWT、验证码、微信凭据、口令或其他可复用密钥；排查问题用脱敏值。
- 上传文件必须校验类型与内容，不能把可执行内容当可信网页公开（当前上传仍在 Java 侧，未在 Go 侧实现）。
- 只信任明确配置的反向代理转发头（`TRUSTED_PROXY_CIDRS`）；**不要**直接信任客户端给的 `X-Forwarded-For`。
- `tutor/sql/tutor.sql` 是含业务数据的导出，`.gitignore` 已排除：**不要读取、复制、解除忽略或提交**。
- 不得为方便本地运行而关闭认证、授权、TLS 或密钥校验。

## 9. 验证与交付

改动后**至少**跑：`go build ./...`、`go vet ./...`、`gofmt -l .`、`corepack pnpm typecheck`、`corepack pnpm build`。提交前跑一次 `bash scripts/verify.sh`。

按改动类型追加验证（并在 `docs/VERIFICATION-RESULTS.md` 记录）：

| 改动涉及 | 必须额外验证 |
| --- | --- |
| 迁移 / SQL / 事务 | 在真实 PostgreSQL 上 `go run ./cmd/migrate`，对相关接口发真实请求，并用 SQL 核对落库结果 |
| 前端路由、页面、交互 | 真实浏览器回归（登录交互 + 各页面渲染无 JS 异常） |
| `deploy/` | `nginx -t`；拉起 nginx 检查跳转、响应头、SPA 兜底、前缀剥离；`systemd-analyze verify` |
| 隐私相关（注销、导出、公开接口字段） | 造两个账号，断言"不泄漏他人数据" |
| 监控、限流、锁定的阈值或实现 | 并发压测（含错误口令场景，确认无 5xx、不泄露账号是否存在） |

规则：

- **只在用户要求时才新增或运行测试**；没跑就明确说明验证范围，不要暗示已验证。
- 提交前检查 `git diff`、敏感信息、`git status`；只暂存明确相关的文件。
- **只在用户明确要求时提交或推送**；提交信息用简洁中文 + 要点列表，说明变更范围与验证情况。
- 文档里的命令、端口、环境变量必须与当前配置一致；不要把历史个人路径、账号、凭据或生产数据写进文档。

## 10. 不在范围内（不要动）

- Java 各模块：只作回滚路径，不做功能开发；也不要为了让页面工作而把新代码指回 `/dev-api`。
- `tutor/tutor-uniapp`：静态样张，不构建、不部署。
- `tutor/tutor-ui`：空目录。
- `tutor/tools/*.py`：Java 时代的早期验证脚本，仅作参考，不作为当前验证依据。

## 11. 文档索引

| 文档 | 内容 |
| --- | --- |
| `README.md` | 接口清单、已实现功能、边界、配置、端口、验证现状 |
| `docs/DEPLOYMENT.md` | 部署拓扑、最小权限数据库账号、nginx/systemd/logrotate 安装、切换与回滚、发布前验收 |
| `docs/SECURITY-BASELINE.md` | 等保 2.0 控制项对照、部署方须补齐的证据、依赖扫描记录 |
| `docs/DATA-PRIVACY.md` | 个人信息清单、告知同意、删除权、可携带权、未成年人章节 |
| `docs/VERIFICATION-RESULTS.md` | 验证的环境、命令、结果与未验证项（复现步骤在末尾） |
| `docs/adr/` | 架构决策：0001 Web-first Go 重写、0002 原生 Go 管理员认证 |
| `tutor/tutor-api/README.md` | Go 服务细节 |
| `TODO.md` | 未完成事项 |
