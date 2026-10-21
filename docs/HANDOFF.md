# 交接说明（给接手的 agent / 开发者）

本文是一份可直接执行的任务书：把它整段交给接手的 AI agent 或新同事，就能在不需要口头解释的情况下开始工作。

---

## 一、项目是什么

家教撮合平台（内部协作项目，非开源）：学生发布需求、老师申请联系、双方在广场交流，运营侧有管理后台。

仓库：`https://github.com/tsdlmx/tutor-platform`（私有，需要访问权限）。

**当前状态：后端已从 Java/Spring Boot 完整重构为 Go，Java 代码已从 `main` 删除。**
任何"还有一部分在 Java"的旧文档、旧截图、旧注释都不要信——以 `main` 上的源码、配置、锁文件和正在使用的脚本为准。

## 二、【第一步，必做】先读这几份，再动任何代码

| 文件 | 读它为了 |
| --- | --- |
| `README.md` | 60 条接口（方法/路径/认证/权限/行为）、已实现功能、边界、配置与密钥、端口 |
| `AGENTS.md` | 代码约定（响应契约、管理接口三件套、对象级授权、审计白名单、迁移规则）、验证门槛、已知坑 |
| `docs/DEPLOYMENT.md` | 部署拓扑、最小权限数据库账号、nginx/systemd/logrotate 安装、旧数据导入与回滚 |
| `docs/SECURITY-BASELINE.md` | 等保 2.0 控制项对照、部署方须补齐的证据、依赖扫描记录 |
| `docs/DATA-PRIVACY.md` | 个人信息清单、告知同意、删除权、可携带权、未成年人章节 |
| `docs/VERIFICATION-RESULTS.md` | 已经验证过什么、怎么验的、哪些还没验 |
| `TODO.md` | 未完成事项 |

**不要重复已经做过的验证，也不要声称验证过没跑的东西。**

## 三、技术栈与版本红线

| 组件 | 要求 | 说明 |
| --- | --- | --- |
| Go | **1.26.9** | `go.mod` 有 `toolchain go1.26.9`；更早的标准库有已修复漏洞，**不要降级** |
| pnpm | **≥10** | 锁文件由 pnpm 12 写入；**pnpm 9 连 `--version` 都会报 `packages field missing or empty`** |
| Node | ≥20.19 | `package.json` engines |
| PostgreSQL | 13+ | 权威库，实测 16.2 |
| Redis | 6+ | 会话、验证码、限流计数 |
| MySQL | 可选 | 8.x，**仅旧数据来源**（`cmd/import-legacy` 一次性导入后即可下线） |

- 后端：Go `net/http`（标准库路由）+ GORM + pgx + go-redis + golang-jwt v5 + bcrypt + gopsutil
- 前端：React 18 + TypeScript 5.7 + Vite 6 + react-router 7 + Tailwind 3 + Radix UI
- 部署：nginx + systemd + logrotate；CI 在 `.github/workflows/verify.yml`

## 四、怎么跑起来

```bash
# 1) 两个配置文件，都放 data/（已被 .gitignore 排除，绝不提交）
cp tutor/tutor-api/.env.example data/go-api.env
#   填 DATABASE_DSN / JWT_SECRET（≥32 字节，用 openssl rand -hex 32 生成）/ REDIS_ADDR / PRIVACY_POLICY_VERSION

cat > data/secrets.env <<'EOF'
MYSQL_ROOT_PASSWORD=<MySQL root 口令>
REDIS_PASSWORD=
PUBLIC_IP=
TLS_HOST=
EOF

# 2) 后端：编译 → 迁移 → 起服务 → 校验 /health/ready
bash bin-linux/3b-go-api.sh          # Linux
.\3b-go-api.bat                      # Windows

# 3) 前端
cd tutor/tutor-web
corepack pnpm install --frozen-lockfile
corepack pnpm dev -- --host 127.0.0.1 --port 12500

# 4) 健康检查
curl http://127.0.0.1:12501/health/ready
```

端口：Go API **12501**、Web dev 12500、`vite preview` 4173、PostgreSQL 5432、Redis 6379、MySQL 3307。

两个 env 文件的优先级是 **环境变量 > `data/secrets.env` > 脚本内置默认**。`MYSQL_ROOT_PASSWORD` 默认空，为空时 `5-init-db.sh` 会拒绝执行。**任何情况下都不要把密钥写进源码或提交。**

## 五、代码结构

```
tutor/tutor-api/            Go 后端（唯一后端）
  cmd/server               启动、HTTP 参数、优雅退出、可选 TLS
  cmd/migrate              版本化迁移（11 个，advisory lock + checksum）
  cmd/import-legacy        旧 MySQL 一次性导入（默认只读预检，--apply 才写）
  internal/config          环境变量加载与启动期校验
  internal/database        GORM 连接池与迁移执行器
  internal/identity        客户与管理员身份、会话、验证码、限流、登录审计、注销/导出
  internal/web             模型与业务查询
  internal/httpapi         路由、中间件、handler、响应信封
tutor/tutor-web/           React 管理台 + 客户 H5
deploy/                    nginx / systemd / logrotate 生产产物
scripts/verify.sh          上线前验收脚本
bin-linux/  *.bat          启动脚本
docs/                      部署、等保、隐私、验证记录、ADR
```

