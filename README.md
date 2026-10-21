# Tutor Platform（内部协作仓库）

家教撮合平台：学生发布需求、老师申请联系、双方在广场交流，运营侧有管理后台。

**当前状态**：Web 后端已从 Java + MySQL 迁移到 **Go + GORM + PostgreSQL**，React 管理台与 H5 客户端的全部请求只发往 Go 服务。Java 后端仍保留在仓库中，但**已没有任何客户端依赖它**，仅作为回滚路径。小程序端是静态样张，不部署。

本文档面向内部协作：接口清单、已实现功能、边界与验证现状。部署细节见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 一、怎么跑起来

### 1. Go Web API（后端）

需要 PostgreSQL 与 Redis。

```powershell
# 配置：从模板复制到 data/go-api.env（该目录已被 .gitignore 排除，绝不提交）
Set-Location D:\tutor-platform
Copy-Item tutor\tutor-api\.env.example data\go-api.env
# 编辑 data/go-api.env，至少填 DATABASE_DSN / JWT_SECRET / REDIS_ADDR / PRIVACY_POLICY_VERSION

# 一键：编译 → 迁移 → 起服务 → 校验 /health/ready（Windows）
.\3b-go-api.bat

# Linux 部署机等价命令
bash bin-linux/3b-go-api.sh
```

手工等价步骤：

```powershell
Set-Location tutor\tutor-api
$env:DATABASE_DSN = 'postgres://user:pass@127.0.0.1:5432/tutor?sslmode=disable'
$env:JWT_SECRET   = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:REDIS_ADDR   = '127.0.0.1:6379'
$env:PRIVACY_POLICY_VERSION = '2026-10-21'
go run ./cmd/migrate    # 11 个版本化迁移，幂等
go run ./cmd/server     # 默认监听 127.0.0.1:12501
```

### 2. Web 前端

```powershell
Set-Location tutor\tutor-web
corepack pnpm install --frozen-lockfile
corepack pnpm dev -- --host 127.0.0.1 --port 12500
```

打开 http://127.0.0.1:12500/admin/login（管理后台）或 http://127.0.0.1:12500/（客户侧）。

Vite 把 `/web-api`、`/admin-api` 代理到 Go 服务，目标由 `VITE_WEB_API_PROXY_TARGET`、`VITE_ADMIN_API_PROXY_TARGET` 指定（默认 `http://127.0.0.1:12501`）。

### 3. 健康检查

| 接口 | 说明 |
| --- | --- |
| `GET /health/live` | 进程存活 |
| `GET /health/ready` | PostgreSQL + Redis 就绪（各 2 秒超时） |

---

## 二、接口清单

统一响应信封 `{code, msg, data}`；分页列表为 `{code, msg, total, rows}`。错误用 HTTP 状态码 + `code` 表示（400/401/403/404/409/413/429/500）。

鉴权方式：

- **管理员**：`Authorization: Bearer <token>`，由 `POST /login` 签发（HS512 + Redis 会话）。每个请求重新加载账号状态、角色与菜单权限，因此停权/收权立即生效。表里"权限"列的字符串即所需菜单权限，`—` 表示登录即可。
- **客户会话**：`Authorization: Bearer <token>`，由 `POST /customer/auth/login` 签发（会话落 PostgreSQL，可吊销）。
- **公开**：无需令牌。

### 2.1 管理员认证与自服务

| 方法 | 路径 | 认证 | 权限 | 说明 |
| --- | --- | --- | --- | --- |
| GET | `/captchaImage` | 公开 | — | 登录验证码，返回 `{captchaEnabled, uuid, img}`；配置关闭时 `captchaEnabled=false` |
| POST | `/login` | 公开 | — | `{username, password, code, uuid}` → `{token}`；有失败锁定与限流 |
| GET | `/getInfo` | 管理员 | — | 当前账号 + 角色 + 权限 |
| POST | `/logout` | 公开 | — | 删除服务端会话，幂等 |
| GET | `/system/user/profile` | 管理员 | — | 个人信息（含 roleGroup） |
| PUT | `/system/user/profile` | 管理员 | — | 改昵称/邮箱/手机/性别，含唯一性校验 |
| PUT | `/system/user/profile/updatePwd` | 管理员 | — | 改密码，**校验旧密码**，成功后撤销该账号其他会话 |

