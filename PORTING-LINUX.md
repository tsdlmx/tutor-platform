# 家教中介平台 —— Linux 移植说明（本机：Ubuntu 24.04）

> 这份文档写给「拿到这个包、要在 Linux 上跑起来」的人。
> 原包是**面向 Windows 的便携包**（`.bat` 脚本 + `.exe` 运行时），在 Linux 上
> 几乎每个部件都用不了；下面是把它落到本机的完整记录。

---

## 一、结果速览

| 项目 | 状态 |
|---|---|
| MySQL 8.0.46（端口 3307） | ✅ 运行中，`tutor` 库 35 张表 + 演示数据已导入 |
| Redis 7.0.15（端口 6379） | ✅ 运行中（`redis-cli ping` → PONG） |
| 后端 Spring Boot 2.5.15 / JDK 1.8.0_504（端口 **12501**，已映射公网） | ✅ 运行中 |
| 前端 Vite 5.4.11 / Node 24.19.0（端口 **12500**，已映射公网；默认以 `vite preview` 伺服生产构建） | ✅ 运行中 |
| 后端接口验证 `tools/verify-api.py` | ✅ **37 / 37 通过**（含后台客户账号接口，自带数据） |
| 前后端联调验证 `tools/verify-web-e2e.py` | ✅ **17 / 17 通过**（自带数据） |
| 真实浏览器验证 `tools/verify-browser.py` | ✅ **19 / 19 通过**（真实登录交互、含老师/学生页、**帖子审核页**、找家教页、0 条控制台异常，自带数据） |
| 客户侧接口验证 `tools/verify-customer-api.py` | ✅ **108 / 108 通过**（验证码、注册、身份、需求、个人主页、**申请联系 / 老师和学生双视角**、**帖子审核与广场**、**找回密码**、**IP 限流**、越权隔离，自带数据） |
| 客户侧浏览器验证 `tools/verify-customer-browser.py` | ✅ **86 / 86 通过**（三步注册 → 选身份 → 发需求 → 注册老师 → 需求池 → **申请联系 → 学生「老师申请」** → 个人主页填简历/发帖（**待审核**） → 独立公开页 → 「我的」→ 找回密码 → 404，自带数据） |
| 移动端底栏 + 页脚 + 首屏验证 `tools/verify-mobile-nav.py` | ✅ **69 / 69 通过**（390×844 手机视口下逐个身份核对底栏入口（含**广场**）、老师端无「找家教」且访问 `/tutors` 被送回、激活态唯一、旧地址重定向、不遮挡内容、页脚统计，自带数据） |
| **合计** | ✅ **336 / 336 通过**（管理后台 73 项 + 客户侧 263 项） |

#### 怎么复跑这些验证

```bash
cd /home/ubuntu/PlatformE/tutor-platform
export TUTOR_CHROME=$PWD/runtime-linux/opt/chrome/chrome
export PYTHONPATH=/home/ubuntu/PlatformE/_runtimes/pylibs          # websocket-client
export LD_LIBRARY_PATH=$PWD/runtime-linux/opt/usr/lib/x86_64-linux-gnu

python3 tutor/tools/verify-api.py                 # 管理后台接口      37 项
python3 tutor/tools/verify-web-e2e.py             # 前后端联调        17 项
python3 tutor/tools/verify-browser.py             # 管理后台浏览器    18 项
python3 tutor/tools/verify-customer-api.py        # 客户侧接口        81 项
python3 tutor/tools/verify-customer-browser.py    # 客户侧浏览器      77 项
python3 tutor/tools/verify-mobile-nav.py          # 底栏/页脚/首屏    56 项
```

> ⚠️ 前端现在默认以**生产构建**（`vite preview`）伺服，`/dev-api` 换成了 `/prod-api`。
> 所以 `verify-web-e2e.py` 要带上前缀一起跑：
> `TUTOR_API_PREFIX=/prod-api python3 tutor/tools/verify-web-e2e.py`。
> 如果前端是以 `WEB_MODE=dev` 起的，就按默认（`/dev-api`）跑，不要加这个变量。

> 两个 "customer" 脚本每跑一次会**新建测试账号**（邮箱带时间戳）。
> 想清干净：删掉 `%@example.com`、`browser%@demo.com` 的账号及其需求即可。

#### 示例数据：已全部清空（客户端 + 管理端）

按需求把所有**非真人**的示例数据都清掉了：

| 表 | 原有 | 现在 |
|---|---|---|
| `t_tutor_info` 家教 | 14（含原库遗留的两条名为 `123` 的垃圾数据） | **0** |
| `t_tutor_qualification` 资质 | 33 | **0** |
| `t_parent_info` 家长 | 7 | **0** |
| `t_student_info` 学员 | 9 | **0** |
| `t_wx_user` 微信用户 | 18 | **0** |
| `t_student_demand` 客户需求 | 6 | **0** |
| `sys_job` 定时任务 | 4（含若依自带的 3 个示例任务） | **1**（只留业务任务"家教信息24小时自动审核"） |

**保留的东西（都不是示例数据）**：

* `sys_menu / sys_dict_data / sys_config / sys_role / sys_user / sys_dept` —— 系统菜单、
  字典、参数和管理员账号，删了后台就废了；
* `t_customer_account` 里的 `2763882251@qq.com`（昵称"花生"）—— 这是从公网**真实注册**的用户；
* `sys_job` 里那条业务定时任务，以及它产生的运行日志。

**想恢复演示数据**：

* 客户侧：`python3 tutor/tools/seed-customer-demo.py`（5 个账号 + 6 条需求，可重复执行）
* 管理端：`mysql ... tutor < sql/demo-seed.sql`（12 位家教 + 家长 + 学员 + 微信用户）

**测试全部改成自带数据、跑完自清**：5 个脚本都会自己造所需数据（家教、账号、需求），
收尾时删掉。因为是"逻辑删除"（`del_flag=2`）和没有删除接口的客户账号，
脚本会直接用 mysql 客户端把行清掉（找不到客户端就跳过清理，不影响断言）。
所以反复跑验证，库里不会越堆越多 —— 实测跑完 `t_tutor_info`、`t_customer_account`
都回到 0 / 1（只剩那个真实用户）。

> 顺带两个发现，改测试时才注意到：
> 1. 若依的 `PageDomain.reasonable` 默认是 **true**，页码超出范围会"贴到最后一页"，
>    所以不能用"翻超范围页应该为空"来断言分页；
> 2. 家教的删除是**逻辑删除**，API 删完行还在表里，验证脚本因此改成 API + 直连清库两步走。

### 两个界面调整

**1）注册页改成翻页式（三步）**

原来是「邮箱 / 验证码 / 密码 / 确认密码 / 昵称」一屏塞满，现在拆成三步，
每步只显示自己的字段，校验通过才能往下走：

| 步骤 | 内容 |
|---|---|
| 第 1 步 · 验证邮箱 | 邮箱 + 验证码（含「发送验证码」与 60 秒倒计时） |
| 第 2 步 · 设置密码 | 密码 + 确认密码 |
| 第 3 步 · 完成注册 | 昵称（选填）+ 邮箱确认 + 「完成注册」 |

细节：顶部有步骤指示器（已完成打勾、当前高亮、中间连线）；「上一步 / 下一步」翻页；
中途按回车等于「下一步」；最后提交前会把三步整体再校验一遍，**有错自动跳回出错的那一步**。

**2）老师端 `/teacher` 布局：需求优先，统计靠后**

顺序从「页头 → 统计条 → 筛选 → 列表」改成：

```
页头 → 搜索/筛选栏 → 需求列表（订单）+ 分页 → 统计信息（最下方）
```

统计块移到底部后加了一个小标题「统计信息」，否则浏览到底部会不知道那几张卡是什么。

### 个人主页（老师简历 + 帖子）

「我的」页面升级成了**个人社交主页**：

| 能力 | 说明 |
|---|---|
| 个人简历 | **老师**可以填/改简历（姓名、性别、年龄、城市、学历、院校、专业、可授科目、可授年级、期望时薪、教龄、可授课时间、自我介绍、证书荣誉、联系方式），展示在自己主页上 |
| 发帖子 | 所有登录客户都能发帖（正文最多 1000 字，可选配图），出现在自己的主页上，可删自己的帖 |
| 公开主页 | `/public/{accountId}` 是别人能看的只读版：昵称 / 身份 / 注册时间 + 简历 + TA 的帖子（分页）；旧地址 `/u/{accountId}` 重定向回 `/me` |

数据落在两张新表（`sql/patch-03-teacher-profile-posts.sql`）：

* `t_teacher_profile` —— 简历，主键就是 `account_id`（与账号 1:1，没填就没有行）；
* `t_user_post` —— 帖子，逻辑删除（`del_flag`）。

接口都在客户体系里（`/customer/profile/**`、`/customer/posts/**`，见 `docs/CUSTOMER-API.md`），
统一由 `CustomerAuthInterceptor` 校验登录，**未登录一律 401**（实测确认）。

两个刻意的设计决定：

1. **看别人的主页不返回邮箱**：`/customer/profile/{accountId}` 的 account 里只有
   账号ID / 昵称 / 身份 / 注册时间，邮箱只在 `/customer/profile/me` 里给本人。
   验证脚本里有一条用例专门断言这一点。
2. **简历只有老师能写**：学生调 `PUT /customer/profile` 会返回
   `400 只有老师身份可以填写简历`，前端也不显示简历编辑区。

> 「发现入口」已经补上：见下面的「广场」，所有审核通过的帖子都收在那里，
> 从在线用户的人名可以点进 TA 的公开主页。

