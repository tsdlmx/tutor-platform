# 站点架构审计报告

> 审计范围：`tutor-platform/tutor/tutor-web/src`（94 个源文件 / 13,989 行 / 35 条路由声明）
> 方法：全量读路由表与页面组件、barrel 反向引用扫描、未使用导出扫描、import 图环检测、`dist` 产物体积实测、`tsc -b` 类型检查
> `tsc -b --force` 结果：**0 error**（类型完整性达标，仅 4 处 `any`/`as never` 逃逸）

---

## 1. 功能重叠（按严重程度排序）

### [严重] 1.1 需求列表「双胞胎」：TeacherHome / StudentHome ~71% 重复

| 文件 | 行数 | 路由 | 数据源 |
|---|---|---|---|
| `pages/customer/TeacherHome.tsx` | 521 | `/demands` | `customerApi.listDemands()` |
| `pages/customer/StudentHome.tsx` | 572 | `/demands/mine` | **同一个** `customerApi.listDemands()` |

- 归一化后比对：TeacherHome 346 条唯一行中有 **245 条与 StudentHome 逐字相同（70.8%）**，`diff` 差异行仅 371 行。
- 完全重复的样板：`CELL='px-4 py-3'` / `HEAD='h-10 px-4'` / `PAGE_SIZES` 常量、`FilterForm`+`EMPTY_FILTER`、科目字典 `useEffect`、`loadList`/`load` 三态机（`rows/total/loading/error`）、`submitFilter`/`resetFilter`、`columns` 定义骨架、`DataTable` 调用、移动端 3 卡骨架屏、`DetailDrawer` 的「需求信息 / 需求描述」两个 section（逐字相同）。
- 真正的差异只有 3 处：页头文案、列集合（老师版多城市/上课方式，学生版多状态）、学生独有 `编辑/取消/删除` 操作。
- **两种角色走同一接口、同一份 UI，却是两份 500+ 行文件**——任何需求字段改动都要改两遍。

**建议**：抽 `DemandListPage({ scope: 'pool' | 'mine' })` 单一实现（预计 521+572 → ~600 行，-45%），两个路由只做薄包装；保留 `TeacherHome`/`StudentHome` 作为导出别名以免路由层大改。

---

### [严重] 1.2 平台存在两套互不连通的「老师」实体（最伤业务的架构问题）

| | 面向前台的家教 | 面向前台的老师 |
|---|---|---|
| 入口 | `/tutors`、`/tutors/:id`（`pages/tutors/*`） | `/me` 简历页（`pages/customer/Profile.tsx`） |
| API | `api/miniapp.ts` → `GET /miniapp/tutor/list` | `api/customer.ts` → `GET/PUT /customer/profile` |
| 数据模型 | `TutorInfo`（`t_tutor_info`：资质、身份证、审核态、评分、时薪） | `TeacherProfile`（`t_customer_account` 关联简历） |
| 后台入口 | `/admin/tutor` → `pages/admin/TutorList.tsx`（可审核通过/拒绝） | `/admin/teacher` → `pages/admin/CustomerAccountList.tsx`（只读 + 启停用） |

- 客户用邮箱注册 → 选「老师」→ 在 `/me` 填的简历，**永远不会出现在 `/tutors` 列表里**（后者只读 `t_tutor_info`）。
- 反之，`t_tutor_info` 里的家教**没有客户账号、不能登录**，也进不了 `/demands` 需求池。
- 后果：学生端「找家教」看到的是历史/小程序家教库；老师端「需求池」只有邮箱注册账号能进；后台要维护两套审核/管理语义。`AdminLayout.tsx:58-105` 的导航注释本身就在解释"三个容易混淆的入口"，是这个问题已经暴露的证据。
- 后台 `Dashboard.tsx` 的 4 个 StatCard 把两套口径并排展示（`家教总数` / `入驻老师`），进一步固化了分裂。