### 2.2 管理端业务

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/system/user/list` | `system:user:list` | 系统用户列表（按 legacy 部门数据范围过滤） |
| GET | `/system/role/list` | `system:role:list` | 角色列表 |
| GET | `/system/tutorInfo/list` | `system:tutor:list` | 家教档案列表（审核入口） |
| GET | `/system/tutorInfo/{tutorID}` | `system:tutor:query` | 家教详情 |
| PUT | `/system/tutorInfo/audit` | `system:tutor:edit` | 审核通过/拒绝；**写操作与审计行同事务** |
| DELETE | `/system/tutorInfo/{tutorIDs}` | `system:tutor:remove` | 批量删除（逗号分隔） |
| GET | `/system/userPost/list` | `system:userPost:list` | 帖子列表 |
| GET | `/system/userPost/pendingCount` | `system:userPost:list` | 待审核数量 |
| PUT | `/system/userPost/audit` | `system:userPost:audit` | 帖子审核 |
| GET | `/system/customerAccount/list` | `system:customerAccount:list` | 客户账号列表 |
| GET | `/system/customerAccount/{accountID}` | `system:customerAccount:query` | 客户账号详情 |
| PUT | `/system/customerAccount/status` | `system:customerAccount:edit` | 启用/停用 |
| GET | `/system/wxUser/list` | `system:wxUser:list` | 微信历史用户（只读） |
| GET | `/system/wxUser/{userID}` | `system:wxUser:query` | 微信历史用户详情（只读） |

### 2.3 监控与审计

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/monitor/online/list` | `monitor:online:list` | 在线会话（读 Redis `login_tokens:*`） |
| DELETE | `/monitor/online/{tokenID}` | `monitor:online:forceLogout` | 强制下线；不允许踢自己 |
| GET | `/monitor/logininfor/list` | `monitor:logininfor:list` | 登录审计（读 `sys_login_audit`，账号筛选按掩码匹配） |
| GET | `/monitor/operlog/list` | `monitor:operlog:list` | 操作审计（读 `sys_oper_log`，只含安全元数据） |
| GET | `/monitor/server` | `monitor:server:list` | 宿主机 CPU/内存/磁盘（3 秒缓存）+ Go 运行时 + 数据库连接池 |

### 2.4 客户 Web（H5）

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/customer/auth/send-code` | 公开 | 注册验证码（限流；未配 SMTP 时返回 503） |
| POST | `/customer/auth/send-reset-code` | 公开 | 找回密码验证码（未注册邮箱也返回成功，防枚举） |
| POST | `/customer/auth/reset-password` | 公开 | 用验证码重置密码，成功后撤销该账号全部会话 |
| POST | `/customer/auth/register` | 公开 | 注册；**必须传 `consent: true`**，同意记录含政策版本 |
| POST | `/customer/auth/login` | 公开 | 邮箱登录；失败有锁定与限流 |
| GET | `/customer/auth/me` | 客户会话 | 当前账号 |
| PUT | `/customer/auth/role` | 客户会话 | 选择身份（TEACHER/STUDENT，一次性） |
| POST | `/customer/auth/logout` | 客户会话 | 退出（吊销会话） |
| POST | `/customer/auth/delete-account` | 客户会话 | 注销：校验密码后单事务删除账号及本人数据 |
| GET | `/customer/auth/export` | 客户会话 | 导出本人数据（JSON 附件，不含他人信息） |
| GET | `/customer/subjects` | 公开 | 学科字典 |
| GET | `/customer/demands` | 客户会话 | 需求列表 |
| GET | `/customer/demands/stats` | 客户会话 | 需求统计 |
| GET | `/customer/demands/applied` | 客户会话 | 已申请的需求 |
| GET | `/customer/demands/applications` | 客户会话 | 收到的申请 |
| GET | `/customer/demands/{demandID}` | 客户会话 | 需求详情 |
| POST | `/customer/demands` | 客户会话 | 发布需求 |
| PUT | `/customer/demands/{demandID}` | 客户会话 | 修改需求（仅本人） |
| DELETE | `/customer/demands/{demandID}` | 客户会话 | 删除需求（仅本人） |
| PUT | `/customer/demands/{demandID}/status` | 客户会话 | 改需求状态 |
| POST | `/customer/demands/{demandID}/apply` | 客户会话 | 老师申请联系 |
| GET | `/customer/profile/me` | 客户会话 | 本人主页 |
| PUT | `/customer/profile` | 客户会话 | 保存老师简历（仅 TEACHER） |
| GET | `/customer/profile/{accountID}` | 客户会话 | 他人主页（**不含邮箱与最后登录时间**） |
| GET | `/customer/profile/{accountID}/posts` | 客户会话 | 他人已通过审核的帖子 |
| GET | `/customer/posts/mine` | 客户会话 | 我的帖子（含未审核） |
| GET | `/customer/posts/plaza` | 客户会话 | 广场（仅审核通过） |
| POST | `/customer/posts` | 客户会话 | 发帖（待审核） |
| DELETE | `/customer/posts/{postID}` | 客户会话 | 删除本人帖子 |

### 2.5 小程序兼容（只读）

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/miniapp/auth/checkLogin` | 公开 | 读共享会话，返回 `{isLogin, userId}`，给 H5 判断登录态 |
| GET | `/miniapp/tutor/list` | 公开 | 公开教师目录（**不含联系电话**） |
| GET | `/miniapp/tutor/detail/{tutorID}` | 公开 | 公开教师详情（**含联系电话**，供联系动作） |