### 广场 + 帖子审核（本轮新增）

帖子不再是「发完就对外」，而是先落成**待审核**，后台通过后才进广场：

| | 说明 |
|---|---|
| 发帖 | `POST /customer/posts` 写入 `audit_status='0'`（待审核），响应提示「已提交，审核通过后会展示在广场上」 |
| 自己的列表 | `GET /customer/posts/mine` 返回**全部状态**，卡片右上角带「待审核 / 已通过 / 未通过」，被拒的还显示拒绝理由 |
| 广场 | `GET /customer/posts/plaza` 只返回 `audit_status='1'`，学生、老师都能看（移动底栏第二个入口、顶栏也有） |
| 别人的主页 | `GET /customer/profile/{id}` 与 `/profile/{id}/posts` 同样只算通过的帖子（`postCount` 也一致） |
| 后台审核 | `/admin/post`（侧栏「内容管理 → 帖子审核」）：待审核 / 已通过 / 已拒绝 / 全部四个标签页，通过一键，拒绝要填理由；侧栏带待办角标 |
| 状态流转 | `0 待审核 → 1 通过 / 2 拒绝`，只有这两个合法值，非法值返回 `400 审核结果只能是「通过」或「拒绝」` |

表结构改动见 `sql/patch-04-post-audit-and-apply.sql`（`t_user_post` 加
`audit_status / audit_remark / audit_time` + `idx_post_audit`，历史行统一置为 `'1'`）。

### 老师「申请联系」→ 学生「老师申请」（本轮新增）

老师端需求列表每一行多了「申请联系」按钮，点完变成「已申请」：

| 接口 | 谁用 | 说明 |
|---|---|---|
| `POST /customer/demands/{id}/apply` | 老师 | 申请联系学生，可带一句留言；同一条需求只能申请一次（唯一键 `uk_apply_demand_teacher`），重复申请返回 400 |
| `GET /customer/demands/applied` | 老师 | 我申请过的需求 ID 列表，前端用来把按钮显示成「已申请」 |
| `GET /customer/demands/applications` | 学生 | 我发布的需求收到的老师申请（老师昵称、需求标题、留言、状态），学生「我的」页面第一块就是这个模块 |

**这一轮同时删掉了三处重复入口**（都是「同一件事两个页面」）：

| 删除项 | 原因 |
|---|---|
| 学生端「找家教」 | 学生的模型是「发需求、等老师对接」，逛家教库是老师才需要的事 |
| 学生「我的」里的个人简历 | 简历只有老师能填，学生那块位置改成「老师申请」——真正对学生有用的信息 |
| 老师端「我的」里的「在新页面打开」外链 | 公开主页就在「我的」里就地预览（`/public/{id}` 仍然可直达） |

同一轮把首页搜索简化成**只剩关键词**（原来的科目 / 预算 / 城市筛选条都去掉了，
需求池顶部就是一个搜索框），身份切换开关也取消（身份一次性选定，见后文）。

### 视觉：统一品牌蓝 `#3C65E2`

* 主色、边框、输入框描边、焦点环全部取自同一个 HSL 变量（`--primary: 225 74% 56%`），
  改一处全站跟着变，不再有「灰边框 + 蓝色按钮」这种两套语言；
* 客户侧顶栏整条是品牌蓝、白字（`bg-primary text-primary-foreground`），
  深色模式下自动换成更亮的一档，保证对比度；
* 顶栏里的焦点环改成白色（蓝底上用蓝色焦点环等于看不见）。

### 管理后台改造：家长信息 → 老师信息

平台的用户模型变了（客户自己注册、自己选身份），后台也跟着对齐：

| 原来 | 现在 |
|---|---|
| 家长信息（`t_parent_info`，旧的微信家长档案） | **已移除**（页面、路由、侧边栏入口都没了） |
| 学员信息（`t_student_info`） | **学生信息** = 客户侧注册、身份为学生的账号 |
| —— | **老师信息**（新增）= 客户侧注册、身份为老师的账号 |

数据来源统一成 `t_customer_account` 按 `role` 过滤：
`TEACHER` → 老师信息，`STUDENT` → 学生信息。「数据概览」的 4 张卡也相应改成
**家教 / 老师 / 学生 / 待审核**。

