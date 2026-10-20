# 客户侧接口契约（邮箱账号 + 需求单）

> 这份契约是前后端共同遵守的约定。后端实现见 `tutor-admin/src/main/java/com/tutor/web/controller/customer/`，
> 前端实现见 `tutor-web/src/api/customer.ts` 与 `tutor-web/src/pages/customer/`。

## 0. 背景与边界

- 目标用户是**客户**（老师 / 学生），与原来的管理后台（若依 `sys_user`）**完全隔离**。
  客户账号存在 `t_customer_account`，**不在 `sys_user` 里**，因此客户 token 永远进不了
  `/system/**` 等管理接口。
- 用**邮箱 + 密码**注册登录（没有企业资质、用不了短信，所以不走手机号）。
- 注册**必须先通过邮箱验证码验证**，证明邮箱是本人可收信的：
  后端把验证码存 Redis（`customer:emailcode:*`）并带限流/防爆破，校验通过才允许写库。
- 注册时**不选角色**；注册成功后进入「选择身份」页，选老师或学生。

## 1. 通用约定

- 所有路径以 **`/customer`** 开头，前端通过 Vite 代理带着 `/dev-api` 前缀访问，
  例如前端请求 `/dev-api/customer/auth/login` → 后端 `/customer/auth/login`。
- 响应体沿用若依 `AjaxResult` 形态：`{"code":200,"msg":"操作成功","data":{...}}`；
  分页列表用 `{"code":200,"msg":"查询成功","total":13,"rows":[...]}`。
- 认证：请求头 `Authorization: Bearer <customerToken>`。
  失败时返回 **HTTP 401** + `{"code":401,"msg":"未登录或登录已过期"}`。
- 业务错误返回 **HTTP 200** + `{"code":400,"msg":"邮箱已被注册"}`（前端按 `code` 判断）。
- 时间格式：`yyyy-MM-dd HH:mm:ss`。

## 2. 数据结构

### Account
```json
{
  "accountId": 1,
  "email": "teacher@example.com",
  "nickname": "王老师",
  "role": "TEACHER",          // "TEACHER" | "STUDENT" | null（未选择）
  "createTime": "2026-10-15 18:00:00"
}
```

### Demand（需求单）
```json
{
  "demandId": 1001,
  "studentId": 7,
  "studentName": "李同学",     // 老师视角可见；学生视角就是自己
  "title": "初二数学物理补习",
  "subjects": "数学,物理",     // 逗号分隔字符串（存库形态）
  "subjectList": ["数学","物理"],
  "grade": "初二",
  "budgetMin": 150.00,
  "budgetMax": 250.00,
  "budgetUnit": "hour",       // "hour" | "lesson" | "month"
  "classMode": "offline",     // "online" | "offline" | "both"
  "city": "北京",
  "description": "孩子基础一般，希望每周两次，每次两小时",
  "status": "0",              // "0"待接单 "1"已接单 "2"已完成 "3"已取消
  "statusText": "待接单",
  "createTime": "2026-10-15 18:00:00",
  "updateTime": "2026-10-15 18:00:00"
}
```

## 3. 接口清单

### 3.1 账号

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/customer/auth/send-code` | 否 | 发送邮箱验证码（注册前置） |
| POST | `/customer/auth/register` | 否 | 邮箱注册（**必须带验证码**） |
| POST | `/customer/auth/login` | 否 | 邮箱登录 |
| GET | `/customer/auth/me` | 是 | 当前账号 |
| POST | `/customer/auth/logout` | 是 | 退出（删 Redis 会话） |
| PUT | `/customer/auth/role` | 是 | 选择/切换身份 |

注册是**两步**：先给邮箱发验证码，再带着验证码注册。

```http
POST /customer/auth/send-code
{ "email": "a@b.com" }
→ 200 { "code":200, "msg":"验证码已发送", "data": {
      "sent": true, "expiresIn": 300, "resendAfter": 60,
      "transport": "SMTP(...)" 或 "开发模式（验证码写日志，未真正发信）",
      "devCode": "123456",        // ⚠️ 仅开发模式（未配 SMTP）才返回
      "devNotice": "当前未配置 SMTP…"
  } }