---

## 三、已实现的功能

**客户侧（H5 / 响应式）**：邮箱注册（需验证码 + 同意政策）、登录、找回密码、选择身份、老师简历编辑、需求发布/编辑/删除/状态流转、老师申请联系、需求池与我的需求、帖子发布与我的帖子、广场、他人主页、公开教师列表与详情、账号注销、数据导出、退出。

**运营侧（管理后台）**：管理员登录（验证码 + 失败锁定）、个人信息与改密、数据概览、家教档案审核（通过/拒绝/删除）、帖子审核与待审计数、入驻老师/学生账号查询与启停、系统用户与角色列表、在线会话与强制下线、登录日志、操作日志、服务监控。

**平台侧**：PostgreSQL 版本化迁移（11 个）、旧 MySQL 一次性导入工具（预检 + `--apply`）、结构化日志（JSON，不记敏感值）、健康探针、优雅退出、登录审计与操作审计（只追加）。

---

## 四、边界（明确不做什么）

### 4.1 仍在 Java 的接口

这些接口**当前没有前端页面调用**，因此没有迁移；Java 服务退役时一并消失。若将来要用，按 Go 侧契约重新实现，**不要回挂 `/dev-api`**。

`/system/user/**`（用户增改删与详情）、`/system/role/**`（角色增改删与数据权限）、`/system/dept/**`、`/system/menu/**`、`/system/dict/**`、`/system/config/**`、`/system/notice/**`、`/system/post/**`、`/system/parentInfo/**`、`/system/studentInfo/**`、`/monitor/cache/**`、`/common/**`（上传）、`/miniapp/auth/**`（微信登录）、`/miniapp/parent/**`、`/miniapp/teacher/**`、`/miniapp/tutor/**` 的业务写接口、`/test/user/**`。

### 4.2 不在本次范围

- **小程序（uni-app）**：仓库里的 `tutor/tutor-uniapp` 只有 3 个页面、没有 `package.json`、没有任何 `uni.request` 调用、首页是硬编码假数据、AppID 已清空——是不部署的静态样张，不参与上线。
- **导出格式互通**：导出为内部 JSON（`schemaVersion: "1"`），不承诺与第三方格式兼容。
- **多租户 / 组织隔离**：没有租户概念，全部客户在同一数据面内。
- **国际化**：仅中文。
- **支付 / 财务**：代码中没有相关实现。

### 4.3 已知限制

