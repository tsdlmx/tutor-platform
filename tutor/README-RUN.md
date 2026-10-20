# 家教中介平台 —— 运行说明（交付版）

> 这份文档写给「拿到这个文件夹、想把它跑起来」的人。
> 所有命令都是实测通过的，不是照抄 README 写的。

---

## 一、这次交付做了什么

原来的项目（`springmeng/tutor` 的 ZIP 下载版）**开箱跑不起来**，而且有两个隐藏很深的 Bug。
本次交付做了三件事：

| # | 事项 | 状态 |
|---|---|---|
| 1 | 把后端真正跑起来（JDK + Maven + MySQL + Redis + Spring Boot） | ✅ 接口验证 28/28 通过 |
| 2 | 补出缺失的 Web 前端（电脑端管理后台 + H5 移动端），rare-ui 风格 | ✅ 构建通过、浏览器验证 15/15 通过 |
| 3 | 换掉原作者的小程序 AppID | ✅ 已置为占位符 |

另外**修了 3 个真 Bug**（详见第五节），其中一个会让登录页直接白屏。

---

## 二、目录与环境总览

```
E:\Desktop\张圃瑜\家教中介\          ← 项目本体
├── tutor-admin / tutor-framework / tutor-system / tutor-common / tutor-quartz / tutor-generator
│                                    ← 原来的 6 个 Java 模块（后端）
├── tutor-uniapp\                    ← 原来的微信小程序（AppID 已替换）
├── tutor-web\                       ← ★ 本次新建：Web 前端（React + Vite + TS + Tailwind + motion）
│   ├── src\pages\admin\             ←   电脑端后台 14 个页面
│   ├── src\pages\h5\                ←   移动端 H5 4 个页面
│   ├── src\components\rare\         ←   rare-ui 风格动效组件（弹簧侧边栏、里程表数字、gooey 标签栏…）
│   └── dist\                        ←   已构建好的生产包
├── sql\
│   ├── tutor.sql                    ← 原库表结构（35 张表）
│   ├── patch-01-subject-names.sql   ← ★ 本次新增：修复「按科目筛选查不到」
│   └── demo-seed.sql                ← ★ 本次新增：演示数据（13 家教 / 6 家长 / 8 学员 / 18 微信用户）
├── tools\                           ← ★ 本次新增：三个验证脚本
│   ├── verify-api.py                ←   后端接口验证（28 项）
│   ├── verify-web-e2e.py            ←   前后端联调验证（16 项）
│   └── verify-browser.py            ←   真实浏览器验证 + 自动截图（16 项）
├── docs\screenshots\                ← ★ 本次新增：8 张页面截图
└── bin\                             ← 一键启动脚本

E:\dsh-dev\                          ← 本次安装的运行时（不是项目的一部分）
├── jdk8\jdk8u504-b01\               ← JDK 8（Temurin 1.8.0_504）
├── maven\apache-maven-3.9.16\       ← Maven
├── mysql\mysql-8.0.28-winx64\       ← MySQL 8.0.28
├── mysql-data\                      ← MySQL 数据目录
├── redis\                           ← Redis 5.0.14.1（Windows 版）
├── m2\                              ← Maven 本地仓库（避免占用 C 盘）
├── settings.xml                     ← Maven 配置（阿里云镜像 + 仓库指向 E 盘）
└── my.ini                           ← MySQL 配置（端口 3307）
```

> **为什么装在 `E:\dsh-dev`**：① C 盘当时只剩 3 GB，装不下；② MySQL 在 Windows 上
> 对**非 ASCII 路径**（`张圃瑜`）容易出问题，所以运行时全部放在纯英文路径下。

---

## 三、怎么启动（推荐用脚本）