**建议**：定一个事实源。推荐「`t_customer_account`(role=TEACHER) + 简历 = 唯一老师实体」，`t_tutor_info` 降级为历史档案（后台归档只读），`/tutors` 改读 `/customer/teachers`；或反向把 `/me` 简历写入 `t_tutor_info` 并复用现有审核流。**这是唯一需要产品决策的项，越早定越省钱。**

---

### [严重] 1.3 共享组件 `DemandCard` 是僵尸代码，两个页面各自造轮子

- `pages/customer/shared.tsx:48-128` 定义了 `DemandCard`（含"老师/学生共用"的注释、`footer`/`showStudent` 插槽、入场动画），**全仓库 0 处引用**。
- 与此同时 `TeacherHome.tsx:51-99`、`StudentHome.tsx:67-131` 各写了一个 `DemandRow`。
- 即：设计意图是对的（一份卡片），执行时绕过了。

**建议**：删除两个本地 `DemandRow`，改用 `DemandCard`（它的 `footer` 插槽正好装学生端操作）；若确认要弃用则删 `shared.tsx:48-128`，别留第三种。

---

### [中等] 1.4 「选身份」逻辑散落三处，且注册入口的区分是假象

- `Landing.tsx:89-110` 两张身份卡（`RoleEntry`）→「注册老师账号」「注册学生账号」
- 但两个按钮的 `Link` 都是 `/register`（`Landing.tsx:96`、`:106`），**不带任何 role 参数**；`Register.tsx` 里也没有角色字段，注册完统一跳 `/choose-role`（`Register.tsx:155`）。
- `ChooseRole.tsx:19-38` 又实现了同一张"我是老师/我是学生"卡片（`OPTIONS`，含 4 条卖点）。
- 一个用户从"选身份"到真正有身份，要经过：Landing 卡 → 注册 → ChooseRole 卡，**三次同类选择、两套卡片实现、一次无效选择**。

**建议**：Landing 两张卡带上 `?role=TEACHER|STUDENT`，`Register` 接收并透传给 `setRole`，注册完成直达角色首页，`/choose-role` 只保留"切换身份"职责。

---

### [中等] 1.5 `Profile.tsx`（911 行 / 全站最大文件）一个页面干六件事

`pages/customer/Profile.tsx` 同时承担：①账号卡片 ②主题偏好设置 ③「资料 / 公开主页」视图切换（**手搓 tablist**，见 `:504-529`）④简历只读/编辑/字段校验/提交（`:598-788`，190 行表单）⑤发帖 ⑥我的帖子列表+分页+删除。内含 15 个 `useState`、2 个独立 loading/error 状态机。

**建议**：拆为 `ProfileAccountCard` / `PreferencesCard` / `ResumeSection`（含 Editor）/ `MyPostsSection`，`Profile.tsx` 只做装配（预计 <200 行）。

---

### [中等] 1.6 后台列表页存在「通用实现不用」现象

`SimpleListPage.tsx`（183 行，配置驱动）已被 5 个页面采用（`RoleList` / `OnlineUsers` / `LoginLogList` / `OperLogList` / `SystemUserList`），但 `TutorList.tsx`(580)、`WxUserList.tsx`(230)、`CustomerAccountList.tsx`(265) 仍手写同一套 `usePagedList + FilterBar + DataTable + DetailDrawer + PageHeader`（共 1075 行），其中 `CustomerAccountList` 还因为泛型不匹配写了 `as never`（`:41`）。

**建议**：`SimpleListPage` 增加 `extraFilterRender` / `toolbar` 插槽，把后三个迁进去；`TutorList` 保留自定义（审核动作复杂），但把它独有的 Tabs/审核流下沉为 `config.tabs`。

---

### [中等] 1.7 科目多选 chip UI 逐字重复约 30 行

`StudentDemandForm.tsx:345-375` 与 `Profile.tsx:692-721`（连"清空选择"按钮、`aria-pressed`、`min-h-[36px] rounded-full` 都一模一样）。

**建议**：抽 `components/common/SubjectPicker.tsx`（value/onChange/options），两处替换。

---

### [轻微] 1.8 其他