| 项 | 现状 |
| --- | --- |
| 未成年人注册 | 没有年龄段识别与监护人同意。上线前需法务/运营决定"限制未成年人"或"补监护人同意流程"（见 `docs/DATA-PRIVACY.md` §6） |
| 旧数据导入 | `cmd/import-legacy` 只在合成数据上验证过逻辑，**从未对真实 MySQL 跑过**；切库前必须在预发库跑只读预检并核对行数 |
| 真实证书 TLS | `deploy/nginx/tutor.conf` 验证时用自签证书；真实证书链与 OCSP 需部署环境复核 |
| 生产容量 | 只做过 50 并发冒烟（见验证记录），限流与锁定阈值需按真实流量校准 |
| 上传 | 上传仍由 Java `/common/**` 提供；文件类型校验与内容隔离未在 Go 侧实现 |
| 双因素认证 | 未实现（若定级要求需补） |
| Java 依赖 | Spring Boot 2.5 / POI 等老依赖未做漏洞扫描，随 Java 退役消解 |

---

## 五、数据与迁移

- 权威库：PostgreSQL。迁移文件在 `tutor/tutor-api/internal/database/migrations/`，命名 `NNNNNN_name.sql`，由 `cmd/migrate` 按序应用（advisory lock + checksum，改历史文件会被拒绝）。
- 关键表：`sys_user` / `sys_user_auth`（管理员与 BCrypt 哈希分离）、`sys_role` / `sys_user_role` / `sys_role_menu` / `sys_menu` / `sys_dept`（RBAC 与数据范围）、`sys_oper_log`（操作审计）、`sys_login_audit`（登录审计）、`sys_admin_auth_config`（验证码开关/登录黑名单）、`t_customer_account` / `t_customer_session` / `t_customer_consent`、`t_teacher_profile`、`t_student_demand` / `t_demand_apply`、`t_user_post`、`t_tutor_info` / `t_tutor_qualification`、`t_wx_user` / `t_parent_info`（历史数据）。
- 审计表在应用侧**只追加**：没有修改/删除/清空接口，归档由运维定时执行。
- 旧 MySQL：仅作迁移来源与回滚路径，导入流程见 `docs/DEPLOYMENT.md` §5。

---

## 六、配置项