在 `bin\` 目录里双击，**按顺序**启动 4 个窗口：

| 脚本 | 作用 | 端口 |
|---|---|---|
| `0-start-all.bat` | 一键把下面 4 个全部拉起来 | — |
| `1-mysql.bat` | 启动 MySQL | 3307 |
| `2-redis.bat` | 启动 Redis | 6379 |
| `3-backend.bat` | 启动 Spring Boot 后端 | 8080 |
| `4-web.bat` | 启动前端开发服务器 | 5173 |
| `9-stop-all.bat` | 全部关掉 | — |

启动完成后访问：

| 入口 | 地址 |
|---|---|
| **电脑端管理后台** | http://127.0.0.1:5173/admin/login |
| **H5 移动端** | http://127.0.0.1:5173/h5 |
| 后端接口文档（Swagger） | http://127.0.0.1:8080/swagger-ui/index.html |

**登录账号**：`admin`（口令已在部署时改为强口令，仓库里不保存明文）

> 后端当前 **关闭了图形验证码**（数据库 `sys_config` 里 `sys.account.captchaEnabled=false`），
> 登录页会自动检测到并隐藏验证码输入框。

### 手动启动（如果你想自己敲命令）

```powershell
# 1) MySQL
& 'E:\dsh-dev\mysql\mysql-8.0.28-winx64\bin\mysqld.exe' --defaults-file=E:\dsh-dev\my.ini --console

# 2) Redis
& 'E:\dsh-dev\redis\redis-server.exe' 'E:\dsh-dev\redis\redis.windows.conf' --dir 'E:\dsh-dev\redis'

# 3) 后端（JVM 参数用环境变量传，原因见第七节）
$env:JAVA_HOME = 'E:\dsh-dev\jdk8\jdk8u504-b01'
$env:JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8'
Set-Location 'E:\Desktop\张圃瑜\家教中介'
& "$env:JAVA_HOME\bin\java.exe" -jar 'tutor-admin\target\tutor-admin.jar'

# 4) 前端
$env:PATH = "C:\Users\樊佳鑫\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
Set-Location 'E:\Desktop\张圃瑜\家教中介\tutor-web'
node 'C:\Users\樊佳鑫\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs' dev
```

### 重新导入数据库（想恢复演示数据时）

```powershell
$mysql = 'E:\dsh-dev\mysql\mysql-8.0.28-winx64\bin\mysql.exe'
# 建库 + 导表结构
& $mysql -u root -p1234 -h 127.0.0.1 --port=3307 -e "CREATE DATABASE IF NOT EXISTS tutor DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
cmd /c "`"$mysql`" -u root -p1234 -h 127.0.0.1 --port=3307 --default-character-set=utf8mb4 tutor < sql\tutor.sql"
# 应用补丁
cmd /c "`"$mysql`" -u root -p1234 -h 127.0.0.1 --port=3307 --default-character-set=utf8mb4 tutor < sql\patch-01-subject-names.sql"
# 导入演示数据（可重复执行，会先清掉上一次的 demo 数据）
cmd /c "`"$mysql`" -u root -p1234 -h 127.0.0.1 --port=3307 --default-character-set=utf8mb4 tutor < sql\demo-seed.sql"
```

MySQL 账号：`root` / `1234`（本地开发用；`application-druid.yml` 里就是这个密码）。
**要对外部署必须换掉**，见第七节。

---

## 四、这个系统能做什么

### 电脑端管理后台（`/admin`）

| 页面 | 路径 | 能做什么 |
|---|---|---|
| 数据概览 | `/admin/dashboard` | 家教/家长/学员/待审核 4 个动态数字、科目分布柱状图、审核状态环形图、待审核队列（可直接通过/拒绝） |
| **家教信息** | `/admin/tutor` | **核心页**：5 项筛选 + 审核状态分类、分页表格、详情抽屉、**审核通过/拒绝（可填审核备注）**、删除 |
| 家长信息 | `/admin/parent` | 列表 + 详情（含身份证脱敏、押金状态） |
| 学员信息 | `/admin/student` | 列表 + 详情 |
| 微信用户 | `/admin/wxuser` | 列表 + 详情（openid、身份绑定关系） |
| 系统用户 / 角色管理 | `/admin/user` `/admin/role` | 列表 + 详情 |
| 在线用户 | `/admin/online` | 列表 + 强制下线 |
| 登录日志 / 操作日志 | `/admin/logininfor` `/admin/operlog` | 列表 + 详情（请求参数、返回结果、异常信息） |
| 服务监控 | `/admin/server` | CPU / 内存 / JVM / 磁盘，15 秒自动刷新 |
| 个人中心 | `/admin/profile` | 改资料、改密码 |