- `admin/Profile.tsx`(269) 与 `customer/Profile.tsx`(911) 同名不同域（`/admin/profile` vs `/me`），不利于检索与新人理解。
- 404 两份（`customer/NotFound.tsx` 46 行 / `admin/NotFound.tsx` 22 行）——**分离是合理的**（文案与出口不同），可接受。
- 登录两份（邮箱 vs 用户名+验证码）——分离合理，但 `admin/Login.tsx:26-29` 用 `document.documentElement.classList` 自己判暗色，绕过了 `themeStore`/`ThemeToggle`。

---

## 2. 信息架构问题

### 2.1 路由命名混乱（35 条 `path` 声明：客户 12 / 后台 15 / 历史重定向 8 / 通配 2）

| 问题 | 现状 | 冲突点 |
|---|---|---|
| 单复数混用 | `/tutors`（客户） vs `/admin/tutor`（后台） | 同一资源两种写法 |
| **同一单词两种语义** | `/teacher` → 重定向到 `/demands`（老师的需求池）<br>`/admin/teacher` → 入驻老师账号列表 | "teacher" 一处指角色、一处指账号表 |
| 层级不对称 | `/demands`（老师池） vs `/demands/mine`（我的） | 池=默认、我的=子级，语义上「我的」才是主语 |
| 文件与路由错位 | `TeacherHome.tsx` ↔ `/demands`<br>`StudentHome.tsx` ↔ `/demands/mine`<br>`StudentDemandForm.tsx` ↔ `/demands/new` | 文件名带 Actor，路由名带 Resource |
| 风格不统一 | `/me` vs `/u/:accountId` vs `/choose-role` | 代词 + 缩写 + 动词短语三种风格 |
| 历史包袱驻留主表 | `/h5`、`/h5/tutor`、`/h5/my`、`/teacher`、`/student`、`/student/new`、`/student/:id/edit`（8 条） | 与现役路由混在同一个 `<Routes>` 里 |

### 2.2 失效的引导链接（可复现的体验 bug）

`/h5` 的重定向目标是 `/`（`router/index.tsx:206`），但两处 UI 把它当成「逛家教」：

- `pages/customer/Login.tsx:153`：`<Link to="/h5">先逛逛公开家教 →</Link>` → 实际落到落地页
- `pages/customer/NotFound.tsx:38`：按钮文案「浏览家教」，`to="/h5"` → 同样落到落地页

**修复**：两处改为 `/tutors`；`/h5` 系列重定向建议整体迁出 `AppRoutes`，改由部署层（Nginx 301）或独立的 `LegacyRedirects` 组件承载。

### 2.3 角色分离：游客 / 学生 / 老师的入口互相渗透

- 游客可看 `/tutors`、可到 `/register`、`/login` —— 清晰。
- 但 `/u/:accountId`（文案是"**公开**主页"）挂在 `RequireCustomer allowNullRole` 下（`router/index.tsx:182-186`）：**未登录访客点开别人的主页会被弹到登录页**。"公开"名不副实。
- 老师被 `RequireNotTeacher` 挡在 `/tutors` 外（`:176-179`）+ 顶栏/底栏都隐藏该入口 —— 规则实现了 3 遍（路由、`CustomerLayout.tsx:68`、`CustomerBottomNav.tsx:37-45`），改一处容易漏。
- 注册阶段不区分角色（见 1.4），实际是「先注册、后选身份」，但落地页 UI 宣称「注册老师账号 / 注册学生账号」。

### 2.4 导航层级与入口对称性

| 入口 | 桌面顶栏（`CustomerLayout.tsx:61-69`） | 移动底栏（`CustomerBottomNav.tsx:37-45`） |
|---|---|---|
| 首页（角色主页） | ✅ | ✅ |
| 我的 | ✅ | ✅ |
| 找家教 | ✅（老师隐藏） | ✅（老师隐藏） |
| **发布需求** | ❌ **不存在** | ✅（学生） |
| 选身份 | 仅 role=null | ✅（未选身份） |
| 切换身份 / 退出 | 头像下拉 | 抽屉 + 下拉（两处） |