新增的后台接口（`CustomerAccountController`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/system/customerAccount/list?role=TEACHER\|STUDENT` | 分页列表，支持邮箱 / 昵称 / 状态筛选 |
| GET | `/system/customerAccount/{accountId}` | 账号详情 |
| PUT | `/system/customerAccount/status` | 启用 / 停用（`{"accountId":1,"status":"1"}`） |

几个实现上的注意点：

* **列表不带密码字段**：查询语句专门不 select `password`（`@JsonProperty(WRITE_ONLY)`
  也保证不会被序列化出去），验证脚本里有一条用例专门断言这一点；
* **停用是真的有用**：`CustomerAuthService.login` 会拦 `status=1` 的账号，
  所以后台停用后，该客户在客户端就登不上了；
* **客户账号仍然不在 `sys_user` 里**，后台接口只是「查看」，
  与后台自身的管理员账号体系互不影响；
* 前端删掉了 `pages/admin/ParentList.tsx`、`StudentList.tsx` 和对应的
  `api/parent.ts`、`api/student.ts`；两个页面共用一个
  `pages/admin/CustomerAccountList.tsx`（按 `role` 参数区分）。
* 后端的 `TParentInfoController` / `TStudentInfoController` **保留**（表也还在），
  只是后台不再有入口 —— 删它们要连 service/mapper/domain 一起动，没必要。

### 客户侧改造（本次新增）

平台的用户界面现在**在网站根目录** `/`（管理后台让到 `/admin`，不再占根目录）：

| 能力 | 说明 |
|---|---|
| 邮箱账号体系 | 邮箱 + 密码注册登录，**不需要企业资质、不走短信**；账号存 `t_customer_account`，与若依 `sys_user` 完全隔离 |
| 注册前必须先验证邮箱 | 点「发送验证码」→ 邮箱收到 6 位码 → 填码才能注册；验证码 5 分钟有效、一次性、限流 60 秒/次、每小时 10 次、错 5 次作废 |
| 注册后选身份 | 注册时不选，注册完成后由客户自己选「老师」或「学生」 |
| 老师界面 | `/demands`：**列出所有学生发布的需求**（科目、年级、预算、城市、描述），顶部只做**关键词搜索** |
| 学生界面 | `/student`：学生**描述自己的需求**（多选科目 + 给老师的预算区间/单位 + 授课方式 + 城市 + 详细说明），可改可删可取消 |
| 示例数据 | **已全部清空**（客户侧 + 管理端都没有假数据）。5 个验证脚本**自带数据、跑完自清** |
| 个人主页 | ✅ **已上线**：`/me` 是个人社交主页（老师简历 + 发帖），`/u/{账号ID}` 是别人能看的公开版 |

接口契约见 `docs/CUSTOMER-API.md`。技术要点：客户 token 由独立的
`CustomerTokenService` 签发（Redis 前缀 `customer_tokens:`）、由独立的
`CustomerAuthInterceptor` 校验，**刻意不接入 Spring Security** —— 客户在
Spring Security 眼里始终是匿名的，所以客户 token 打 `/system/**` 必然失败
（验证脚本里有一条用例专门断言这一点）。

一键启动：`bash bin-linux/0-start-all.sh`　一键停止：`bash bin-linux/9-stop-all.sh`

---

## 二、必须先说明：那个 zip 是**截断**的

你给的路径是 `/root/tutor-platform-portable.zip`，但：

1. **`/root` 读不了** —— 该目录权限是 `drwx------ root:root`，而当前会话是普通用户
   `ubuntu`，`sudo` 又被 `no_new_privs` 挡住（`sudo: The "no new privileges" flag is set`）。
2. 平台把上传件暂存在 `/tmp/tutor-platform-portable.zip_1791972600014`，这个能读。
   但它的长度是 **373293056 字节 = 正好 356 MiB** —— 一个整数上限，
   而且文件里**没有中央目录**（`End-of-central-directory signature not found`），
   `unzip` 直接判定「不是 zip」。也就是说：**上传被截断了**。

### 怎么救回来的

写了 `_recover_zip.py`：不依赖中央目录，直接按 **local file header** 顺序流式扫，
支持 store / deflate，支持带 data descriptor（GP flag bit 3）的条目。

结果：**恢复 13674 个条目 / 361 MB（占压缩包的 97.3%）**，断点落在
`runtime/jdk8/jdk8u504-b01/jre/lib/rt.jar` 中间。

### 有什么影响

**没有影响。** 丢掉的只有 Windows 版 JDK 的尾部，而 Windows 的 JDK 在 Linux 上
本来就必须整体替换。项目本体（293 个 `.java`、48 个 Mapper XML、已构建的
`tutor-admin.jar`、`sql/` 三个脚本、前端源码与 `dist/`）**全部完整**。

> 想要 100% 完整的包：请在宿主机上执行
> `sudo cp /root/tutor-platform-portable.zip /home/ubuntu/PlatformE/`，
> 或者重传一份小于上限的包（比如先删掉 `runtime/` —— 反正那是 Windows 运行时，用不上）。

---

## 三、原件 vs 本机：运行时对照

原便携包里的运行时**全是 Windows 二进制**，逐个用等价 Linux 组件替换。
所有替换件都是从 Ubuntu 官方仓库下载 `.deb` 后**解包到项目内的私有目录**，
全程**不需要 root**。

| 用途 | 原件（Windows，用不了） | 现在（Linux） | 来源 |
|---|---|---|---|
| JDK | `runtime/jdk8/jdk8u504-b01/bin/java.exe` | OpenJDK **1.8.0_504** | `openjdk-8-jre-headless`（版本与原包一致） |
| MySQL | `runtime/mysql/mysql-8.0.28-winx64/bin/mysqld.exe` | MySQL **8.0.46** | `mysql-server-core-8.0` + `mysql-client-core-8.0` |
| Redis | `runtime/redis/redis-server.exe` | Redis **7.0.15** | `redis-server` |
| Node | `runtime/node/bin/node.exe` | Node **24.19.0**（本机已有） | `/home/ubuntu/.local/node/bin` |
| 包管理 | `runtime/pnpm/` | pnpm **10.34.5**（本机已有） | 同上 |
| 启动脚本 | `*.bat` / `bin\*.bat` | `bin-linux/*.sh` | 本次新增 |
| 共享库 | 随 exe 的 dll | `runtime-linux/opt/usr/lib/x86_64-linux-gnu`（用 `LD_LIBRARY_PATH` 引入） | 各类 `lib*.deb` |

**为什么必须换 MySQL 而不是换 MariaDB**：`sql/tutor.sql` 里有 50 处
`utf8mb4_0900_ai_ci` 排序规则，这是 MySQL 8 独有的，MariaDB 不支持。

---

## 四、代码与配置改了哪些

### 4.1 源码（`tutor/` 下）

| 文件 | 改动 | 原因 |
|---|---|---|
| `tutor-admin/src/main/resources/application.yml` | `ruoyi.profile`: `D:/ruoyi/uploadPath` → `/home/ubuntu/PlatformE/tutor-platform/data/uploadPath` | 上传目录原来指向不存在的 D 盘 |
| 同上 | `server.port`: `8080` → **`12501`** | 本机 `127.0.0.1:8080` 已被平台自己的 Caddy 占用（见第六节坑 4）；12501 同时是对公网开放的端口 |
| `tutor-admin/src/main/resources/application-druid.yml` | JDBC URL 增加 `enabledTLSProtocols=TLSv1.2` | MySQL 8.0.46 与 JDK 8 默认 cipher 协商失败（坑 3） |
| `tutor-admin/src/main/resources/logback.xml` | `log.path`: `E:\home\ruoyi\logs` → `.../data/logs` | Windows 路径在 Linux 下会生成名字带反斜杠的怪文件 |
| `tutor-web/.env.development`、`.env.production`、`vite.config.ts` | 端口 `5173` → **`12500`**，`host` 改 `0.0.0.0`，代理目标 `8080` → `12501` | 对上公网开放的前端端口 |
| `tools/verify-api.py` | 默认 `BASE` 端口 `8080` → `12501` | 让交付的验证脚本开箱可用（仍可用 `TUTOR_API_BASE` 覆盖） |
| `tools/verify-web-e2e.py`、`tools/verify-browser.py` | 默认 `TUTOR_WEB_BASE` 端口 `5173` → `12500` | 同上 |

### 4.2 已构建的 jar 也要一起改

交付的是**构建好的 `tutor-admin/target/tutor-admin.jar`**，上面那些配置是打进
`BOOT-INF/classes/` 里的。只改源码不重新构建，运行时用的还是旧配置。
本机没有 Maven（也不需要为了改几行配置去下一整套依赖），所以用
`tools-linux/patch-jar-config.py` **直接就地把 jar 里的配置改掉**：

- 原始 jar 保留为 `tutor-admin.jar.orig-win`（84,584,557 字节）
- 脚本每次都从 `.orig-win` 重新生成，**可重复执行**，不会叠加改动
- 改完 `unzip -t` 校验通过

> 如果你后来装了 Maven 想正规重建：`mvn -DskipTests package` 即可，
> 源码里的配置已经是对的。

### 4.3 新增目录

```
tutor-platform/
├── bin-linux/            # Linux 启动脚本（对应原来的 .bat）
│   ├── _common.sh        #   公共：路径/端口/等待端口/启停函数
│   ├── 0-start-all.sh    #   一键全启（对应 start-all.bat）
│   ├── 1-mysql.sh        #   MySQL（首次自动 --initialize-insecure）
│   ├── 2-redis.sh        #   Redis
│   ├── 3-backend.sh      #   Spring Boot
│   ├── 4-web.sh          #   前端（自动识别 Windows 版 node_modules 并重装）
│   ├── 5-init-db.sh      #   建库 + 导表 + 补丁 + 演示数据（对应 README 第三节）
│   ├── 6-rebuild-backend.sh  # 改完 Java 源码后重新打包 jar
│   ├── 7-tls-cert.sh     #   放证书 + 用 WEB_TLS=1 启前端（默认不启用）
│   ├── 8-mail-echo.sh    #   验证码测试回显开关 on|off|status（会自动重启后端）
│   └── 9-stop-all.sh     #   全部停止（对应 stop-all.bat）
├── runtime-linux/        # Linux 运行时（替代 runtime/）
│   ├── env.sh            #   单独 source 它也有一套完整环境变量
│   ├── opt/              #   从 .deb 解包出来的 usr/、etc/
│   ├── jdk8/ mysql/ redis/ node/   # 指向 opt/ 或本机 node 的软链接
│   └── mysql/my.cnf, redis/redis.conf
├── data/                 # 运行期数据（全部落在项目内，可整体搬走）
│   ├── mysql-data/ logs/ redis/ uploadPath/ mysql-files/ pids/
└── tools-linux/
    └── patch-jar-config.py
```

---

## 五、怎么启动

```bash
cd /home/ubuntu/PlatformE/tutor-platform

bash bin-linux/0-start-all.sh     # 一键全启
bash bin-linux/9-stop-all.sh      # 一键全停
```

前端有两种起法（`4-web.sh` 按 `WEB_MODE` 选，默认第一种）：

| 模式 | 命令 | 行为 | 什么时候用 |
|---|---|---|---|
| **preview（默认）** | `bash bin-linux/4-web.sh` | 发现 `dist` 比源码旧就先 `vite build`，再 `vite preview` 伺服生产产物 | **对公网/给真实用户看**。首屏 5 个请求、约 194KB |
| dev | `WEB_MODE=dev bash bin-linux/4-web.sh` | 原来的 `pnpm dev`（带 HMR） | 本机改前端调样式；每个模块一个请求，公网上很慢 |

> 改完前端代码**不用手动 build**：`4-web.sh` 会比较 `src/`、`index.html`、`vite.config.ts`、
> `package.json`、`tailwind.config.js`、`.env.*` 与 `dist/index.html` 的 mtime，
> 过期就自动重建（想强制重建：`WEB_FORCE_BUILD=1 bash bin-linux/4-web.sh`）。
> 注意 preview 模式**没有 HMR**，改完代码需要重跑一次 `4-web.sh`（或 `9-stop-all.sh` 后再启）。

启动完成后：

| 入口 | 本机地址 | 公网地址 |
|---|---|---|
| 电脑端管理后台 | http://127.0.0.1:12500/admin/login | **http://82.156.178.102:12500/admin/login** |
| 找家教（客户侧公开页） | http://127.0.0.1:12500/tutors | **http://82.156.178.102:12500/tutors** |
| 后端接口文档 | http://127.0.0.1:12501/swagger-ui/index.html | **http://82.156.178.102:12501/swagger-ui/index.html** |
| MySQL | `127.0.0.1:3307`，`root` / `1234`，库 `tutor` | 不开放（安全组未放行） |
| Redis | `127.0.0.1:6379`，无密码 | 不开放（只监听回环） |

登录账号：`admin`（**口令已改为强口令，不再使用 `admin123`**；仓库里不保存明文，见交付说明）

> ⚠️ 端口与原件都不同：前端 **12500**（原 5173）、后端 **12501**（原 8080）。
> 原因见第六节坑 4（8080 被平台 Caddy 占用）与第九节（公网映射）。

单独起某个服务：`1-mysql.sh` / `2-redis.sh` / `3-backend.sh` / `4-web.sh`。
重导数据库：`5-init-db.sh`（幂等，可反复跑）。

服务都是 `setsid nohup` 起的**独立进程组**，不依赖当前终端，关掉 SSH 也还在跑；
日志在 `data/logs/`（`backend.log`、`sys-info.log`、`mysql-error.log`、`web.log` …）。

---

## 六、移植过程中踩到的坑（都验证过、都修了）

**1. `my.cnf` 的注释只能用 `#`**
我最开始用 SQL 风格的 `--` 写注释，mysqld 直接拒绝启动：
`Found option without preceding group in config file ... at line 1`。

**2. Ubuntu 的 mysqld 有编译期默认 `secure-file-priv=/var/lib/mysql-files`**
这个目录在本机不存在，初始化能过、**启动阶段直接 abort**：
`[ERROR] [MY-010095] Failed to access directory for --secure-file-priv`。
→ 在 `my.cnf` 里显式指到 `data/mysql-files`。

**3. JDK 8 ↔ MySQL 8.0.46 的 TLS 握手失败**
配置里 `useSSL=true`，报 `SSLHandshakeException: Received fatal alert: handshake_failure`
（服务端 `have_ssl=YES`、证书齐全，是 cipher 协商问题）。
→ URL 加 `enabledTLSProtocols=TLSv1.2`，握手成功。
（若哪天又不行，本机回环场景可退到 `useSSL=false&allowPublicKeyRetrieval=true`，
`caching_sha2_password` 也能过，但那样是明文，只适合本地。）

**4. 8080 端口根本拿不到 —— 而且会让启动脚本"假成功"**
本机 `127.0.0.1:8080` 被**平台自己的 Caddy** 占着（`Server: Caddy`，返回 `HTTP 421`），
属于 root 进程，杀不掉也不该杀。更坑的是：我原来的启动脚本只探测「端口能不能连上」，
于是 Caddy 一回应就判定"后端已就绪"，日志里其实早就 `Application run failed` 了。
→ 一是把后端换到 **12501**（当时先换到 18080，后来为了对公网开放又改成 12501），
二是脚本改成先探测端口、**再看进程是否还活着**。

**5. `pnpm dev` 的子进程不随父进程退出**
`9-stop-all.sh` 第一次跑完后，5173 仍然被占：`pnpm` 只是父进程，真正干活的是它
fork 出来的 `node .../node_modules/.bin/vite`。
→ 启动统一走 `setsid`（pid 即进程组组长），停止时 `kill -- -PID` 杀整组，
并按端口兜底清理残留。现在停完四个端口全部释放。

**6. 前端 `node_modules` 是 Windows 构建产物**
里面有 `@esbuild/win32-x64`、`@rollup/rollup-win32-x64-msvc` 这类平台专用二进制，
Linux 上必然加载失败。`4-web.sh` 会检测 `node_modules/@esbuild/linux-x64` 是否存在，
不存在就删掉重装（`.npmrc` 里已配 `registry=https://registry.npmmirror.com`）。

**7. apt 索引与实际 pool 不一致，`apt-get download` 全 404**
本机 apt 指向 `mirrors.tencentyun.com`，索引里的版本在 pool 里已经没有（404）。
→ 写了 `_runtimes/resolve-debs.py`：直接读官方 `Packages.gz` 索引解析出**真实文件名**
再下载，一次成功。

**8. 容器里 `LANG` 为空会让 JDK 8 退回 ASCII**
中文会变乱码（这个项目的核心数据全是中文）。
→ `bin-linux/_common.sh` 里固定 `LANG/LC_ALL=C.UTF-8` 并设
`JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8`。

---

## 七、验证结果

```bash
# 六个脚本，跑之前先 export 好 TUTOR_ADMIN_PASSWORD / TUTOR_CHROME / PYTHONPATH 等（见第一节）；
# 客户侧三个脚本要读验证码，先把测试回显打开（只对 example.com 这类测试域生效）
bash bin-linux/8-mail-echo.sh on

python3 tutor/tools/verify-api.py                # 37 项（管理后台）
python3 tutor/tools/verify-web-e2e.py            # 17 项（联调 + 生产构建）
python3 tutor/tools/verify-browser.py            # 19 项（后台真实浏览器）
python3 tutor/tools/verify-customer-api.py       # 108 项（客户侧接口）
python3 tutor/tools/verify-customer-browser.py   # 86 项（客户侧真实浏览器）
python3 tutor/tools/verify-mobile-nav.py         # 69 项（移动底栏 + 首屏）

bash bin-linux/8-mail-echo.sh off                # 跑完记得关掉（会自动重启后端）
```

| 脚本 | 结果 | 覆盖 |
|---|---|---|
| `verify-api.py` | **37 / 37** | 登录、权限、分页去重（Bug 2 的回归）、中文 UTF-8、审核通过/拒绝、公开家教列表联动、8 个列表接口、后台客户账号接口（老师/学生）、服务监控、未登录 401 |
| `verify-web-e2e.py` | **17 / 17** | 6 个前端路由、经代理登录、中文不乱码、`/monitor/server` 的 data 包裹兼容、公开接口免登录、`dist/` 生产构建产物 |
| `verify-browser.py` | **19 / 19** | 真实 Chromium 内核渲染、**真实交互登录**（填表 → 点提交 → 跳到 `/admin/dashboard`）、token 落 localStorage、8 个页面渲染非空（含**帖子审核**）、侧栏入口不是死链、**控制台 0 条 JS 异常**、截图 |
| `verify-customer-api.py` | **108 / 108** | 邮箱注册/登录/身份、需求 CRUD 与边界、**申请联系（老师发起、学生查看、重复申请 400、学生申请 403）**、**帖子审核（待审核不进广场 → 后台通过才进 → 拒绝带理由）**、找回密码、IP 限流、越权隔离 |
| `verify-customer-browser.py` | **86 / 86** | 三步注册 → 选身份 → 发需求 → 注册老师 → 需求池 → **申请联系 → 学生「老师申请」** → 简历/发帖（待审核标） → 公开主页 → 「我的」→ 找回密码 → 客户侧 404、**0 条 JS 异常** |
| `verify-mobile-nav.py` | **69 / 69** | 逐个身份核对移动底栏（含广场）、老师/学生访问 `/tutors` 被送回、激活态唯一、页脚统计、旧地址重定向、无横向溢出、首屏请求数 |

关键几条实测值：`total=13 distinct=13`（Bug 2 的 LEFT JOIN 去重生效）、
`subjectNames=['数学,物理,奥数', ...]`（Bug 3 的补丁生效）、
`通过后该家教出现在公开家教列表 -> 8 -> 9 条`（审核闭环通）、
`点击登录后跳转成功 -> 当前路径=/admin/dashboard`（Bug 1 的登录白屏确实已修）。

### 真实浏览器验证是怎么跑起来的

`verify-browser.py` 需要 Chrome/Edge 内核（脚本支持 `TUTOR_CHROME` 指定路径），
而本机**原本没有任何浏览器**；Ubuntu 24.04 的 `chromium-browser` 又是 snap 壳子
（本机没有 snapd），所以额外准备了四样东西，都不用 root：

1. **Chrome for Testing 155.0.8059.79**
   —— 注意：`storage.googleapis.com` 从本机只有 **~12 KB/s**（150 MB 要下几个小时），
   实测 `cdn.npmmirror.com` 有 **~5.9 MB/s**，所以脚本改成优先走 npmmirror 镜像、
   Google 兜底。位置：`runtime-linux/opt/chrome/chrome`。
2. **缺失的共享库**：`fetch-chrome.py` 会对 chrome 目录下所有 ELF 跑 `ldd`，
   把 `not found` 的 soname 映射成 Ubuntu 包名、下载 `.deb`、解包，循环直到干净。
   最终补了 20 多个包（libatk / libcups / libgbm / libpango / libXcomposite …）。
3. **中文字体**：系统里一个 CJK 字体都没有，不装的话截图里中文全是豆腐块。
   `fonts-noto-cjk` 解包后把 4 个 `.ttc` 放进 `~/.fonts`（fontconfig 默认会扫这里），
   已确认 fontconfig 缓存里认到了 `NotoSansCJK-*`。
4. **`websocket-client`**：本机 `python3` 没有 pip（`No module named pip`），
   所以直接下 wheel 解包到 `_runtimes/pylibs`，用 `PYTHONPATH` 引入。

运行方式：

```bash
cd /home/ubuntu/PlatformE/tutor-platform
export TUTOR_CHROME=$PWD/runtime-linux/opt/chrome/chrome
export PYTHONPATH=/home/ubuntu/PlatformE/_runtimes/pylibs   # websocket-client
export LD_LIBRARY_PATH=$PWD/runtime-linux/opt/usr/lib/x86_64-linux-gnu
export TUTOR_SHOTS=$PWD/tutor/docs/screenshots-linux        # 见下面的提醒
python3 tutor/tools/verify-browser.py
```

> ⚠️ `verify-browser.py` 开跑前会**清空 `docs/screenshots/*.png`**。
> 为了不毁掉原件里那 8 张（Windows 时期）截图，本次把 `TUTOR_SHOTS` 指到了
> `tutor/docs/screenshots-linux/`，新截图都在那里；原目录原样保留。
> 两套目录现在并存，可以对比。

---

## 八、还没做 / 需要你决定的

1. **安全项已经换过一轮**（详见 §9.4）：管理员口令、JWT 密钥、Redis 口令、
   Swagger / Druid 关闭、MySQL 只绑回环、微信支付证书移出仓库 —— 都做完了。
   **还没做的三件**：① MySQL 口令仍是 `1234`（在 `application-druid.yml` 里，改口令要
   同时改这个文件和 `bin-linux/_common.sh`）；② HTTPS 等域名备下来再开（§9.4-bis，开关已就绪）；
   ③ 若只想让 12500 对外，可在腾讯云安全组把 12501 关掉（后端走前端反代即可）。
2. **`_runtimes/` 目录**（约 307 MB）是搭这套 Linux 运行时用的脚本、`.deb` 缓存、
   Chrome 安装包与 `websocket-client`，移植已经完成，可以直接删掉，不影响运行
   （但删了之后 `verify-browser.py` 就不能跑了）。
   里面值得一提的文件：`resolve-debs.py`（按 Packages 索引解析真实包名）、
   `fetch-chrome.py`（Chrome + 依赖库闭环）、`_recover_zip.py`（在上一级目录）。
3. **原件 `runtime/` 目录**（Windows 运行时，约 704 MB）保留着没删，
   确认不需要 Windows 版就可以删，能省不少空间。
   `runtime-linux/`（约 691 MB，含 Chrome）是现在实际在用的那套。
4. MySQL 数据目录在项目内（`data/mysql-data`，约 209 MB），整个 `tutor-platform/` 目录
   可以整体拷走，但**目标机器的路径必须还是 `/home/ubuntu/PlatformE/tutor-platform`**
   —— `my.cnf` 与 `application*.yml` 里写的是绝对路径。
5. **`tutor/docs/screenshots/`（原 8 张 Windows 截图）与
   `tutor/docs/screenshots-linux/`（本次在 Linux 上重新截的 8 张）并存**，
   确认新截图没问题后可以把前者删掉。

---

## 九、公网映射（12500 / 12501）

### 9.1 网络实情

- 这台机器是**腾讯云**的实例，网卡上只有内网地址 `10.2.0.9`，
  公网 `82.156.178.102` 是 NAT 映射的（元数据接口可查）。
- **云安全组默认拦掉几乎所有入站端口**。实测（用 check-host.net 从国外多节点探测）：
  - `22 / 80 / 20976` → 公网可达（平台自己用的）
  - `3307 / 18080` → **连接超时**（当时后端在 18080，公网根本连不进去）
  - 改成 `12500 / 12501` 后 → **4/4 节点可达 ✅**
- 平台的 Caddy（root 进程，`/etc/caddy/Caddyfile`，注释写着「勿手改」）占着
  80 / 8080 / 20976，**借不到**——既改不了配置也不能 reload（需要 root）。
  所以没有走"反代到 80 端口"这条路，而是直接开两个高位端口。

### 9.2 端口分配

| 端口 | 服务 | 监听地址 | 公网 |
|---|---|---|---|
| **12500** | 前端（客户侧 + 管理后台 + 找家教，并把 `/prod-api` 反代到后端） | `0.0.0.0` | ✅ 开放 |
| **12501** | Spring Boot 后端（接口 / Swagger） | `0.0.0.0` | ✅ 开放 |
| 3307 | MySQL | `0.0.0.0`（安全组未放行） | ❌ 不可达 |
| 6379 | Redis | `127.0.0.1`（只监听回环） | ❌ 不可达 |

日常只访问 **12500** 就够了：页面和接口都从这一个端口进出（`/dev-api` 由 Vite 代理转发）。

### 9.3 验证（从公网真实探测，不是本机自测）

| 检查 | 结果 |
|---|---|
| TCP `82.156.178.102:12500` | 4/4 外部节点可达 |
| TCP `82.156.178.102:12501` | 4/4 外部节点可达 |
| HTTP `http://82.156.178.102:12500/tutors` | 多节点均返回 **HTTP 200** |
| HTTP `http://82.156.178.102:12501/captchaImage` | 3 个节点均返回 **HTTP 200** |
| 真实浏览器走**公网地址**跑 `verify-browser.py` | **16 / 16 通过**（含真实交互登录 → 跳转 `/admin/dashboard`、7 个页面渲染、0 条控制台异常） |
| 三套验证脚本（本机端口） | **60 / 60 通过** |

### 9.4 安全加固（2026-10-18 已完成）

原来这份包的密钥/口令全是**原项目公开值**（README 里就有），当时只是演示用。现在已按下面
这张表全部关掉，凭据统一收在一个本地文件里（不在仓库里）：`~/.dsh/secrets/tutor-admin.txt`。

| 项 | 加固前 | 现在 |
|---|---|---|
| 管理员口令 | `admin` / `admin123`（README 里公开） | 已改强口令（16 位，大小写+数字+符号）；旧口令实测已失效 |
| JWT 签名密钥 | `abcdefghijklmnopqrstuvwxyz` | 64 位随机 hex（`token.secret`）；旧 token 全部作废，用户重新登录一次即可 |
| Swagger 接口文档 | `swagger.enabled: true`，`/swagger-ui` 匿名可访问 | `enabled: false` + 从安全白名单移除 → `/v2/api-docs`、`/swagger-resources` 返回 401，文档数据不存在 |
| Druid 监控台 | `/druid/*` 匿名 + `ruoyi/123456` | `statViewServlet` / `webStatFilter` 双关闭（实测 404），并从白名单移除 |
| Redis | 无密码（能连上就能读全部会话） | 已设 32 位随机 `requirepass`，`redis-cli ping` 无口令返回 `NOAUTH`；仍只监听 127.0.0.1 |
| MySQL | 监听 `*:3307`（全接口） | 改为 `bind-address=127.0.0.1`，只监听本机（口令仍是 `root/1234`，见下方遗留项） |
| 传输 | 明文 HTTP（token 在链路上可见） | **仍为 HTTP**（TLS 管道已备好，等域名；见 9.4-bis） |
| 微信支付证书 `apiclient_cert.p12` | 真实 PKCS#12 放在 `resources/cert/` 里 | 已移出仓库到 `~/.dsh/secrets/quarantine/`（代码运行时不读它，仅 `HttpClientUtil` 里有一段通用 PKCS12 逻辑） |

**改动落在哪：**

* `tutor/tutor-admin/src/main/resources/application.yml` —— `token.secret`、`spring.redis.password`、`swagger.enabled`
* `tutor/tutor-admin/src/main/resources/application-druid.yml` —— `statViewServlet.enabled` / `webStatFilter.enabled`
* `tutor/tutor-framework/.../config/SecurityConfig.java` —— 白名单里删掉 `/swagger-ui.html`、`/swagger-resources/**`、`/*/api-docs`、`/druid/**`
* `runtime-linux/redis/redis.conf` —— `requirepass`
* `runtime-linux/mysql/my.cnf` —— `bind-address = 127.0.0.1`

**改完必须做的两件事**（都已经做过了，重装环境时要照着来）：

```bash
bash bin-linux/6-rebuild-backend.sh   # 配置打进 jar，必须重建才生效
bash bin-linux/2-redis.sh             # Redis 加了口令，要重启才生效
bash bin-linux/1-mysql.sh             # my.cnf 改了监听地址，要重启才生效
```

**跑验证脚本要多带一个环境变量**（口令不再写在脚本里）：

```bash
export TUTOR_ADMIN_PASSWORD='<后台管理员口令>'
```

#### 遗留项（尚未处理，需要你决定）

1. **MySQL 口令仍是 `root/1234`**：现在只监听回环 + 安全组未放行，外部进不来；
   要彻底改掉需要同时改 `application-druid.yml` 与 `bin-linux/` 里几处 `-p1234`（约 6 处），可以下次一起做。
2. **HTTP 明文**：站点是 `http://82.156.178.102:12500`，没有 TLS。真要对外运营需要域名 + 证书（本机没有 80/443 的控制权，得用别的方式前置一层）。
3. **`/profile/**` 上传目录匿名可读**：这是若依上传后端的正常行为，但意味着任何上传过的文件只要知道路径就能下载。

### 9.4-bis TLS / HTTPS（已备好，**默认关闭**）

> 2026-10-19 先做过一轮 HTTPS，随后按需求**回退成 HTTP**：现在只有公网 IP、没有域名，
> 公共 CA 不给裸 IP 签证书，自签证书会让浏览器弹「不受信任」。等域名到位再打开。

**现在是 HTTP。** 但 TLS 的管道已经全部铺好，域名下来后只需三步：

```bash
# 1) 把受信任证书放进 data/tls/（文件名固定为 server.crt + server.key）
#    · Let's Encrypt（DNS-01，不需要 80/443）：
curl https://get.acme.sh | sh -s email=you@example.com
export CF_Token=...                                   # Cloudflare；阿里云用 Ali_Key/Ali_Secret
~/.acme.sh/acme.sh --issue -d tutor.example.com --dns dns_cf
~/.acme.sh/acme.sh --install-cert -d tutor.example.com \
  --key-file  /home/ubuntu/PlatformE/tutor-platform/data/tls/server.key \
  --fullchain-file /home/ubuntu/PlatformE/tutor-platform/data/tls/server.crt

# 2) 用 TLS 开关启动前端
WEB_TLS=1 bash bin-linux/4-web.sh

# 3) 回退随时可用（不带环境变量即可）
bash bin-linux/4-web.sh
```

| 项 | 说明 |
|---|---|
| 开关 | `vite.config.ts` 读环境变量 `WEB_TLS`：`1` 才用 `server.https` / `preview.https`，否则 HTTP |
| 证书位置 | `data/tls/server.crt` + `data/tls/server.key`（脚本 `bin-linux/7-tls-cert.sh` 可生成自签版 / 查指纹） |
| 缺证书时 | 即使 `WEB_TLS=1` 也只打印警告并退回 HTTP，不会把自己锁在门外 |
| 自签证书 | 想先试：`bash bin-linux/7-tls-cert.sh` 生成（SAN 含公网 IP），浏览器需手动信任 |
| HSTS | **故意没发**：自签阶段一旦记住 HSTS，就再也点不进「继续前往」。换真证书后再加 |

#### 与 TLS 无关、但已经生效的安全响应头

`vite.config.ts` 里的小插件（dev / preview 都生效）：

| 头 | 值 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'` |

#### 验证脚本

默认仍打 `http://127.0.0.1:12500`；若用 `WEB_TLS=1` 起了自签 HTTPS，把地址换掉即可
（脚本已适配：urllib 关证书校验、Chrome 加 `--ignore-certificate-errors`）：

```bash
TUTOR_WEB_BASE=https://127.0.0.1:12500 python3 tutor/tools/verify-mobile-nav.py
```

### 9.5 怎么关掉公网入口

- **只停服务**：`bash bin-linux/9-stop-all.sh`（端口不再应答）
- **彻底断公网**：腾讯云控制台 → 安全组 → 删掉 12500/12501 的入站规则
  （本机没法自己改，`iptables` 需要 root，且云安全组在网络层就拦掉了）
- **想改成只给自己看**：把 `vite.config.ts` 的 `host` 改回 `'127.0.0.1'`、
  `application.yml` 的端口改回任意本机端口，再删安全组规则

---

## 十、从源码构建（Maven 工具链）

最初只需要改配置，所以是直接给**已构建好的 jar** 打补丁（`tools-linux/patch-jar-config.py`）。
后来要新增 Java 代码（客户账号、需求单），就必须真正重建了，于是补了一套工具链：

| 组件 | 位置 | 说明 |
|---|---|---|
| Maven 3.9.9 | `/home/ubuntu/PlatformE/toolchain/apache-maven-3.9.9` | 从 Maven Central 取发行包，**不需要 root** |
| 本地仓库 | `/home/ubuntu/PlatformE/toolchain/m2` | 放在工作区，不污染项目目录 |
| settings.xml | `/home/ubuntu/PlatformE/toolchain/settings.xml` | 只设 localRepository；依赖走项目 pom 里已声明的阿里云仓库（实测 17 MB/s，Maven Central 只有 0.5 MB/s） |
| JDK | `runtime-linux/jdk8` | 额外补装了 `openjdk-8-jdk-headless`（原来只有 JRE，没有 javac） |

一条命令重建并重启后端：

```bash
bash bin-linux/6-rebuild-backend.sh
```

手动构建的话：

```bash
cd tutor
export JAVA_HOME=/home/ubuntu/PlatformE/tutor-platform/runtime-linux/jdk8
export PATH="$JAVA_HOME/bin:/home/ubuntu/PlatformE/toolchain/apache-maven-3.9.9/bin:$PATH"
mvn -s /home/ubuntu/PlatformE/toolchain/settings.xml \
    -Dmaven.repo.local=/home/ubuntu/PlatformE/toolchain/m2 \
    -DskipTests clean package          # 约 13 秒（依赖已缓存）
```

> `tools-linux/patch-jar-config.py` 现在**不再需要**了：源码里的配置已经是
> 本机可用的（端口 12501、Linux 日志/上传路径、JDBC 的 TLS 设置），
> 重建出来的 jar 直接就是对的。原始 Windows jar 备份在 `data/backup/`。

### 坑 9：解包出来的 JRE 是"残"的 —— `java.security` 和 `cacerts` 都是断链

**现象**：Maven 死活连不上仓库，报
`Could not transfer artifact ... No trusted certificate found`，
换成 Maven Central 又变成 `Received fatal alert: handshake_failure`。

**原因**：Ubuntu 的 `openjdk-8-jre-headless` 里这两个关键文件是软链接，
指向由**安装时的 postinst 脚本**生成的文件：

```
jre/lib/security/cacerts       -> /etc/ssl/certs/java/cacerts        （ca-certificates-java 生成）
jre/lib/security/java.security -> /etc/java-8-openjdk/security/...   （装包时写进 /etc）
```

我们只是把 `.deb` 解包到私有前缀、并没有真正安装，所以这两个链接**全是断的** ——
JVM 等于在"没有安全配置"的状态下运行，JSSE 的信任管理与协议配置都不正常。

**修复**（见 `_runtimes/fix-java-truststore.sh`）：

1. 用系统 CA bundle（`/etc/ssl/certs/ca-certificates.crt`，121 张证书）
   **逐张**导入成一个真正的 JKS 信任库，替换断链的 `cacerts`；
2. 把 `java.security` / `java.policy` / `blacklisted.certs` / `nss.cfg`
   重指到解包出来的真实文件（`runtime-linux/opt/etc/java-8-openjdk/security/`）。

修完之后 Maven 不加任何 TLS 参数就能连上仓库。

> **顺带解释了之前的一个谜**：第六节坑 3 里 MySQL 报的
> `SSLHandshakeException: Received fatal alert: handshake_failure`，
> 真因就是这个 —— 不是 MySQL 的密码套件问题，而是 JRE 缺安全配置。
> 修好之后 JDBC 其实不用再限定 `enabledTLSProtocols=TLSv1.2`；
> 不过显式限定 TLS 1.2 本身是合理选择，就保留了。

> **另一个小坑**：不要用 `openssl pkcs12 -export -nokeys -in <多证书 PEM>` 批量转换 ——
> OpenSSL 3 只会把**第一张**证书打进 p12，导出的文件看着正常，
> 转成 JKS 后却是 0 条记录（踩过）。改成逐张导入，并且**校验条目数**再替换。

---

## 十一、注册邮箱验证码（怎么切成真发信）

注册现在是**两步**：先给邮箱发 6 位验证码，填对了才能注册。

### 11.1 当前状态：**已接真实 SMTP（126 邮箱），验证码真的会发到邮箱**

2026-10-19 已接通真实发信，实测链路：后端 SMTP → 126 邮箱 → 用授权码 IMAP 取信 → 提取 6 位码 → 注册成功。

| 项 | 值 |
|---|---|
| 服务商 | 126 邮箱 SMTP（`smtp.126.com:465`，SSL） |
| 发件人 | `家教中介平台 <muzmus@126.com>` |
| 凭据位置 | `data/mail.env`（**不在仓库里**，权限 600，由 `bin-linux/_common.sh` 自动加载） |
| 开发模式 | `MAIL_DEV_MODE=false` —— 验证码**不再**随接口回显 |
| 启动日志确认 | `[客户邮件] 使用 SMTP 发信：host=smtp.126.com from=…` |

配置项一览（`data/mail.env`，全部走环境变量，Spring Boot 宽松绑定直接生效）：

```bash
SPRING_MAIL_HOST=smtp.126.com
SPRING_MAIL_PORT=465
SPRING_MAIL_USERNAME=muzmus@126.com
SPRING_MAIL_PASSWORD=<126 的「客户端授权密码」，16 位，不是登录密码>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE=true
MAIL_DEV_MODE=false          # 关掉后验证码只发邮箱、不回显
MAIL_TEST_ECHO=false         # 自动化测试开关，见 11.5
```

> ⚠️ 126 免费邮箱的限制：每日发信量有上限（几十~两百封量级）、发件人固定为这个 126 地址、
> 邮件底部带网易签名。用来跑通流程和小规模运营没问题；注册量上来后要换成
> 「域名 + 云推送（阿里云 DirectMail / 腾讯云 SES）」，否则验证码会进垃圾箱或被限流。

#### 换发件邮箱怎么做

改 `data/mail.env` 里的 4 行（host/port/username/password）→ `bash bin-linux/3-backend.sh` 重启即可，
不用重建 jar（配置是环境变量，不在 jar 里）。

### 11.2 切到别的服务商（SMTP 参数长什么样）

本机实测**出站 465 端口可达**，所以任何邮箱服务商的 SMTP 都能直接用。
把 `tutor-admin/src/main/resources/application.yml` 里预留的那段注释打开即可：

```yaml
spring:
  mail:
    host: smtp.qq.com          # 换成你的服务商
    port: 465
    username: your-account@qq.com
    password: your-smtp-auth-code   # ⚠️ 是「授权码」，不是登录密码
    default-encoding: UTF-8
    properties:
      mail.smtp.auth: true
      mail.smtp.ssl.enable: true
      mail.smtp.timeout: 10000
      mail.smtp.connectiontimeout: 10000
```

同时把这一行改成 `false`（**上线必须关**）：

```yaml
customer:
  mail:
    dev-mode: false
```

改完 `bash bin-linux/6-rebuild-backend.sh` 重启即可。判定逻辑在
`CustomerMailConfig`：**配了 `spring.mail.host` 就用 SMTP，没配就用开发模式**，
不需要改代码。

> 安全设计：`devCode` 只在「`dev-mode=true` **且** 发信方式确实不是真 SMTP」两个条件
> 同时满足时才返回。所以就算哪天忘了关 dev-mode，只要 SMTP 配好了，验证码也不会被回显。
> 反过来，如果关了 dev-mode 又没配 SMTP，注册会因为收不到码而**直接失败**（fail closed），
> 不会静默放行。

### 11.3 验证码的规则（都可配，见 application.yml 的 `customer.mail.*`）

| 规则 | 默认值 | 配置项 |
|---|---|---|
| 有效期 | 5 分钟 | `code-expire-seconds: 300` |
| 重发间隔 | 60 秒 | `resend-interval-seconds: 60` |
| 每小时上限 | 10 次 | `hourly-limit: 10` |
| 最多错几次 | 5 次（超过作废） | `max-verify-attempts: 5` |
| 一次性使用 | 是 | —（校验通过即从 Redis 删除） |

存储在 Redis，key 前缀 `customer:emailcode:*`（验证码 / 限流 / 次数 / 尝试次数各一个 key）。

### 11.4 自动化测试怎么拿到验证码（test-echo）

真实发信之后，验证脚本没法再去读接口里的 `devCode` 了，而它们注册的都是
`xxx@example.com` 这种收不到信的地址。为此加了一个**只对白名单测试域生效**的开关：

```yaml
customer:
  mail:
    test-echo: ${MAIL_TEST_ECHO:false}                 # 默认关
    test-echo-domains: ${MAIL_TEST_ECHO_DOMAINS:example.com,demo.com,test.local}
```

* 打开后，**只有** `example.com / demo.com / test.local` 这三个域会跳过发信、把 `devCode` 回显；
* 真实邮箱（qq.com、126.com…）永远走 SMTP，即使开关忘了关也不会泄漏真实验证码；
* 跑回归时别手改文件，用现成的开关脚本（写 env + 重启后端一步到位）：

```bash
bash bin-linux/8-mail-echo.sh on     # 跑 tools/verify-customer-*.py / verify-mobile-nav.py 之前
# …跑验证…
bash bin-linux/8-mail-echo.sh off    # 跑完立刻关掉（再跑别的脚本前也先关，免得忘）
bash bin-linux/8-mail-echo.sh status # 只看当前值
```

**当前线上值：`MAIL_TEST_ECHO=false`**（真实用户注册/找回密码都走 126 SMTP，不会回显）。

### 11.5 涉及的文件

| 文件 | 作用 |
|---|---|
| `tutor-framework/.../customer/CustomerMailSender.java` | 发信接口 |
| `tutor-framework/.../customer/SmtpCustomerMailSender.java` | 真发信（HTML 邮件，日志里邮箱打码） |
| `tutor-framework/.../customer/DevCustomerMailSender.java` | 开发模式（写日志） |
| `tutor-framework/.../customer/CustomerMailConfig.java` | 按配置选择发信方式 |
| `tutor-framework/.../customer/CustomerVerificationService.java` | 验证码生成/存储/限流/校验；test-echo 白名单逻辑 |
| `tutor-admin/.../customer/CustomerAuthController.java` | `/customer/auth/send-code` |
| `tutor-web/src/pages/customer/Register.tsx` | 「发送验证码」按钮 + 60 秒倒计时 + 验证码输入 |

---

## 十二、界面与首屏加载（本轮优化）

### 12.1 信息架构：一个外壳、一套导航、一套术语

（这一节在 2026-10 的第二轮重构后重写过：原来客户侧有 H5 与桌面两套外壳。）

**旧状态的问题**（都是真实存在、且都会让用户困惑的）：

| 问题 | 具体表现 |
|---|---|
| 两套外壳 | `/h5/**` 是一套独立 UI（自己的首页、底栏、我的页），客户区 `/`、`/teacher`、`/student`、`/me` 是另一套；点「找家教」会跳到另一套壳里，像换了个产品 |
| 页面重复 | `/h5` 首页 vs `/` 首页、`/h5/my` vs `/me`，同一件事两个页面 |
| 路由撞名 | 客户侧 `/teacher`、`/student` 和管理后台 `/admin/teacher`、`/admin/student` 名字一样但内容不同 |
| 术语混乱 | 「家教」（旧表 `t_tutor_info`）与「老师」（客户账号 `t_customer_account`）混用；后台三个入口「家教信息 / 老师信息 / 学生信息」看不出区别 |
| 装饰过度 | 漂浮光斑、弹跳侧栏、滚动进度条、数字滚动、气泡式底栏，整体像组件展示页 |

**现在（唯一一套客户界面 + 明确的路由语义）**：

| 路由 | 页面 | 谁能看 |
|---|---|---|
| `/` | 落地页（已登录 → 角色首页） | 所有人 |
| `/tutors`、`/tutors/:id` | 找家教（公开家教列表 / 详情） | **仅游客**（老师/学生都会回到自己的首页） |
| `/demands` | 需求池（所有学生发布的需求；顶部仅有关键词搜索框） | 老师 |
| `/demands/mine` | 我的需求 | 学生 |
| `/demands/new`、`/demands/:id/edit` | 发布 / 编辑需求 | 学生 |
| `/me` | 我的主页（单页，不再有标签页）：老师 = 简历 + 我的帖子；学生 = **老师申请** + 我的帖子 | 已登录 |
| `/plaza` | 广场：所有**审核通过**的帖子（信息流） | 已登录（学生、老师都能看） |
| `/public/:accountId` | 别人的公开主页（只读：昵称 / 身份 / 简历 / 帖子） | 已登录 |
| `/choose-role`、`/login`、`/register` | 选身份（一次性）/ 登录 / 注册 | 所有人（`/choose-role` 仅未选身份者） |
| `/admin/**` | 管理后台（独立外壳，仅 `/admin/login` 进入） | 管理员 |

**旧地址全部 301 式重定向**（老书签、聊天里发出去的链接都不会 404）：
`/h5 → /`、`/h5/tutor → /tutors`（保留 query）、`/h5/tutor/:id → /tutors/:id`、`/h5/my → /me`、
`/u/:accountId → /me`、`/h5/my → /me`、
`/teacher → /demands`、`/student → /demands/mine`、`/student/new → /demands/new`、`/student/:id/edit → /demands/:id/edit`。

**导航**（顶栏 + 移动底栏共用同一批入口，「首页」指向角色首页）：
| 身份 | 移动底栏 |
|---|---|
| 游客 | 首页 / 找家教 / 登录 |
| 未选身份 | 首页 / 选身份 / 广场 / 我的 |
| 老师 | 首页(/demands) / 广场 / 我的 |
| 学生 | 首页(/demands/mine) / 发布需求 / 广场 / 我的 |

账户动作（我的主页 / 切换身份 / 退出登录）收进顶栏头像下拉菜单，不再和主导航抢位置。

> **「找家教」只对未登录访客开放**（2026-10-19 起）：
> * 老师：职责是看学生需求，不需要找别的老师；
> * 学生/家长：模型是「发需求、等老师来对接」，也不需要逛家教库（学生端的这一项已彻底删除，
>   连同路由与守卫一起）；
> * 所以登录后（老师 or 学生）底栏、顶栏、页脚都不出现该入口，直接访问 `/tutors` 或
>   `/tutors/:id` 会被 `RequireGuestOnly` 守卫送回自己的首页（不做成 404，免得手输地址撞墙）。
> * 游客不受影响：落地页的「找家教」按钮、热门科目 chip、`/tutors` 列表都还在。

**管理后台**：侧边栏按数据域分组，并给每项一句副说明 ——
概览（数据概览）／家教业务（家教档案与审核，唯一审核入口）／内容管理（帖子审核，带待办角标）／
客户账号（入驻老师、入驻学生）／系统管理（系统用户、角色、在线用户）／
日志与监控（登录日志、操作日志、服务监控）／历史数据（微信用户，最底部弱化）。
术语统一为「家教＝档案审核」「老师/学生＝客户账号」「帖子＝客户发的内容」。

#### 身份是「一次性」的（2026-10-19 起）

老师 / 家长（学生）两种身份**只能选一次，不提供切换**：

* 前端：顶栏账户菜单与移动端抽屉里，只有 `role=null` 的账号才出现「选择身份」；
  已有身份的账号进入 `/choose-role` 会被直接送回自己的首页；选择页本身也移除了「当前身份 / 切换为…」这套 UI。
* 后端：`PUT /customer/auth/role` 在 `CustomerAuthService.setRole` 里加了一道校验 ——
  已选过身份再改会返回 `400 身份已确定为老师，不支持切换；如需另一种身份请使用其他邮箱注册`；
  重复提交同一身份是幂等的（返回 200，不报错）。
* 需要另一种身份：用另一个邮箱重新注册。

#### 「我的」页结构（/me）

| 区域 | 内容 |
|---|---|
| 身份头 | 头像 / 昵称 / 身份徽章 / 注册时间 / 帖子数 + 「在新页面打开」（`/u/{accountId}`） |
| 我的资料 | 简历只读态 ⇄ 编辑态（老师可编辑；学生看到「简历只有老师身份可以填写」） |
| 我的帖子 | 发帖框 + 我的帖子列表（分页 / 删帖） |

三块**同屏、一页到底**：

* 不再有标签页（原来的「我的资料 / 公开主页 / 我的帖子」三个 tab 已去掉）；
* 也不再单独渲染「公开主页预览」——它的内容就是「身份头 + 简历 + 帖子」，
  在同一页里已经有这三块，再渲染一遍等于把简历和帖子抄第二遍；
* 想看真实访客视角，用身份头右侧的「在新页面打开」（`/u/{accountId}`，访问自己的 id 会回到 `/me`）；
* 账号操作（切换身份 / 退出登录）与深色模式都在顶栏账户菜单里，页面主体只放内容；
* 左侧那块「账号卡片」（昵称 / 邮箱 / 账号 # / 注册时间 / 帖子数 + 两个按钮）按需求整体删除，
  组件文件 `ProfileSidebar.tsx` 也一并删掉。

科目多选的 chip UI 抽成 `components/common/SubjectPicker.tsx`，
简历表单与「发布需求」共用同一份，不再两处手写、样式各自漂移。

独立页面 `/u/:accountId` 现在只做重定向：访问自己的 id 回 `/me`，别人点进来仍是只读主页
（`PublicProfileView` 与「我的」页共用同一套展示组件）。

### 12.2 首屏：路由级分包 + 用生产构建伺服

两件事叠在一起才有这个数字：

**（1）路由级代码分割。** `router/index.tsx` 里只静态引入「打开站点第一眼就要用」的东西
（`CustomerLayout` 外壳、根路径 `Landing`、登录/注册页），其余 **17 个页面全部 `React.lazy`**。
`vite.config.ts` 的手动分包里**删掉了 `charts: ['recharts']`** —— 手动指定会让 recharts 变成
入口的静态依赖，`index.html` 里就多一条 `modulepreload`，等于每个手机访客都要先下 400KB
用不上的图表库。现在它跟着 lazy 的「数据概览」走，只有后台点进那一页才下载。

**（2）默认用 `vite preview` 伺服 `dist`。** `vite dev` 是「一个模块一个请求」，服务器又在国内
公网、dev 模式不压缩，首屏实测 **94 个请求 / 4.63MB**。

**（3）动画库整个从客户侧拿掉。** framer-motion 原本被底栏气泡、首页入场、Toast、Switch、
StatCard、卡片列表一起拽进首屏（126KB / 42KB gzip）。这轮把上述动效全部改成 CSS 过渡与
`@keyframes`（`rare-toast-in` / `rare-rise`），并删掉 6 个纯装饰组件，最后把 `framer-motion`
从 `package.json` 里移除 —— 全站不再加载它，`dist` 里也已经没有这个 chunk。

| 指标 | 优化前（dev 伺服） | 上一轮 | 现在 |
|---|---|---|---|
| 首屏请求数 | **94** | 5 | **4** |
| 首屏实测传输 | **4.63 MB** | 198 KB | **148 KB** |
| 首屏 JS+CSS（压缩前） | 1181 KB | 615 KB | **462 KB** |
| 首屏 JS+CSS（gzip） | ≈359 KB | ≈197 KB | **≈147 KB** |
| recharts（400KB） | 首屏 `modulepreload` | 后台按需 | 后台按需 |
| framer-motion（126KB） | 首屏 | 首屏 | **不再加载** |

> 数字是怎么来的：`tools/verify-mobile-nav.py` 用真实 Chrome（390×844、关缓存）打开游客首页，
> 读 `performance.getEntriesByType('resource')` 的请求数与 `transferSize` 合计。
> `domInteractive` 本机都是 20ms 上下（走回环看不出差别），真实价值在公网那一侧。

体验上的配套改动：

* **切页面不再整屏闪**：三个 layout 的 `<Outlet />` 各自包了 `<Suspense>`，等 chunk 时只让
  内容区转圈，顶栏/侧边栏/底栏保持不动（顶层的 Suspense 只做兜底）。
* **按意图预取**：`src/router/prefetch.ts` 在 `pointerenter / focus / touchstart` 时预取目标页
  chunk，手指按下就开始下载，真正点击时几乎瞬间；只在有意图时触发，不影响首屏请求数。
* **首屏占位换成骨架**：`index.html` 里内联了一小段 CSS（转圈 + 主题色背景，深色模式不白闪），
  `prefers-reduced-motion` 下不动画；React 一挂载就删掉这个节点。
* `meta` 补齐：`theme-color` 分深浅两套、`format-detection` 关掉 iPhone 把邮箱/数字染成蓝链。

### 12.3 页脚（总览 / 备案那一栏）

平台统计原来压在老师首页最下面（要滚过一整屏需求列表才看得到），现在挪到页脚
（`src/components/layouts/CustomerFooter.tsx`）：

| 位置 | 内容 |
|---|---|
| 页脚上半（登录后才显示） | 需求总数 / 待接单 / 平均预算 / 热门科目 Top3，数据来自 `GET /customer/demands/stats` |
| 页脚下半 | `© 2026 家教中介平台` + 「公开家教浏览」入口 + **ICP 备案号留位** |

几个实现细节：

* 页脚在**布局层**，一次进站只请求一次统计，切换页面不会重复拉；接口失败就整块不显示，不打扰用户；
* 游客没有 token，不请求也不占位（`/demands/stats` 对游客只会 401）；
* 备案号留在 `src/lib/constants.ts` 的 `ICP_BEIAN`（默认空字符串，填了就自动出现在页脚）；
* 老师首页的「统计信息」整块删掉（含 `loadStats` / `StatCard`），页面正文只剩「筛选 + 需求列表」。

### 12.4 视觉语言与代码清理

目标是「看起来像已经在运营的 SaaS」，不是「组件库演示页」。这一轮定的规矩：

| 项 | 做法 |
|---|---|
| 装饰 | 删除漂浮光斑（`fluid-orb` / `OrbField`）、弹跳侧栏（`bounce-sidebar`）、滚动进度条（`scroll-progress`）、数字滚动（`animated-counter`）、通知铃（`notification-bell`）、任务清单（`task-list`）共 6 个组件 |
| 动效 | 只保留 CSS 过渡（hover / focus / 状态切换）；入场用 `.rare-rise` + `animationDelay`；`prefers-reduced-motion` 下全部关闭 |
| 底栏 | 气泡 + 模糊光晕 → 一条 2px 滑动指示条 + 主色图标/文字（仍是同一个组件，仍按身份给不同入口） |
| 配色 | 只用设计 token，不用渐变 / 光斑 / 自造颜色；卡片 `rounded-xl`，按钮输入 `rounded-lg` |
| 阴影 | 静态卡片 `shadow-hairline`、浮层 `shadow-soft`；去掉 `shadow-lifted` + `backdrop-blur` 那种「玻璃卡片」 |
| 排版 | 页头 `PageHeader`（标题 + 一句话说明 + 右侧操作）；区块 `text-sm font-semibold`；元信息 `text-2xs`；数字 `tabular` |
| 列表 | 桌面端表格（行 hover、`px-4 py-3`、首列是「需求/老师」本体），移动端退化卡片；空态 `Empty` + 明确按钮，错误 `ErrorState` + 重试 |
| 登录/注册 | 去玻璃拟态、去光斑，改成实心卡片 + 左侧品牌区 |

顺带清掉的重复代码：`pages/customer/shared.tsx` 拆成 `labels.ts`（纯字典/工具，外壳只用它）
与 `shared.tsx`（页面组件），避免外壳为了一个 `ROLE_LABEL` 把卡片组件一起拉进首屏。

### 12.5 验证

`tools/verify-mobile-nav.py`（69 项，真实 Chrome + 手机视口 390×844）：

| 分组 | 覆盖 |
|---|---|
| 游客 | 底栏三项、激活唯一、只有一条底栏、贴底、无横向溢出、滚到底页脚不被遮挡 |
| 学生 | 底栏四项（首页 / 发布需求 / 广场 / 我的，无「我的需求」也没有「找家教」）、`/` 落到 `/demands/mine`、点「发布需求」进 `/demands/new` 且激活项唯一 |
| 老师 | 底栏三项（首页 / 广场 / 我的）、访问 `/tutors` 与 `/tutors/:id` 都被送回 `/demands`、页脚不显示「全部家教」、`/demands` 上激活「首页」、从「我的」点「首页」回 `/demands` |
| 广场 | 学生与老师各自打开 `/plaza` 都不被守卫弹走、激活项是「广场」、列表标题在、只有一条底栏 |
| 页脚 | 游客页脚无统计；登录后页脚有「平台总览 / 需求总数 / 待接单 / 平均预算」且是会变的数字；`/me` 上同样有；首页正文不再出现「统计信息」 |
| 未选身份 | `/` 落到 `/choose-role`、底栏是「首页 / 选身份 / 广场 / 我的」 |
| 找家教 | `/tutors` 上激活「找家教」、只有一条底栏、渲染出老师列表 |
| 旧地址 | `/h5 → /`、`/h5/tutor → /tutors`（保留 query）、`/h5/my → /login`，都不 404 |
| 桌面 1440 | 客户侧底栏隐藏、顶栏导航在；`/tutors` 与其它页共用同一套外壳 |
| 其它 | 全程 0 条 JS 异常；首屏请求数/传输字节 INFO |

跑法见第一节；它自带账号（接口现注册 + 注入 `tutor_customer_token`），跑完直接清库。

---

### 11.6 找回密码（2026-10-19 新增）

忘记密码不用再找管理员改库了，用户自己在站点上重置：

| 步骤 | 接口 | 说明 |
|---|---|---|
| ① 发重置码 | `POST /customer/auth/send-reset-code` `{email}` | 账号不存在**也返回成功**（防枚举）；不存在时不发信 |
| ② 重置密码 | `POST /customer/auth/reset-password` `{email, code, password}` | 校验重置码 → 更新密码哈希 → **踢掉该账号全部旧会话** |

页面：`/login` → 「忘记密码？」 → `/forgot-password`（邮箱 + 验证码 + 新密码 + 确认密码）。

三个安全设计：

* **验证码按用途隔离**：注册码在 `customer:emailcode:reg:*`，重置码在 `customer:emailcode:reset:*`，
  注册码不能拿来改密码（实测返回「验证码不正确」）；
* **防邮箱枚举**：未注册邮箱的 `send-reset-code` 也返回 200 且不带 devCode；
* **改密即下线**：`resetPassword` 成功后扫描 `customer_tokens:*`，把该账号的会话全删，
  攻击者手里的旧 token 立刻失效（实测旧 token 返回 401）。

### 11.7 按 IP 限流（2026-10-19 新增）

按邮箱限流挡不住「换着邮箱刷验证码」和暴力破解登录，所以补了一层 IP 维度
（`CustomerRateLimiter`，Redis `INCR` 计数）：

| 接口 | 维度 | 默认阈值 | 配置项 |
|---|---|---|---|
| `send-code` | IP | 15 次/分钟、100 次/小时 | `customer.ratelimit.send-code-per-minute` / `-per-hour` |
| `send-reset-code` | IP | 同上 | 同上 |
| `register` | IP | 20 次/小时 | `customer.ratelimit.register-per-hour` |
| `login` | IP + 邮箱 | 20 次/10 分钟 | `customer.ratelimit.login-per-10min` |
| `reset-password` | IP + 邮箱 | 10 次/10 分钟（防猜 6 位码） | 代码内置 |

超限返回 `{"code":429,"msg":"操作过于频繁，请 N 分钟后再试"}`，前端 toast 直接展示。

两个实现要点：

* **必须让后端看到真实 IP**：`vite.config.ts` 的代理加了 `xfwd: true`，否则后端只看到 127.0.0.1，
  会把所有用户算成同一个 IP；
* **X-Forwarded-For 只在「直连方是回环」时才采信**（`CustomerRateLimiter.clientIp`）——
  后端 12501 目前还对公网开放，若无条件信任 XFF，攻击者伪造一个头就能绕过限流。

全局开关：`CUSTOMER_RATELIMIT_ENABLED=false`（压测/调试时用）。