→ 200 { "code":400, "msg":"邮箱格式不正确" }
→ 200 { "code":400, "msg":"验证码已发送，请 60 秒后再试" }   // 限流
→ 200 { "code":400, "msg":"该邮箱发送次数过多，请稍后再试" } // 每小时 10 次
```

```http
POST /customer/auth/register
{ "email": "a@b.com", "password": "secret123", "code": "123456", "nickname": "小王" }
→ 200 { "code":200, "msg":"注册成功", "data": { "token": "...", "account": { ...Account } } }
→ 200 { "code":400, "msg":"请填写邮箱验证码" }
→ 200 { "code":400, "msg":"验证码不正确" }
→ 200 { "code":400, "msg":"验证码已过期，请重新获取" }
→ 200 { "code":400, "msg":"该邮箱已被注册" }
→ 200 { "code":400, "msg":"邮箱格式不正确" }
→ 200 { "code":400, "msg":"密码长度需在 6-32 位之间" }
```

验证码规则：6 位数字、**5 分钟**有效、**一次性使用**、同一验证码最多允许错 5 次
（超过即作废）、同一邮箱 60 秒内只能发一次、每小时最多 10 次。

注册成功后 `account.role` 为 `null`，前端据此跳 `/choose-role`。

```http
POST /customer/auth/login
{ "email": "a@b.com", "password": "secret123" }
→ 200 { "code":200, "msg":"登录成功", "data": { "token": "...", "account": {...} } }
→ 200 { "code":400, "msg":"邮箱或密码错误" }
```

```http
PUT /customer/auth/role
{ "role": "TEACHER" }
→ 200 { "code":200, "msg":"身份已设置", "data": { ...Account } }
→ 200 { "code":400, "msg":"身份只能是 TEACHER 或 STUDENT" }
```

### 3.2 科目字典
```http
GET /customer/subjects
→ 200 { "code":200, "data": ["语文","数学","英语","物理","化学","生物","历史","地理","政治","科学","信息技术","奥数","陪读"] }
```

### 3.3 需求单

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/customer/demands` | 老师/学生 | 老师=全部待接需求；学生=自己的需求 |
| GET | `/customer/demands/{id}` | 是 | 详情 |
| POST | `/customer/demands` | 学生 | 发布需求 |
| PUT | `/customer/demands/{id}` | 学生(本人) | 修改 |
| DELETE | `/customer/demands/{id}` | 学生(本人) | 删除 |
| PUT | `/customer/demands/{id}/status` | 学生(本人) | 改状态 `{"status":"3"}` |
| GET | `/customer/demands/stats` | 老师 | 首页统计 |
| POST | `/customer/demands/{id}/apply` | 老师 | **申请联系**学生，可带 `{"message":"..."}`；同一条需求只能申请一次 |
| GET | `/customer/demands/applied` | 老师 | 我申请过的需求 ID 数组（前端把按钮显示成「已申请」） |
| GET | `/customer/demands/applications` | 学生 | 我发布的需求收到的老师申请（`DemandApply[]`） |

```http
GET /customer/demands?subject=数学&grade=初二&keyword=物理&pageNum=1&pageSize=10
→ 200 { "code":200, "total": 12, "rows": [ ...Demand ] }
```
- 老师视角：只返回 `status != '3'`（未取消）的需求，按 `create_time` 倒序。
- 学生视角：返回自己全部状态的需求；忽略 `subject/grade/keyword` 之外的他人数据（**只能看到自己的**）。

```http
POST /customer/demands
{
  "title": "初二数学物理补习",
  "subjectList": ["数学","物理"],
  "grade": "初二",
  "budgetMin": 150,
  "budgetMax": 250,
  "budgetUnit": "hour",
  "classMode": "offline",
  "city": "北京",
  "description": "孩子基础一般，希望每周两次"
}
→ 200 { "code":200, "msg":"需求已发布", "data": { ...Demand } }
→ 200 { "code":400, "msg":"请至少选择一个科目" }
→ 200 { "code":400, "msg":"预算上限不能小于下限" }
→ 403 { "code":403, "msg":"只有学生身份可以发布需求" }
```

```http
POST /customer/demands/122/apply
{ "message": "带过三年初二数学，可以先免费试讲一次" }
→ 200 { "code":200, "msg":"已提交申请，学生会在「我的」里看到你", "data": { ...DemandApply } }
→ 200 { "code":400, "msg":"你已经申请过这条需求了" }   // 并发重复提交由唯一键兜底，同样是这句
→ 200 { "code":400, "msg":"该需求已取消，无法申请" }
→ 403 { "code":403, "msg":"只有老师身份可以申请联系学生" }
→ 404 { "code":404, "msg":"需求不存在" }
```

```http
GET /customer/demands/applications        # 学生视角
→ 200 { "code":200, "data": [
    { "applyId":1, "demandId":122, "teacherId":415, "status":"0",
      "message":"带过三年初二数学…", "teacherName":"茶老师", "teacherRole":"TEACHER",
      "demandTitle":"初二数学一对一", "demandSubjects":"数学", "demandGrade":"初二",
      "createTime":"2026-10-20 15:10:13" }
] }
```

```http
GET /customer/demands/stats
→ 200 { "code":200, "data": {
    "total": 12, "open": 9,
    "avgBudget": 180.5,
    "bySubject": [ {"name":"数学","count":5}, {"name":"英语","count":4} ]
} }
```