### H5 移动端（`/h5`）——**免登录**

| 页面 | 路径 | 能做什么 |
|---|---|---|
| 首页 | `/h5` | 搜索、10 个科目宫格、年级快捷入口、推荐家教 |
| 家教列表 | `/h5/tutor` | 按年级/科目筛选，按 综合 / 距离 / 评分 排序（距离需授权定位，拒绝则用默认坐标） |
| 家教详情 | `/h5/tutor/{id}` | 姓名/性别/年龄/院校/专业/可授科目/可授年级/期望薪资/简介/教学经历/评分 + 一键拨号 |
| 我的 | `/h5/my` | 后台入口、主题切换 |

> **注意**：`/h5/tutor` 是**单数**。写 `/h5/tutors` 会落到 404 页面。

### 一个真实的业务闭环（可以照着试）

演示数据里留了 **4 条待审核**家教，可以直接演练：

1. 打开 http://127.0.0.1:5173/admin/login，用 `admin` + 部署口令登录
2. 进「家教信息」→ 点顶部「待审核」分类 → 看到 4 条（冯听雨、唐靖、何书桐、孙一诺）
3. 点某行的「通过」→ 状态立刻变「审核通过」
4. 打开 http://127.0.0.1:5173/h5/tutor → 刚通过的家教**立刻出现在列表里**（因为 H5 只显示审核通过的）
5. 想看拒绝的效果：点「拒绝」并填写备注，该家教不会出现在 H5 列表

---

## 五、修掉的 3 个 Bug（都不是我引入的，是原项目/原前端就有的）

### Bug 1（最严重）：登录页白屏，用户根本登不进去

- **文件**：`tutor-web/src/components/ui/button.tsx`
- **现象**：打开 `/admin/login` 是一片空白，页面上什么都没有。控制台报：
  `Error: Slot failed to slot onto its children. Expected a single React element child or 'Slottable'.`
- **原因**：`Button` 组件内部是这么写的：

  ```tsx
  <Comp>
    {loading ? <span .../> : null}   {/* 第 1 个子节点 */}
    {children}                        {/* 第 2 个子节点 */}
  </Comp>
  ```

  当 `asChild` 为真时 `Comp` 是 Radix 的 `Slot`，而 **Slot 要求恰好一个子节点**。
  即使 `loading` 是 false，React 也算 `null` 是一个子节点，所以永远有 2 个 → 抛异常 → 整个 React 树崩掉 → 白屏。
- **影响范围**：**所有用到 `<Button asChild>` 的页面**，包括登录页、404 页、概览页、H5「我的」、H5 家教详情。
- **修复**：`asChild` 时原样透传 `children`，loading 指示器只在原生 `<button>` 上加。
- **验证**：修复后用真实浏览器跑通了「填账号密码 → 点登录 → 跳转到概览」全过程。

### Bug 2：同一家教有多条资质时，列表出现重复行、分页总数偏大

- **文件**：`tutor-system/src/main/resources/mapper/system/TTutorInfoMapper.xml`（两处）
- **现象**：家教列表接口 `total` 显示 14，但实际只有 13 条数据。
- **原因**：`left join t_tutor_qualification q on t.tutor_id = q.tutor_id` 是**一对多**。
  原库里 tutor 18 有 2 条资质记录，join 后就变成 2 行。
- **修复**：先按 `tutor_id` 取最大的 `qualification_id`，保证每个家教最多匹配 1 条资质。
- **验证**：`total` 由 14 修正为 13，翻页 5+5+3 共 13 条且无重复。

### Bug 3：按科目名称筛选家教，永远查不到数据