→ 桌面端学生**没有"发布需求"入口**（只能 `/demands/mine` 里的按钮），移动端有；同一产品两套信息架构。

后台侧栏（`AdminLayout.tsx:66-105`）：
- 6 个分组 12 项，**「家教业务」组只有 1 项**（分组失去意义）；
- `admin/share`「移动端预览」→ `to="/tutors"`（`:276-281` 与 `:384-389` 各一次，**重复两处**），实际是客户端公开页，不是预览，且会丢掉后台登录态；
- 顶栏待审核角标与侧栏角标**同时**显示同一个数字（`:207-208` / `:345-354`）。

### 2.5 后台能力缺口：需求单（`t_demand`）完全没有管理面

后台覆盖了家教档案、客户账号、系统用户、日志监控，**唯独没有需求单列表/审核/下线入口**——而需求单是客户侧最核心的数据（学生发布、老师浏览）。

### 2.6 建议的目标路由表

```
/                       落地页（已登录 → 角色首页）
/tutors                 找家教（公开）
/tutors/:id             家教详情（公开）
/demands                需求池（老师）        ← 共享 DemandListPage
/demands/mine           我的需求（学生）      ← 共享 DemandListPage
/demands/new            发布需求（学生）
/demands/:id/edit       编辑需求（学生）
/me                     我的主页
/u/:accountId           公开主页（游客可读）
/choose-role            仅"切换身份"（注册不再经过）
/admin/...
/admin/demands          ← 新增：需求管理
* → 301 由部署层处理旧地址（/h5/**、/teacher、/student/**）
```

---

## 3. 性能瓶颈

### 3.1 打包体积（`dist/assets` 实测，非估算）

| 产物 | 体积 | 加载时机 | 评价 |
|---|---|---|---|
| `Dashboard-*.js` | **411 KB** | 仅 `/admin/dashboard` | recharts，已按路由 lazy ✅ |
| `index-*.js`（入口） | 258 KB | 首屏 | 含客户外壳+Landing+axios+lucide 图标 |
| `react-*.js` | 165 KB | 首屏 | 手动分包 ✅ |
| `index-*.css` | 39 KB | 首屏 | 单文件，未拆分 |
| 其余页面 chunk | 3–20 KB | 按需 | 24/26 页面 lazy ✅ |
| **dist 总计** | 1.2 MB | | |

分包策略总体正确：`vite.config.ts` 明确说明了「recharts 故意不手动分包」，实测 `Dashboard` 411 KB 独立成块、入口未受影响，**这个决定是对的，反而是全仓最健康的一块**。

### 3.2 framer-motion：幽灵依赖 + lockfile 失配

- `pnpm-lock.yaml:35` 声明 `framer-motion: ^11.15.0`，`node_modules/framer-motion` 已安装（11.15.0）。
- **`package.json` 里没有它**，源码 0 处 import（仅 3 处注释提到"不装动画库"）。
- 后果：①约 120 KB 死依赖留在依赖树；②lockfile 与 manifest 不一致，CI 用 `pnpm install --frozen-lockfile` 会直接失败（`ERR_PNPM_OUTDATED_LOCKFILE`）。
- 同理，`vite.config.ts` 的分包注释仍在描述"motion —— 客户区首页/登录页与 H5 都要用"，而 H5 外壳与 motion 都已被移除 → **注释漂移**。

**建议**：`pnpm remove framer-motion`（重建 lockfile），删除 vite 配置里的 motion 注释。

### 3.3 构建期隐式耦合（barrel + 动态回指）

`components/rare/index.ts` 同时导出 `delete-button` 与 `gooey-tabbar`，而 `gooey-tabbar.tsx:4` 静态 import `router/prefetch.ts`，`prefetch.ts` 又通过 `import()` 回指 `pages/customer/Profile.tsx` / `StudentHome.tsx`：

```
pages/customer/Profile.tsx → components/rare/index → gooey-tabbar → router/prefetch ⇢ (dynamic) Profile.tsx
```

