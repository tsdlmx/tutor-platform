# 验证记录

本文件记录实际执行过的验证、环境与结果。等保测评与上线评审可直接引用这里的条目；没有出现在本文件里的能力，视为未验证。

## 2026-10-21｜数据库迁移与核心链路（首次真库验证）

### 环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 11（开发机） |
| Go | go1.26.9（`go.mod` 的 `toolchain` 指定） |
| PostgreSQL | 16.2，免安装二进制，临时集群，`127.0.0.1:55433`，`trust` 认证（仅本机、验证后即停止） |
| Redis | 7.x，`127.0.0.1:6379` |
| 应用 | `go run ./cmd/server`，`APP_ENV=development`，`HTTP_ADDR=127.0.0.1:12533`，`PRIVACY_POLICY_VERSION=e2e-2026-10-21` |
| 数据 | 全部为验证用造数，验证后清理；未接入任何真实业务数据 |

### 1. 迁移

```bash
DATABASE_DSN=postgres://postgres@127.0.0.1:55433/postgres?sslmode=disable go run ./cmd/migrate
```

结果：11 个迁移全部应用成功（000001 → 000011），`schema_migrations` 记录 checksum；重复执行为幂等跳过。

### 2. 端到端检查（36 项，全部通过）

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

### 3. 观察到的行为（非缺陷）

- `profile.update`、`profile.password`、`online.force_logout` 的 `action_meta` 为 `{}`：这些动作没有"目标资源 id"，审计行仍记录标题、动作、操作人、地址、状态与耗时。只有带目标 id 的动作（教师审核、帖子审核、客户账号状态等）才写 `action_meta`。
- 服务监控在无数据库连接的实例上会把连接池降级为零值而不是报错（已由单元级检查覆盖）。

### 4. 仍未验证

| 项 | 原因 / 后续 |
| --- | --- |
| `cmd/import-legacy` 对真实 MySQL 的预检与 `--apply` | 环境内没有 MySQL 实例；上线前必须在预发库按 `docs/DEPLOYMENT.md` §5 跑一次预检并核对行数 |
| 浏览器交互回归 | 需要可用的后端与浏览器；react-router 6→7 升级后必须点一遍登录跳转、后台导航、H5 列表/详情/筛选 |
| TLS / 反向代理 / HSTS 实际生效 | 需要真实证书与反代；代码侧已有 HSTS 与可信代理校验 |
| 并发与性能 | 未做压测；限流与锁定的阈值需按真实流量校准 |
| 登录审计的归档保留 | 需在部署环境配置定时归档（见 `docs/DEPLOYMENT.md` §7） |

### 复现方式

验证程序为一次性脚本（含删除测试数据的语句，为避免误用在生产库上已从仓库删除）。若需重跑，按下列步骤在新库上执行：

1. 起一个临时 PostgreSQL 实例（16.x 即可），执行 `cmd/migrate`。
2. 用 `bcrypt` 生成测试口令哈希，插入 `sys_user` + `sys_user_auth` + `sys_role` + `sys_user_role` + `sys_menu` + `sys_role_menu`，并把 `sys_admin_auth_config` 的 `sys.account.captchaEnabled` 置为 `false`。
3. 起服务后按上表逐项发 HTTP 请求核对；数据库侧用 SQL 核对注销与审计结果。