## 六、必须遵守的约定（违反会被打回）

1. **响应信封**：一律 `{code, msg, data}`，分页 `{code, msg, total, rows}`。用 `writeSuccess` / `writeAPIError` / `writeTable`，业务错误交给 `writeBusinessError` 映射，不要手写裸 `http.Error`。
2. **新增管理接口三件套**：
   - 路由挂 `a.adminAuth("<菜单权限>", handler)`，只要求登录时权限传 `""`；
   - 对象级归属必须在查询条件里过滤（参照 `applyAdminDataScope`）；
   - 写操作必须在**同一事务**里调 `persistAdminAction`，审计字段只允许 `target_id`/`target_ids`/`result`/`status`/`changed_rows`——**禁止把请求体、返回体、异常文本写进审计**。
3. **客户接口**：按 ID 读取他人资源时必须按会话 `account_id` 过滤；返回给客户的对象不得含他人邮箱、手机号、最后登录时间。
4. **前端没有默认后端前缀**：每个请求显式写 `baseURL: '/web-api'` 或 `'/admin-api'`。漏写会 404——这是刻意设计，防止偷偷回挂旧后端。
5. **会话**：管理员 HS512 + Redis `login_tokens:<32位hex>`（24 小时，剩余 <20 分钟续期）；客户会话落 PostgreSQL 的 `t_customer_session`，可吊销。**不要把权限缓存进 token 或进程内**——每个管理员请求都从 PG 重载账号状态与权限。
6. **迁移只能新增**：`internal/database/migrations/NNNNNN_name.sql`；禁止修改已应用的迁移（checksum 会拒绝）；禁止启动时 `AutoMigrate`；改 schema 要同步 `internal/web` 模型与查询。
7. **时间显示**统一用 `formatDateTime`（解析 RFC3339 转本地时间、去小数秒），不要直接渲染后端时间字段。
8. **不写死密钥/口令/公网 IP**：脚本通过 `data/secrets.env` 或同名环境变量读取；前端 localStorage key 用 `VITE_TOKEN_KEY` / `VITE_CUSTOMER_TOKEN_KEY` / `VITE_THEME_KEY` 覆盖。
9. **日志里不得出现** JWT、会话 id、验证码、口令、完整邮箱或手机号；只记 `method`/`path`/`request_id`/`duration_ms`/动作与目标 id。

## 七、边界（明确不做）

- **Java 后端已删除**，只在 tag `legacy-java-final` 里。不要从 tag 复制回来做功能开发，也不要新增任何 `/dev-api` 相关代码。
- `tutor/tutor-uniapp` 是静态样张（3 个页面、无 `package.json`、无接口调用、假数据），**不构建、不部署**。
- 以下能力目前在仓库里**不存在**（随 Java 一起删了）：文件上传、微信登录、部门/菜单/字典/参数/公告/岗位管理、用户与角色的增改删、小程序业务接口。
- 没有多租户、没有国际化、没有支付/财务。

## 八、已知坑（都踩过，别再踩）

1. **nginx `add_header` 不向下继承**：某层只要自己写了 `add_header`，父级全部 `add_header` 会被丢弃——页面会**直接失去 HSTS/CSP/X-Frame-Options**，而且不报错。给某个 location 加缓存头时，必须同时 `include snippets/tutor-headers.conf`。
2. **systemd 单元文件不支持行内注释**：`ProtectSystem=strict  # 说明` 会让该行**静默失效**，加固项等于没写。注释必须单独成行。
3. `/monitor/server` 的宿主机指标有 3 秒 TTL 缓存；删掉它会让 50 并发下 p50 从约 9ms 退化到约 500ms。
4. **`pnpm 9` 用不了这个仓库**（见版本红线），别为了"对齐环境"去降 pnpm。
5. `data/`（含真实 `DATABASE_DSN`、`JWT_SECRET`）与 `tutor/sql/tutor.sql`（含业务数据）**不要读取、复制、`git add -f` 或提交**。
6. 审计表只追加：不要给 `sys_login_audit` / `sys_oper_log` 加修改、删除、清空接口。

## 九、验证要求

改动后**至少**跑：

```bash
cd tutor/tutor-api && go build ./... && go vet ./... && gofmt -l .
cd tutor/tutor-web && corepack pnpm typecheck && corepack pnpm build
bash scripts/verify.sh          # 完整验收；无外网时 SKIP_AUDIT=1
```

按改动类型追加：