- 任何 `import { DeleteButton } from '@/components/rare'`（`StudentHome`、`Profile`、`admin/TutorList`）都会把 **整个 rare barrel + 移动端 tabbar + prefetch 模块**纳入静态子图。当前 Rollup 树摇能消掉大部分，但一旦任一 `rare/*` 引入副作用，整个 barrel 会被保留，且这层耦合让分包边界不可预测。
- 自动环检测共 3 条（1 条为类型解析误报，2 条即上述动态回指）。

**建议**：`rare/index.ts` 拆为按需路径导入（或去掉 barrel），`prefetch.ts` 只暴露纯函数/常量，避免 `import()` 与静态图互相咬合。

### 3.4 缺失的分页 / 无效请求

- `/tutors` **无分页**：`MiniappTutorListQuery`（`types/api.ts:386-393`）根本没有 `pageNum/pageSize`，接口一次返回全量，前端在 `TutorList.tsx:120-130` 用 `useMemo` 本地过滤关键词 → 家教数上千时首屏与内存都吃紧。
- `CustomerLayout.tsx:57-64` 每次路由变化 `scrollTo` 两次（`document.querySelector('main')` + `window`）。

### 3.5 双渲染分支（每页两套 DOM）

`TeacherHome` / `StudentHome` 各有 `hidden md:block`（桌面表格）+ `md:hidden`（移动卡片）两套完整渲染分支，共 7 处断点分支、两套骨架屏、两套空态，**首屏 DOM 与维护面积都是单套的 2 倍**。`TutorList` 用「同一份数据 + Drawer 收筛选」的方式避免了这个问题，可作范式。

---

## 4. UI 不一致

### 4.1 布局：两套外壳（合理）+ 三处重复实现（不合理）

`CustomerLayout`(258) 与 `AdminLayout`(413) 双外壳是正确设计（不同信息密度）。但以下在两边各写了一遍：

- 账户下拉菜单（`CustomerLayout.tsx:115-153` / `AdminLayout.tsx:357-395`）—— 结构 90% 相同；
- 主题切换入口位置不一致：客户区在**顶栏**，后台在**侧栏底部**，客户区 `/me` 里**又一次**（`Profile.tsx:487-498` 偏好设置卡），后台顶栏也有一份 → **同一设置 2–3 个入口**；
- 移动端抽屉导航（`CustomerLayout` `Drawer` / `AdminLayout` `Drawer`）逻辑重复。

### 4.2 设计语言：令牌统一，但有 3 处绕过

统一基础良好：`globals.css` 定义完整 shadcn HSL 令牌（light/dark 双套 + `--radius` + `--ease-spring`），`tailwind.config.js` 映射齐全，`rare.css` 只做加法。

偏离点：
1. `ChooseRole.tsx:86` 硬编码 `border-sky-500/30 bg-sky-500/[0.06]` —— **全站唯一不走令牌的颜色**（其余 100% 用 `primary/success/warning/destructive`）。
2. `Dashboard.tsx:47-51` 用 `hsl(var(--warning))` 字面量喂给 recharts（recharts 无法吃 Tailwind 类）—— 可接受，但应抽 `chartColors` 常量共享。
3. `.glass` 只在 3 处出现（`CustomerLayout:90`、`PageHeader:34`、`gooey-tabbar:55`），`AdminLayout` 顶栏用的是实色 `bg-background` → **客户区磨砂、后台实色，两套观感**。

### 4.3 空态 / 错误态 / 加载态：**没有标准化**（本项最集中）

**加载态 6 种并存**：

| 实现 | 出现位置 |
|---|---|
| `FullPageSpinner` | 路由守卫 ×3、Suspense ×2、`AdminLayout` |
| `Skeleton` 手写数组 | 9 个页面、共 82 处 `Skeleton` |
| `Spinner` 组件 | `admin/Login`、`ServerMonitor`、`Dashboard` |
| `Loader2` 图标 | `ChooseRole.tsx:135`、`empty.tsx` |
| `Button loading` 内置转圈 | 全站按钮 |
| `animate-pulse` 自造骨架 | `CustomerLayout.tsx:113` |

