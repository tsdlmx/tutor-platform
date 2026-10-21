# 验证记录

本文件记录实际执行过的验证、环境与结果。等保测评与上线评审可直接引用这里的条目；没有出现在本文件里的能力，视为未验证。

## 2026-10-21｜数据库迁移、核心链路、浏览器与部署产物

### 环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11（开发机） |
| Go | go1.26.9（`go.mod` 的 `toolchain` 指定） |
| PostgreSQL | 16.2，免安装二进制，临时集群，`127.0.0.1:55433`，`trust` 认证（仅本机、验证后即停止） |
| Redis | 7.x，`127.0.0.1:6379` |
| 应用 | `go run ./cmd/server`，`APP_ENV=development`，`HTTP_ADDR=127.0.0.1:12533`，`PRIVACY_POLICY_VERSION=e2e-2026-10-21` |
| 前端 | `pnpm build` 产物，`vite preview` 伺服，`/web-api`、`/admin-api` 反代到测试 API |
| 浏览器 | 本机 Chrome，`--headless=new` + DevTools Protocol |
| nginx | 1.30.6（Arch 包解包后直接运行，未安装到系统），验证用自签证书 |
| 数据 | 全部为验证用造数，验证后清理；未接入任何真实业务数据 |

### 1. 迁移

```bash
DATABASE_DSN=postgres://postgres@127.0.0.1:55433/postgres?sslmode=disable go run ./cmd/migrate
```

结果：11 个迁移全部应用成功（000001 → 000011），`schema_migrations` 记录 checksum；重复执行为幂等跳过。

### 2. 接口级端到端检查（36 项，全部通过）

| 分组 | 检查项 |
| --- | --- |
| 身份鉴别 | 未配置验证码开关时管理员登录必须要求验证码；登录成功签发令牌；第二个会话独立建立；伪造令牌返回 401 |
| 授权 | `getInfo` 返回账号与角色/权限；有权限的接口通过；无 `Authorization` 或篡改令牌被拒绝 |
| 会话管理 | 在线会话列表返回真实会话；改密后**其他**会话立即 401、当前会话仍有效；旧密码登录被拒、新密码可登录 |
| 强制下线 | 强退成功；被强退会话立即 401；重复强退幂等 |
| 服务监控 | `/monitor/server` 返回 CPU 核心数、Go 运行时版本、数据库连接池上限 |
| 登录审计 | `/monitor/logininfor/list` 同时含成功与失败记录，文案来自固定原因码 |
| 操作审计 | `/monitor/operlog/list` 含改密与强退动作；教师审核的写操作与审计行**同事务落库**；`action_meta` 只含白名单字段且记录了目标 id 与结果 |
| 删除权 | 客户登录成功；错误密码注销被拒（400）；正确密码注销成功；注销后会话立即失效 |
| 数据实际状态 | 注销后 `t_customer_account`、`t_customer_consent`、`t_customer_session` 均无残留；`sys_login_audit` 有且仅有一条 `self_deletion` 成功记录；所有审计标识均为掩码形式 |

### 3. 浏览器回归（31 项，全部通过）

真实 Chrome 驱动打包产物，覆盖登录交互与全部后台页面。截图保存在 `runtime/shots/`（`runtime/` 已被 `.gitignore` 排除，不随仓库提交）。

| 分组 | 检查项 |
| --- | --- |
| 登录交互 | 后台登录页渲染；**真实填写账号密码并提交**；登录后跳转到后台首页；登录态写入本地存储；无 JS 异常 |
| 后台页面 | `/admin/tutor`（含审核数据）、`/admin/server`（Go 运行时监控）、`/admin/logininfor`（掩码账号）、`/admin/operlog`（家教信息）、`/admin/online`、`/admin/profile`、`/admin/user`、`/admin/role`、`/admin/student`、`/admin/post` 全部渲染出预期数据，且**每页均无 JS 异常** |
| 路由守卫 | 清空登录态后访问 `/admin/tutor` 被导航回 `/admin/login` |
| 公开页面 | 游客访问 `/tutors` 能看到教师列表 |
| 客户侧 | 客户登录页渲染；登录后离开登录页并看到「我的需求」中的真实需求数据 |

这一节同时为 react-router 6→7 的大版本升级提供了运行时证据：路由、懒加载、`useSearchParams`、`Navigate` 均正常。

回归中发现并修复三处问题：

1. 侧边栏「服务监控」的说明仍是 `CPU / 内存 / JVM`，迁移到 Go 后应为「运行时」。
2. 服务监控页的「服务器 IP」取到了 `169.254.x.x` 链路本地地址（未配置的虚拟网卡先被枚举），已改为跳过 loopback 与 link-local、优先私有/全局地址；复测返回 `192.168.128.1`。
3. 列表时间直接显示后端返回的 RFC3339（`2026-10-21T13:08:56.943872Z`），`formatDateTime` 对字符串只做了 `T`→空格；已改为解析 ISO 字符串并转本地时间、去掉小数秒，全站生效（复测显示 `2026-10-21 21:08:56`）。