## 4. 前端路由约定（根目录 = 客户界面）

| 路径 | 页面 | 说明 |
|---|---|---|
| `/` | 客户首页（Landing） | **根目录给客户**，不再跳管理后台 |
| `/login` | 客户登录 | |
| `/register` | 客户注册 | |
| `/choose-role` | 选择身份（老师/学生） | 已登录但 `role == null` 时强制进这里 |
| `/demands` | 老师首页：**列出所有有需求的学生**（顶部只有关键词搜索） | 需要 role=TEACHER |
| `/demands/mine` | 学生首页：我的需求列表 | 需要 role=STUDENT |
| `/demands/new`、`/demands/:id/edit` | 发布 / 编辑需求（科目 + 预算） | 需要 role=STUDENT |
| `/plaza` | 广场：审核通过的帖子 | 需登录 |
| `/me` | 我的（单页：老师=简历+帖子，学生=老师申请+帖子） | 需登录 |
| `/tutors`、`/tutors/:id` | 公开家教浏览 | **仅游客** |
| `/admin/**` | 管理后台 | 管理员 |

> 老地址（`/teacher`、`/student`、`/student/new`、`/h5/**`）都保留重定向，不会 404。

登录态存 `localStorage` 的**独立 key**（不要和后台的 token 混用），
前端 `src/api/customer.ts` 里自带一套独立的 axios 实例与拦截器。

---

# 个人主页（老师简历 + 帖子）

> 「我的」页面升级成**个人社交主页**：老师可以在这里放个人简历，所有客户都可以发帖子。
> 主页有一个只读版本（`/public/{accountId}`），别人能看；自己看自己的用 `/profile/me`。
> 帖子**先审后发**：新帖是待审核，后台通过后才进广场与公开主页。

## 数据结构

### TeacherProfile（老师简历，与账号 1:1）
```json
{
  "accountId": 3,
  "realName": "王小明",
  "gender": "1",                 // "0"未知 "1"男 "2"女
  "age": 26,
  "city": "北京",
  "education": "本科",           // 专科/本科/硕士/博士/在读
  "school": "北京师范大学",
  "major": "数学与应用数学",
  "subjects": "数学,物理",        // 存库形态
  "subjectList": ["数学", "物理"],
  "grades": "初一,初二,初三",
  "hourlyRate": 200.00,
  "experienceYears": 3,
  "availableTime": "周末全天",
  "intro": "带过 3 届毕业班，擅长把抽象概念讲成生活里的例子。",
  "certificates": "高级中学教师资格证",
  "contact": "微信 wanglaoshi",
  "createTime": "2026-10-16 12:00:00",
  "updateTime": "2026-10-16 12:00:00"
}
```

### UserPost（帖子）
```json
{
  "postId": 12,
  "accountId": 3,
  "content": "今天带了一节初三数学，把二次函数讲成了投篮轨迹，孩子一下就懂了。",
  "images": "https://a/1.jpg,https://a/2.jpg",
  "imageList": ["https://a/1.jpg", "https://a/2.jpg"],
  "authorName": "王老师",
  "authorRole": "TEACHER",
  "auditStatus": "1",            // "0"待审核 "1"通过 "2"未通过
  "auditRemark": null,           // 拒绝理由（"2" 时才有）
  "auditTime": "2026-10-20 15:10:14",
  "createTime": "2026-10-16 12:00:00"
}
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/customer/profile/me` | 我的主页数据（含邮箱，只有自己能拿） |
| PUT | `/customer/profile` | 保存我的简历（**只有老师身份**可写） |
| GET | `/customer/profile/{accountId}` | 别人的主页（**不含邮箱**） |
| GET | `/customer/profile/{accountId}/posts` | 某人发的帖子（分页） |
| GET | `/customer/posts/mine` | 我发的帖子（分页） |
| POST | `/customer/posts` | 发帖子 |
| DELETE | `/customer/posts/{postId}` | 删自己的帖子 |

```http
GET /customer/profile/me
→ 200 { "code":200, "data": {
    "account": { "accountId":3, "email":"a@b.com", "nickname":"王老师", "role":"TEACHER", "createTime":"..." },
    "profile": { ...TeacherProfile } | null,
    "postCount": 5
} }
```

```http
PUT /customer/profile
{ "realName":"王小明", "gender":"1", "age":26, "city":"北京",
  "education":"本科", "school":"北京师范大学", "major":"数学与应用数学",
  "subjectList":["数学","物理"], "grades":"初一,初二,初三",
  "hourlyRate":200, "experienceYears":3, "availableTime":"周末全天",
  "intro":"...", "certificates":"...", "contact":"..." }
→ 200 { "code":200, "msg":"简历已保存", "data": { ...TeacherProfile } }
→ 200 { "code":400, "msg":"只有老师身份可以填写简历" }
→ 200 { "code":400, "msg":"请填写真实姓名" }
```