且 `empty.tsx` 里已定义 `LoadingState` 组件，**0 处引用**。

**空态/错误态**：14 处 `<Empty>`、21 处 `<ErrorState>` 已基本统一 ✅，但仍有例外：
- `Dashboard.tsx:263-274` 用内联 `AlertTriangle` + 文本 + 按钮自造错误条，不走 `ErrorState`；
- `customer/NotFound.tsx` 手写 `px-6 py-12` 而不用 `Empty`；
- `Profile.tsx` 与 `PublicProfile.tsx` 的帖子空态文案/图标各写一遍。

### 4.4 组件复用：有组件不用

| 已存在 | 却手写 | 位置 |
|---|---|---|
| `Tabs` / `TabsList` / `TabsTrigger` | `<div role="tablist">` + `<button role="tab">` | `Profile.tsx:504-529`（全站唯一手搓 tab） |
| `Skeleton` | `animate-pulse` span | `CustomerLayout.tsx:113` |
| `LoadingState` | Loader2 / 自造 | 见 4.3 |
| `Tooltip` | 无（后台侧栏折叠时才用） | — |
| `PageHeader` 的标题层级 | `[&_h1]:text-base` 击穿覆写 ×2 | `admin/TutorList.tsx:383`、`Dashboard.tsx:254` |

`PageHeader` 缺 `size` 变体，导致两处用「外部选择器改内部元素」的 hack，说明组件契约不完整。

### 4.5 死 CSS 工具类与令牌错位

- `globals.css` 定义但 **0 引用**：`.safe-bottom`、`.safe-top`、`.no-scrollbar`、`.text-balance`。
- `.safe-bottom` 用 `var(--tabbar-h, 64px)`，而 `CustomerLayout.tsx:88` 把它设成 `72px` 并另写 `max-md:pb-[calc(env(safe-area-inset-bottom)+4.5rem)]` → 同一个安全区概念，两个真值来源。
- `hairline`(14) / `tabular`(41) 使用良好 ✅。

### 4.6 交互尺寸不统一

移动侧 `TutorList` 的 Chip 是 `min-h-[44px]`、`StudentHome` 操作按钮 `h-11`（44px，符合触控标准）✅；后台全部用 `size="sm"`（h-8=32px），且后台在移动端也复用了这套尺寸。

---

## 5. 僵尸代码清单（可安全删除）

| 类型 | 条目 | 体积 |
|---|---|---|
| 未使用的组件 | `shared.tsx` 的 `DemandCard`+`DemandCardProps`（`:48-128`） | ~80 行 |
| 未使用的组件 | `ui/switch.tsx`（`Switch` 在全仓 0 引用） | 38 行 |
| 未使用的组件 | `ui/empty.tsx` 的 `LoadingState` | 8 行 |
| 未使用的组件 | `ui/skeleton.tsx` 的 `TableSkeleton` | 少量 |
| 无消费者的 barrel | `api/index.ts`（8 行，`import from '@/api'` 0 处） | 8 行 |
| 无消费者的 barrel | `store/index.ts`（2 行） | 2 行 |
| 未使用的 API（RuoYi 模板残留） | `system.ts`: `listMenu` `listDept` `listPost` `listDictType` `listDictData` `listConfig` `listNotice` `getUser`；`monitor.ts`: `getCacheInfo` `getCacheNames`；`wxuser.ts`: `getWxUser`；`customerAccount.ts`: `getAccount`；`tutor.ts`: `updateTutor`；`miniapp.ts`: `checkLogin` | ~14 个函数 |
| 未使用的类型 | `types/api.ts`: `ParentInfo` `ParentQuery` `StudentInfo` `StudentQuery` `TableDataInfo`；`constants.ts`: `CONSTELLATIONS` `DEPOSIT_STATUS` `maskPhone` | ~60 行 |
| 未使用的依赖 | `framer-motion`（lockfile 声明、已安装、0 引用） | ~120 KB |
| 未使用导出 | `labels.ts`: `ROLE_DESC` `DEMAND_GRADES` `CLASS_MODE_LABEL` `BUDGET_UNIT_LABEL` `DEMAND_STATUS`（仅内部用，不必导出） | — |