- **文件**：`sql/patch-01-subject-names.sql` + 上述 mapper
- **现象**：H5 里点「数学」筛选，结果永远为空。
- **原因**：mapper 的 `resultMap` 把 `subjectNames` 映射到列 `subject_names`，
  但**表里根本没有这一列**（只有 `subject_ids`），而且 select 语句也没查它 ——
  于是 `getSubjectNames()` 恒为 `null`，而筛选逻辑是 `subjectNames.contains(科目名)`。
- **修复**：新增冗余列 `subject_names` 并按 `subject_ids` 回填；mapper 的 select 补上该列。
- **验证**：接口已能返回 `['数学,物理,奥数', '英语', ...]`。

### 另外顺手修的：开发服务器会自己崩

- **文件**：`tutor-web/vite.config.ts`
- **现象**：`pnpm dev` 运行中突然以退出码 1 死掉，报
  `EBUSY: resource busy or locked, watch '...\.button.tsx.20676.xxx.tmpdir\button.tsx.tmp'`
- **原因**：本机写文件是「先写临时目录、再改名」，Vite 的文件监听会去监听那些临时目录，目录一被改名 Node 就抛错退出。实测触发过两次。
- **修复**：在 `server.watch.ignored` 里排除 `**/.*.tmpdir/**`、`**/*.tmp` 等临时产物。

---

## 六、验证证据（可复现）

三个脚本都可以随时重跑，前提是 MySQL / Redis / 后端（验证浏览器还需要前端）已启动：

```powershell
$py = 'C:\Users\樊佳鑫\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
& $py tools\verify-api.py          # 后端接口      → 28 项全通过
& $py tools\verify-web-e2e.py      # 前后端联调    → 16 项全通过
& $py tools\verify-browser.py      # 真实浏览器    → 16 项全通过，并重新生成 docs\screenshots\
```

**实际结果（本次交付时）：**

| 脚本 | 结果 | 覆盖内容 |
|---|---|---|
| `verify-api.py` | **28 / 28 通过** | 登录、权限、分页正确性、中文 UTF-8、审核通过/拒绝、公开接口、未登录被拒（401） |
| `verify-web-e2e.py` | **16 / 16 通过** | 6 个前端路由可访问、代理转发、经代理登录、中文不乱码、生产构建产物 |
| `verify-browser.py` | **16 / 16 通过** | 真实 Chrome 内核渲染、**真实交互登录**、8 个页面截图非空、**控制台零 JS 异常** |

**合计 60 项，全部通过。**

> `verify-browser.py` 值得特别说明：它不用 `chrome --screenshot`（那个方式不
> 等 SPA 渲染，同一批页面里会截出纯白图，容易得出错误结论），而是走
> Chrome DevTools Protocol，显式等待元素出现、能读控制台异常、能模拟真实点击。
> 上面 Bug 1 就是靠它抓出来的 —— 光看构建成功和 `--screenshot` 是发现不了的。
>
> **它自己也踩过一个坑，已修**：`Page.navigate` 返回时导航可能尚未提交，
> 此时 `Runtime.evaluate` 仍作用在**旧文档**上。旧文档若是已渲染过的页面，
> 紧跟的"#root 有子节点"检查会立刻为真，于是截图截到未渲染的空白页，
> 误报 12 项失败。现在导航前会在旧文档埋一个哨兵（`window.__navSentinel`），
> 导航后等它消失，确认新文档已接管；并额外断言 `location.pathname` 与目标一致。
> 另外测试用的 marker 也改成了**页面正文独有**的词（侧边栏常驻的"家教信息"
> 之类不能用），并修正了服务监控的真实路由是 `/admin/server`。
>
> 教训：验证脚本自己也会有 Bug。
> 出现"页面全白"时，先抓一次真实 DOM（本仓库 `verify-browser.py` 里就带这个能力）
> 再下结论 —— 这次正是抓 DOM 才发现页面其实渲染完好。