```http
GET /customer/profile/12
→ 200 { "code":200, "data": {
    "account": { "accountId":12, "nickname":"李老师", "role":"TEACHER", "createTime":"..." },
    "profile": { ... } | null,
    "postCount": 2
} }
→ 200 { "code":400, "msg":"账号不存在" }
```
> 注意：读别人的主页**不返回邮箱**，避免泄露联系方式。

```http
GET /customer/profile/12/posts?pageNum=1&pageSize=10
GET /customer/posts/mine?pageNum=1&pageSize=10
→ 200 { "code":200, "total":5, "rows":[ ...UserPost ] }
```

```http
POST /customer/posts
{ "content":"今天带了一节初三数学…", "imageList":["https://a/1.jpg"] }
→ 200 { "code":200, "msg":"已发布", "data": { ...UserPost } }
→ 200 { "code":400, "msg":"说点什么再发布吧" }
→ 200 { "code":400, "msg":"内容不能超过 1000 字" }
```

```http
DELETE /customer/posts/12
→ 200 { "code":200, "msg":"已删除" }
→ 200 { "code":404, "msg":"帖子不存在或不属于你" }
```

## 前端路由与页面要求

| 路径 | 页面 | 说明 |
|---|---|---|
| `/me` | 我的主页（**单页，不再有标签页**） | 身份头 + 老师简历 / 学生「老师申请」 + 我的帖子 |
| `/public/:accountId` | 别人的公开主页 | 昵称 / 身份 / 简历 / 帖子（分页），只读 |
| `/plaza` | 广场 | 所有 `audit_status='1'` 的帖子 |
| `/h5/my` | 旧地址 | 重定向到 `/me` |
| `/u/:accountId` | 旧地址 | 重定向到 `/me` |

页面要求：

1. **`/me` 是单页**（没有标签页、没有左侧账号卡）：身份头（头像 / 昵称 / 身份徽章 / 注册时间 / 帖子数 /
   「我的主页」内联操作）→ 第 2 块（按身份变）→ 我的帖子。账户动作（选身份 / 退出登录）在顶栏头像菜单里。
2. **老师第 2 块 = 个人简历**：
   - 未填写时给引导态 + 「填写简历」按钮；已填写时只读展示（基本信息 / 教学信息 / 自我介绍），右上角「编辑」；
   - 编辑用 `ResumeEditor`：姓名、性别、年龄、城市、学历、学校、专业、可授科目（`SubjectPicker` 复用 `listSubjects`）、可授年级、期望时薪、教龄、可授课时间、自我介绍、证书荣誉、联系方式；保存调 `PUT /customer/profile`。
3. **学生第 2 块 = 老师申请**（`GET /customer/demands/applications`）：每条申请显示老师昵称、申请的需求标题、留言、状态，
   可点进老师主页；空态引导「去发布需求」。
4. **第 3 块 = 我的帖子（所有人）**：发布框（多行文本 + 字数计数 + 发布按钮）+ 列表（时间倒序、可删除），
   每条带审核状态徽章（待审核 / 已通过 / 未通过，被拒的显示拒绝理由）；发帖成功后提示「已提交审核」。
5. **公开主页 `/public/:accountId`**：只读，昵称/身份/注册时间 + 简历（如果有）+ 该人**审核通过**的帖子（分页）。
6. 文案全部中文；风格与现有客户区一致（Tailwind + `@/components/ui`）；移动端可用。
7. 类型必须干净：改完跑 `pnpm exec tsc -b --force`，0 错误。

## 帖子审核与广场

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/customer/posts/plaza?pageNum=1&pageSize=10` | 已登录 | 广场：仅 `audit_status='1'` |
| GET | `/system/userPost/list?auditStatus=0\|1\|2` | 管理员 | 后台帖子列表（不传=全部） |
| GET | `/system/userPost/pendingCount` | 管理员 | 待审核条数（侧栏角标） |
| PUT | `/system/userPost/audit` | 管理员 | `{"postId":123,"auditStatus":"1"\|"2","auditRemark":"拒绝理由"}` |

```http
POST /customer/posts
{ "content": "今天把二次函数讲成了投篮轨迹" }
→ 200 { "code":200, "msg":"已提交，审核通过后会展示在广场上", "data": { "postId":73, "auditStatus":"0", ... } }
```

* 新帖一律 `audit_status='0'`（待审核）：**不进广场、不进别人看到的主页、不计入 `postCount`**；
* 作者自己的 `/customer/posts/mine` 返回全部状态，前端据此显示徽章与拒绝理由；
* 审核只接受 `'1'` / `'2'`，其它值 400；`postId` 不存在 404。