> 注：`ui/dialog.tsx` 的 `Dialog` 组合式组件 0 引用，**但不能直接删**——`drawer.tsx:5` 从它 import `DialogOverlay/DialogPortal/DialogTitle/DialogDescription`。正确做法是把 Radix 原语下沉到 `ui/primitives.tsx`，再删掉未用的 `Dialog*` 导出。

---

## 6. 优先行动清单（Top 10）

| # | 重要度 | 工作量 | 任务 | 依据 |
|---|---|---|---|---|
| 1 | **P0** | 决策 1d | **确定老师实体的唯一事实源**（`t_customer_account` 或 `t_tutor_info`），其余降级为归档；这是 1.2、后台双入口、Dashboard 双口径的根因 | §1.2 |
| 2 | **P0** | 1d | 修 2 处失效链接 `/h5` → `/tutors`，并把 8 条 legacy 重定向移出主路由表 | §2.2 |
| 3 | **P0** | 0.5d | `pnpm remove framer-motion` + 重建 lockfile（当前 CI `--frozen-lockfile` 必失败）+ 清理 vite 注释漂移 | §3.2 |
| 4 | **P1** | 2d | 合并 `TeacherHome`/`StudentHome` → `DemandListPage({scope})`，同时启用已存在的 `DemandCard`，删两个本地 `DemandRow` | §1.1 §1.3 |
| 5 | **P1** | 1.5d | 拆 `Profile.tsx`(911) 为 4 个子块；用 `Tabs` 替换手搓 tablist；抽 `SubjectPicker` 消除 30 行重复 | §1.5 §1.7 §4.4 |
| 6 | **P1** | 1d | 注册链路带上 `?role=`，Landing 两张卡不再指向同一 URL；`/choose-role` 收敛为"切换身份" | §1.4 §2.3 |
| 7 | **P2** | 1d | 统一三态：删 `LoadingState` 或全面启用它；`Dashboard` 错误条改 `ErrorState`；`CustomerLayout` 骨架改 `Skeleton`；补 `PageHeader` 的 `size` 变体以消除 `[&_h1]` 击穿 | §4.3 §4.4 |
| 8 | **P2** | 1d | 导航对齐：桌面顶栏补「发布需求」；后台「移动端预览」改名为「客户端首页」并只留一处；后台侧栏合并只有 1 项的分组 | §2.4 |
| 9 | **P2** | 1.5d | 后台 3 个手写列表页迁入 `SimpleListPage`（新增 slot），删 1075 行样板 | §1.6 |
| 10 | **P3** | 2d | 补后台「需求管理」（`/admin/demands`）；`/tutors` 加分页；`rare` barrel 拆路径导入消除隐式耦合 | §2.5 §3.3 §3.4 |

**建议执行顺序**：1 → 3 → 2 → 4 → 6（第 1 项未定前，4/6 可能白做）。

---

## 附录：审计数据速查

```
源文件                     94（.ts/.tsx/.css）  /  13,989 行
路由 path 声明             35（客户 12 / 后台 15 / 历史 8 / 通配 2）
React.lazy 页面            24（26 个页面中仅 Landing + CustomerLayout 静态）
类型检查                   tsc -b --force → 0 error
类型逃逸                   any/as-never/@ts-ignore 共 4 处
import 环                  3（2 条经 dynamic import 回指，1 条类型解析误报）
未使用导出                 90 个标识符（含 60+ props 类型，正常）
dist 体积                 1.2 MB；最大 chunk Dashboard 411 KB；入口 258 KB
已装但未声明依赖           framer-motion 11.15.0（lockfile 与 package.json 失配）
未使用 UI 组件             Switch / Dialog 组合 / LoadingState / TableSkeleton / DemandCard
未使用 API 函数            14 个
单文件最大                 911 行（customer/Profile.tsx）
重复度最高对               TeacherHome ↔ StudentHome：70.8%
```