页面截图在 `docs\screenshots\`，共 8 张：登录页、概览、家教信息（审核）、家长、服务监控、H5 首页、H5 列表、H5 详情。

---

## 七、已知问题与注意事项

### 上线前必须处理

| 项目 | 现状 | 说明 |
|---|---|---|
| MySQL 密码 | `root` / `1234` | 改 `tutor-admin/src/main/resources/application-druid.yml` |
| JWT 密钥 | `abcdefghijklmnopqrstuvwxyz` | 改 `application.yml` 的 `token.secret`，否则任何人可伪造登录态 |
| Druid 监控台口令 | `123456` | 同上文件 |
| Swagger | `enabled: true` | 生产环境应关闭，否则接口文档全公开 |
| 微信支付证书 | `tutor-admin/src/main/resources/cert/apiclient_cert.p12` | **这是一个结构合法的真实 PKCS#12 商户证书，随原作者的公开仓库一起发布了**。如果它对应的是生产商户号，等于密钥泄露，必须确认并更换 |
| 微信支付版本 | APIv2 | 微信已在淘汰 v2，正式用要改 v3 |
| `ruoyi.profile` | `D:/ruoyi/uploadPath` | 上传目录，按需改成本机路径 |

### 小程序（tutor-uniapp）

- **AppID 已替换为占位符** `wx0000000000000000`（原值 `wx213c43cee7e4bef4` 是原作者的）
- **DCloud AppID 已清空**（原值 `__UNI__1861A0B`），用 HBuilderX 打开项目时会自动申请新的
- 要发布自己的小程序：去 https://mp.weixin.qq.com 注册，把 `manifest.json` 里那个占位符换成你的 AppID
- 小程序端**只有 2 个页面**（首页、我的），原始项目就是如此 —— 本次没有补做小程序页面

### 前端

- **统计数字来自各列表接口的 `total`**，图表基于 100 条样本计算（界面上标注了「样本统计」）。后端没有专门的聚合统计接口。
- **系统用户 / 角色只有列表和详情**，没有新增/编辑表单（后端虽然有接口，但原任务范围只要求列表）。
- **后端响应结构不统一**：`/login`、`/getInfo`、`/captchaImage` 的字段**平铺在根节点**，而 `/monitor/server` 包在 `data` 里。前端曾经用 `src/lib/httpCompat.ts` 兼容这两种形状；迁移到 Go 后响应统一为 `{code,msg,data}`，该兼容层及相关兜底已删除。
- 接口返回的 `Content-Type` 是 `application/json`，**没有带 `charset=UTF-8`**。浏览器和 axios 按 JSON 规范默认用 UTF-8，显示正常；但某些客户端（比如 PowerShell 的 `Invoke-RestMethod`）会解码错，命令行调试时注意。

### 环境相关

- **C 盘只剩约 3 GB**，所有新增依赖都装在 E 盘。
- JDK/Maven/MySQL/Redis 都在 `E:\dsh-dev`，**不在项目目录里**。换机器要重新准备。
- 打包/运行 Java 时，**不要用 `-Dxxx.yyy=zzz` 形式的命令行参数**（本机实测会在第一个点处被拆开，导致
  `Could not find or load main class .encoding=UTF-8`）。改用环境变量 `JAVA_TOOL_OPTIONS`。

---

## 八、建议的下一步

1. **先跑一遍第五节那个业务闭环**，确认你能看到「审核 → H5 列表变化」的联动。
2. **改掉第七节的 4 个密钥/口令**，这是最低成本的安全加固。
3. 想要**生产部署**：把 `tutor-web/dist` 交给 Nginx，并把 `/prod-api` 反向代理到后端 8080
   （`.env.production` 里已经按这个约定配好了）。
4. 想补功能：后端无聚合统计接口 → 可加一个 `/system/tutorInfo/stats`；系统用户/角色可补 CRUD 表单。
5. **记得处理授权问题**：这个项目本身的许可证情况见对话里的分析 —— `LICENSE` 文件是若依的 MIT，
   但 README 页脚写着「© 小孟技术团队 All Rights Reserved」，两者是矛盾的。
   若依那部分可以放心商用（MIT），小孟自己写的那部分建议向他本人要一句书面确认。