Go 服务（`data/go-api.env`，不入库）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_DSN` | 是 | PostgreSQL 连接串 |
| `JWT_SECRET` | 是 | ≥32 字节；生产环境拒绝文档占位值 |
| `REDIS_ADDR` / `REDIS_PASSWORD` | 是 / 视环境 | 会话、验证码、限流 |
| `PRIVACY_POLICY_VERSION` | 生产必填 | 注册同意记录里存这个版本号 |
| `HTTP_ADDR` | 否 | 默认 `127.0.0.1:12501` |
| `TRUSTED_PROXY_CIDRS` | 否 | 只填自建反代网段；为空则完全忽略转发头 |
| `CORS_ALLOWED_ORIGINS` | 否 | 留空 = 仅同源；生产拒绝通配符 |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | 否 | 进程直接终止 TLS 时成对填写 |
| `SMTP_*` | 否 | 未配置时注册/找回验证码返回 503（安全失败） |
| `LEGACY_MYSQL_DSN` | 否 | 仅 `cmd/import-legacy` 使用，必须是只读账号 |

前端构建期变量：`VITE_CUSTOMER_API_BASE_URL`、`VITE_WEB_API_PROXY_*`、`VITE_ADMIN_API_PROXY_*`、`VITE_PRIVACY_POLICY_URL`、`VITE_ASSET_BASE_URL`、`VITE_USE_MOCK`。

前端**没有默认后端前缀**：每个请求必须显式给 `/web-api` 或 `/admin-api`；漏写会打到同源直接 404，不会静默回落到 Java。

---

## 七、端口

| 用途 | 端口 |
| --- | --- |
| Go Web API | 12501（默认）；与 Java 并存期用 12502 |
| Java 后端（回滚路径） | 12501 |
| Web 开发服务器 | 12500；`vite preview` 4173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MySQL（历史数据） | 3307 |

---

## 八、脚本

| 脚本 | 用途 |
| --- | --- |
| `3b-go-api.bat` / `3b-go-api.ps1` | Windows：读 `data\go-api.env`、检查 PG/Redis、编译、迁移、起服务、校验 `/health/ready`；`-Port/-SkipBuild/-Stop` |
| `bin-linux/3b-go-api.sh` | Linux 等价脚本 |
| `bin-linux/0-start-all.sh` | 一键起 MySQL/Redis/Java/前端；存在 `data/go-api.env` 时一并起 Go |
| `bin-linux/9-stop-all.sh` | 停止全部（含 go-api） |
| `scripts/verify.sh` | 上线前验收：Go 构建/vet/gofmt、govulncheck、迁移命名、前端冻结安装/类型检查/构建、产物不得残留 `/dev-api`、依赖审计 |
| `.github/workflows/verify.yml` | CI：`verify` 跑验收脚本；`migrate` 起 postgres:16 连跑两次迁移验幂等 |

---

## 九、安全与隐私（摘要）

- 响应头：`nosniff`、`X-Frame-Options: DENY`、`CSP`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`，TLS 时附 HSTS；nginx 侧另有一份（见 `deploy/`）。
- 会话：管理员 24 小时、剩余不足 20 分钟续期，退出即删；客户 24 小时可吊销，改密/注销即失效。
- 登录防护：验证码（可配置）、失败锁定（管理员 5 次/15 分钟、客户 10 次/10 分钟）、按地址限流；错误提示不区分账号是否存在。
- 审计：`sys_login_audit` 记登录/注册/改密/注销（只存掩码标识、地址、固定原因码）；`sys_oper_log` 记管理写操作（白名单元数据）。
- 隐私：注册强制同意并记录政策版本；注销单事务删除本人全部数据；导出只含本人数据；公开教师列表不返回联系电话；他人主页不返回邮箱与最后登录时间。
- 等保对照与上线阻断清单见 [docs/SECURITY-BASELINE.md](docs/SECURITY-BASELINE.md)；个人信息清单与保留策略见 [docs/DATA-PRIVACY.md](docs/DATA-PRIVACY.md)。

---

## 十、验证现状

已执行并通过（细节、命令与未验证项见 [docs/VERIFICATION-RESULTS.md](docs/VERIFICATION-RESULTS.md)）：

| 验证 | 规模 |
| --- | --- |
| 迁移（真实 PostgreSQL 16.2） | 11 个迁移全部应用，重复执行幂等 |
| 接口端到端（真实库 + 真实 HTTP） | 36 项 |
| 浏览器回归（真实 Chrome，CDP 驱动） | 31 项 |
| 部署产物（真实 nginx 1.30.6） | 13 项 |
| 数据导出（含"不泄漏他人数据"断言） | 20 项 |
| 并发压测 | 9 项（50 并行读、20 并行写、40 并行错误口令，无 5xx） |

---

## 十一、文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署拓扑、端口分配、最小权限数据库账号、nginx/systemd/logrotate 安装、切换与回滚 |
| [docs/SECURITY-BASELINE.md](docs/SECURITY-BASELINE.md) | 等保 2.0 控制项逐条对照、部署方须补齐的证据、依赖扫描记录 |
| [docs/DATA-PRIVACY.md](docs/DATA-PRIVACY.md) | 个人信息清单、告知同意、删除权、可携带权、未成年人章节 |
| [docs/VERIFICATION-RESULTS.md](docs/VERIFICATION-RESULTS.md) | 每次验证的环境、命令、结果与未验证项 |
| [docs/CUSTOMER-API.md](docs/CUSTOMER-API.md) | 客户侧接口早期契约说明；与 Go 实现的差异以本文第二节为准 |
| [docs/adr/](docs/adr) | 架构决策记录（0001 Web-first Go 重写、0002 原生 Go 管理员认证） |
| [tutor/tutor-api/README.md](tutor/tutor-api/README.md) | Go 服务细节：配置、路由、认证、迁移、导入 |
| [TODO.md](TODO.md) | 未完成事项与进度 |

---

## 十二、许可证

本项目使用 [MIT License](tutor/LICENSE)。