| 改动涉及 | 必须额外验证 |
| --- | --- |
| 迁移 / SQL / 事务 | 真实 PostgreSQL 上 `go run ./cmd/migrate`，发真实请求，用 SQL 核对落库结果 |
| 前端路由 / 页面 / 交互 | 真实浏览器跑一遍，确认每个页面渲染且无 JS 异常 |
| `deploy/` | `nginx -t`；拉起 nginx 检查跳转、响应头、SPA 兜底、前缀剥离；`systemd-analyze verify` |
| 隐私（注销、导出、公开字段） | 造两个账号，断言"不泄漏他人数据" |
| 限流 / 锁定 / 监控 | 并发压测，含错误口令场景，确认无 5xx、不泄露账号是否存在 |

**没跑就写"没跑"。不要用"看起来没问题""应该可以"结案。**

## 十、Git 工作流（无评审，直接推 main）

没有 PR/评审流程：改完验证通过就推 `main`。历史里有一个 tag `legacy-java-final`（删除 Java 前的最后一个提交）。

```bash
git switch main
git pull --ff-only                 # 先同步，避免推的时候打架
# ...改代码...
```

### 提交前必查三条

```bash
git status          # 只暂存该改的文件；多出来的先搞清楚是什么
git diff            # 逐行看，别把调试代码、注释掉的旧逻辑带进去
git diff --cached | grep -Ei 'password|passwd|secret|token|private key'          # Linux/macOS
git diff --cached | Select-String -Pattern 'password|secret|token|PRIVATE KEY'   # Windows
```

### 提交

一条提交只做一件事，不要顺手格式化整个项目。信息用中文：第一行 ≤50 字说做了什么，正文 `-` 列要点，写清范围与验证情况。

```bash
git commit -m "feat(upload): 增加头像上传并校验类型与大小" \
  -m "- 只接受 png/jpeg/webp 且 ≤2MB，按内容嗅探而非扩展名判断" \
  -m "- 文件名随机化，落在 uploadPath 下，拒绝路径穿越" \
  -m "- 验证：go build/vet、pnpm build 通过；实测 3 类正常文件 + 1 个伪造扩展名被拒"
```

### 推送

```bash
git fetch origin && git log --oneline HEAD..origin/main   # 有别人的新提交就先合并
git push origin main
```

- 推送前先 `fetch`；两人同时改 main 时冲突几乎都出在这里。
- **不要 force push `main`**。真要改写（比如提交里混进密钥），先 `git tag backup-<日期>`，再通知对方重新 clone，别让他 pull 到半截历史。
- 已推送的提交错了用 `git revert <commit>`，不要 rebase 重写。
- 不要提交生成物：`dist/`、`node_modules/`、日志、截图临时目录。

### 看历史与定位

```bash
git log --oneline -20                 # 最近提交
git log --oneline --grep='关键词'      # 按提交信息找
git show <commit>:<path>              # 某个提交里某个文件的内容
git log -p -- <path>                  # 这个文件的完整变更史
git blame <path>                      # 某一行是谁、哪次改的
```

### 需要参考旧 Java 实现时（只读）

```bash
git show legacy-java-final:tutor/tutor-admin/src/main/java/com/tutor/web/controller/system/SysUserController.java
```

Java 代码只在 tag 里作参考：**不要 cherry-pick、不要 merge 回 main、不要恢复 `/dev-api`**。

### 撤销

```bash
git restore <path>                 # 丢弃工作区改动
git restore --staged <path>        # 取消暂存，改动保留
git commit --amend                 # 只改自己刚提交、还没推的那一条
git revert <commit>                # 已推送的错了就 revert
```

## 十一、建议的下一步（按价值排序，可自选）

1. **`cmd/import-legacy` 对真实 MySQL 的预检与导入** —— 只在合成数据上验证过逻辑，从未对真实库跑过。这是当前最大的未验证项，切库前必须在预发库跑一次只读预检并核对行数。
2. **文件上传（若产品需要）** —— 按 Go 契约重写，必须做类型/内容校验（嗅探而非扩展名）、大小限制、文件名随机化、禁止路径穿越、独立来源提供。
3. **未成年人监护人同意流程** —— 当前完全没有，是唯一已知的个人信息合规缺口（见 `docs/DATA-PRIVACY.md` §6），需先与业务/法务确认是否限制未成年人使用。
4. **CI 固化** —— `.github/workflows/verify.yml` 已有两个 job（验收脚本 + postgres 迁移幂等），可把真库端到端与浏览器回归也接进去。
5. **生产容量** —— 只做过 50 并发冒烟，限流与锁定阈值需按真实流量校准。

## 十二、交付要求

- 每个改动说明三件事：**改了什么、为什么、风险是什么**。
- 只改该改的文件，不要顺手重构别的模块。
- 收尾交代四件事：**做到哪、验证了什么、还有什么没验证、下一步建议什么**。
- 没跑过的验证就说"没跑"，不要用"看起来没问题""应该可以"结案。
- 不确定的地方单独列出来（哪些需要额外信息才能判定），不要含糊带过或猜。