### 4. 部署产物（nginx + systemd，13 项，全部通过）

- `nginx -t`：`deploy/nginx/tutor.conf` 语法通过。
- 功能检查（拉起真实 nginx + 假上游）：80→443 返回 301 且保留路径与 Host；5 个安全响应头（HSTS、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、CSP）全部存在，CSP 内容符合 SPA 需要；前端路由回落到 `index.html`；`index.html` 返回 `no-store`；`/admin-api/health/ready` 与 `/web-api/miniapp/tutor/list` 剥离前缀后正确转发；连续 14 次 `/admin-api/login` 触发 `limit_req` 返回 503。
- `systemd-analyze verify`：单元文件解析通过（只剩"ExecStart 二进制尚未安装"的预期提示）。

验证过程中抓到并修复一个**真安全缺陷**：nginx 的 `add_header` 在子层出现时会丢弃父层全部 `add_header`，而 SPA 外壳由带 `Cache-Control` 的 `location = /index.html` 处理，导致页面响应**完全没有 HSTS/CSP/X-Frame-Options**。已把公共头抽成 `snippets/tutor-headers.conf`，并在每个自带 `add_header` 的 location 里重新 include；复测通过。

`systemd-analyze verify` 还抓到单元文件里写了行内注释——systemd 会把注释当成值的一部分而使该行失效（`ProtectSystem=strict` 等加固项会静默不生效），已改为注释单独成行。

### 5. 数据导出与日志留存（20 项，全部通过）

- 数据导出：用两个客户（A 导出、B 仅作为他人数据存在）验证 `GET /customer/auth/export`。20 项断言全部通过——导出含账号/同意记录/简历/本人帖子/本人需求/收到与发出的申请，`Content-Disposition` 为附件；隐私侧确认导出内容**不含口令哈希、不含他人邮箱/帖子/需求/他人账号 id**；未认证访问返回 401。
- 日志留存：`deploy/logrotate/tutor` 用真实 logrotate 3.22.0 以 `-d` 演练解析通过（识别出 weekly、26 rotations、empty log files 跳过等语义）；`deploy/systemd/journald-tutor.conf` 为 key=value 形式，随 systemd 单元一并交付。

### 6. 观察到的行为（非缺陷）

- `profile.update`、`profile.password`、`online.force_logout` 的 `action_meta` 为 `{}`：这些动作没有"目标资源 id"，审计行仍记录标题、动作、操作人、地址、状态与耗时。只有带目标 id 的动作（教师审核、帖子审核、客户账号状态等）才写 `action_meta`。
- 服务监控在无数据库连接的实例上会把连接池降级为零值而不是报错（已由单元级检查覆盖）。
- 已登录客户访问 `/tutors` 会被 `RequireGuestOnly` 重定向——这是既有产品行为，不是缺陷。

### 7. 仍未验证

| 项 | 原因 / 后续 |
| --- | --- |
| `cmd/import-legacy` 对真实 MySQL 的预检与 `--apply` | 环境内没有 MySQL 实例；上线前必须在预发库按 `docs/DEPLOYMENT.md` §5 跑一次预检并核对行数 |
| 真实证书链下的 TLS / HSTS / OCSP | 配置已用自签证书验证；需在部署环境用真实证书复核签发链与 `ssl_stapling` |
| 并发与性能 | 未做压测；限流与锁定的阈值需按真实流量校准 |
| 登录审计的归档保留 | 已提供 `deploy/logrotate/tutor` 与 `deploy/systemd/journald-tutor.conf`；数据库审计表的归档 SQL 需部署方按 `docs/DEPLOYMENT.md` §7 定时执行 |
| 小程序端 | 仓库内的 uni-app 是不部署的静态样张，未纳入验证 |

### 复现方式

接口与浏览器验证使用一次性脚本（含删除测试数据的语句，为避免误用在生产库上已从仓库删除）。若需重跑：

1. 起一个临时 PostgreSQL（16.x），执行 `cmd/migrate`。
2. 用 `bcrypt` 生成测试口令哈希，插入 `sys_user` + `sys_user_auth` + `sys_role` + `sys_user_role` + `sys_menu` + `sys_role_menu`，并把 `sys_admin_auth_config` 的 `sys.account.captchaEnabled` 置为 `false`。
3. 起服务后按第 2 节逐项发 HTTP 请求核对；数据库侧用 SQL 核对注销与审计结果。
4. 前端构建后由 `vite preview` 伺服（`VITE_WEB_API_PROXY_TARGET`、`VITE_ADMIN_API_PROXY_TARGET` 指向测试 API），用 Chrome DevTools Protocol 驱动第 3 节的页面。
5. 部署产物：`nginx -t` 校验语法；拉起 nginx 后按第 4 节核对跳转、响应头、SPA 兜底、前缀剥离与限流。
