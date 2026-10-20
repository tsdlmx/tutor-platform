# 家教平台 Web 前端开发规范

> 本文档为 DeepSeek 4.1 Flash（或其他 LLM）提供上下文，帮助理解项目结构和最佳实践。

---

## 📚 目录

1. [项目概况](#1-项目概况)
2. [技术栈](#2-技术栈)
3. [架构决策](#3-架构决策)
4. [代码规范](#4-代码规范)
5. [常见任务](#5-常见任务)
6. [性能优化](#6-性能优化)
7. [类型安全](#7-类型安全)
8. [测试与验证](#8-测试与验证)
9. [已知问题与禁区](#9-已知问题与禁区)

---

## 1. 项目概况

### 1.1 仓库结构

```
tutor-platform/tutor/tutor-web/
├── src/
│   ├── api/              # API 层（按后端模块分文件）
│   ├── components/       # 组件库
│   │   ├── common/       # 业务组件（DataTable, PageHeader, ErrorState...）
│   │   ├── layouts/      # 布局组件（AdminLayout, CustomerLayout）
│   │   └── ui/           # shadcn/ui 组件（不要手改）
│   ├── hooks/            # 自定义 Hooks
│   ├── lib/              # 工具库（constants, utils, stores）
│   ├── pages/            # 页面组件（按角色分目录）
│   │   ├── admin/        # 后台管理（路由前缀 /admin）
│   │   ├── customer/     # 客户端（老师/学生，路由前缀 / 或 /demands）
│   │   └── tutors/       # **已废弃**：旧家教系统（见下文）
│   ├── router/           # React Router 配置
│   ├── styles/           # 全局样式
│   └── types/            # TypeScript 类型定义
├── public/               # 静态资源
└── dist/                 # 构建产物（Vite）
```

### 1.2 用户角色

| 角色 | 描述 | 登录方式 | 路由前缀 |
|------|------|----------|----------|
| **管理员** | 后台管理人员 | 用户名 + 密码 + 验证码 | `/admin` |
| **客户** | 前台用户（老师或学生） | 邮箱 + 密码 | `/` `/demands` `/me` |

客户注册后需要选择身份（`role: 'TEACHER' | 'STUDENT'`），同一账号可切换身份。

---

## 2. 技术栈

| 类别 | 技术 | 版本 | 备注 |
|------|------|------|------|
| 框架 | React | 18.3+ | Hooks only，无 class 组件 |
| 路由 | React Router | 6.x | Lazy + Suspense |
| 状态管理 | Zustand | 4.x | 轻量，见 `lib/stores/` |
| UI 组件 | shadcn/ui | 最新 | 基于 Radix UI + Tailwind |
| 样式 | Tailwind CSS | 3.x | 禁止内联 `<style>`，优先用 class |
| 图表 | Recharts | 2.x | 仅后台 Dashboard 使用 |
| HTTP | Axios | 1.x | 双实例（admin / customer） |
| 类型 | TypeScript | 5.x | 严格模式（strict: true） |
| 构建 | Vite | 5.x | 快速开发 + 生产构建 |

---

## 3. 架构决策

### 3.1 **关键决策：统一老师实体**

**背景：** 历史遗留两套老师系统：

| 系统 | 数据源 | API | 用途 |
|------|--------|-----|------|
| ❌ **旧家教系统** | `t_tutor_info` | `/miniapp/tutor/*` | 小程序历史数据，已废弃 |
| ✅ **客户账号系统** | `t_customer_account` (role=TEACHER) | `/customer/profile` | 唯一有效实体 |

**决策（2025-01-17）：**

1. **唯一事实源**：`t_customer_account` (role=TEACHER) + 简历 = 老师
2. **废弃路径**：
   - ❌ `/tutors` (前台家教列表) → 重定向到 `/demands`（需求池）
   - ❌ `/tutors/:id` (家教详情) → 404
   - ❌ `/admin/tutor` (后台家教管理) → 重定向到 `/admin/teacher`
   - ❌ `api/miniapp.ts` (listPublicTutors) → 废弃
   - ❌ `src/pages/tutors/*` (3 个页面) → 删除
3. **保留路径**：
   - ✅ `/me` (个人中心) → 老师填写简历
   - ✅ `/admin/teacher` (后台老师管理) → 审核、启停用
   - ✅ `api/customer.ts` (getProfile, updateProfile) → 唯一读写接口

**后续开发规则：**

- ✅ **只用** `CustomerAccount` + `TeacherProfile` 类型
- ❌ **不要用** `TutorInfo` 类型（仅保留类型定义做兼容）
- ❌ **不要调** `api/miniapp.ts` 的家教接口
- ❌ **不要链接** `/tutors` 相关路由

### 3.2 API 双实例隔离

```typescript
// ❌ 错误：混用 token
import { request } from '@/api/request'; // 这是 admin 专用实例
customerApi.getProfile(); // 会带 admin token，后端拒绝

// ✅ 正确：使用对应实例
import * as customerApi from '@/api/customer'; // 客户端专用实例
customerApi.getProfile(); // 自动带 customer token
```

| 实例 | 文件 | Token 存储 | 用途 |
|------|------|-----------|------|
| `request` | `api/request.ts` | `localStorage['admin-token']` | 后台管理 |
| `customerRequest` | `api/customer.ts` | `localStorage['customer-token']` | 客户端 |

### 3.3 懒加载策略

**所有页面级组件都用 React.lazy + Suspense**（已实现，覆盖率 92.3%）：

```typescript
// ✅ 正确
const TeacherHome = lazy(() => import('./pages/customer/TeacherHome'));

// ❌ 错误
import TeacherHome from './pages/customer/TeacherHome';
```

唯一例外：`Landing.tsx`（首屏）、`CustomerLayout`（Layout 不该 lazy）。

---

## 4. 代码规范

### 4.1 React 组件

```typescript
// ✅ 推荐：函数组件 + TypeScript
interface Props {
  userId: number;
  onSuccess?: () => void;
}

export function UserCard({ userId, onSuccess }: Props) {
  // Hooks 在顶层
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  // 事件处理器用 useCallback（如果传给子组件且子组件有 memo）
  const handleClick = useCallback(() => {
    onSuccess?.();
  }, [onSuccess]);
  
  return <div>...</div>;
}

// ❌ 避免：class 组件、内联箭头（当子组件 memo 时）
```

### 4.2 性能优化模式

#### ✅ 何时用 `memo`

```typescript
// ✅ 正确：列表项（渲染成本高 + 引用稳定）
export const TutorCard = memo(({ tutor, to }: Props) => {
  return <Card>...</Card>;
});

// ✅ 正确：通用表格（避免父组件状态变化触发重排）
export const DataTable = memo(DataTableImpl) as typeof DataTableImpl;

// ❌ 不需要：子组件没 memo，父组件包 useCallback 是噪音
function Parent() {
  const handleClick = () => {}; // 内联箭头 OK
  return <Child onClick={handleClick} />;
}
```

#### ✅ 何时用 `useMemo` / `useCallback`

```typescript
// ✅ 正确：配置对象传给 memo 组件
const columns = useMemo(() => [
  { key: 'name', header: '姓名' },
  // ...
], [dependencies]);

// ✅ 正确：事件处理器传给 memo 组件
const handleSubmit = useCallback((data) => {
  api.save(data);
}, [api]);

// ❌ 过度优化：简单计算 + 子组件没 memo
const fullName = useMemo(() => `${first} ${last}`, [first, last]); // 没必要
```

### 4.3 表单处理

```typescript
// ✅ 推荐：受控组件 + 本地状态
function DemandForm() {
  const [form, setForm] = useState({ title: '', subject: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // 改动后立即清除该字段错误
    setErrors(prev => ({ ...prev, [field]: '' }));
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const newErrors = validate(form);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    await api.createDemand(form);
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### 4.4 Tailwind 设计令牌

```css
/* ✅ 使用设计令牌（CSS 变量） */
.custom-card {
  @apply bg-card text-card-foreground border-border;
}

/* ❌ 硬编码颜色 */
.bad-card {
  background: #ffffff;  /* 不要这样 */
  color: rgb(15, 23, 42);  /* 不要这样 */
}
```

**标准色板**（`src/styles/globals.css`）：

| 令牌 | 用途 |
|------|------|
| `--background` | 页面背景 |
| `--foreground` | 主要文本 |
| `--card` | 卡片背景 |
| `--primary` | 主色调（按钮、链接） |
| `--muted` | 次要背景/文本 |
| `--destructive` | 危险操作 |

### 4.5 移动端触控标准

**所有可点击元素最小 44×44px（iOS 规范）**：

```tsx
// ✅ 正确
<Button className="min-h-[44px] min-w-[44px]">操作</Button>

// ❌ 错误（32px 太小）
<Button size="sm">操作</Button>
```

---

## 5. 常见任务

### 5.1 添加新页面

1. **创建组件**（`src/pages/customer/NewPage.tsx`）：

```typescript
export function NewPage() {
  return (
    <div className="container mx-auto p-4">
      <PageHeader title="新页面" description="描述" />
      {/* 内容 */}
    </div>
  );
}
```

2. **添加路由**（`src/router/index.tsx`）：

```typescript
const NewPage = lazy(() => import('@/pages/customer/NewPage'));

// 在 customerRoutes 中添加
{
  path: '/new-page',
  element: <NewPage />,
}
```

3. **添加导航**（如需要）：
   - 桌面端：`components/layouts/CustomerLayout.tsx` (顶栏)
   - 移动端：`components/layouts/CustomerLayout.tsx` (底栏 `NAV_ITEMS`)

### 5.2 调用 API

```typescript
import * as customerApi from '@/api/customer';

async function loadData() {
  try {
    const data = await customerApi.listDemands({ pageNum: 1, pageSize: 10 });
    console.log(data.rows); // { rows: [...], total: 100 }
  } catch (error) {
    console.error('加载失败', error);
  }
}
```

**约定：**
- 成功：返回 `data`（已提取 `response.data.data`）
- 失败：抛出异常（拦截器已处理 401/403/500，会自动跳转登录或显示 toast）

### 5.3 添加新表单字段

1. **更新类型**（`src/api/customer.ts` 或 `src/types/api.ts`）：

```typescript
export interface Demand {
  // 新增字段
  newField?: string;
}
```

2. **更新表单**（`src/pages/customer/StudentDemandForm.tsx`）：

```typescript
const [form, setForm] = useState({
  // ...
  newField: '',
});

// 渲染
<Input
  id="newField"
  value={form.newField}
  onChange={(e) => handleChange('newField', e.target.value)}
/>
```

3. **更新校验**（如需要）：

```typescript
function validate(form: DemandForm) {
  const errors: Record<string, string> = {};
  if (!form.newField?.trim()) {
    errors.newField = '新字段不能为空';
  }
  return errors;
}
```

### 5.4 添加新的后台列表页

**优先使用 `SimpleListPage` 配置化组件**：

```typescript
import { SimpleListPage } from '@/components/common/SimpleListPage';
import type { ListConfig } from '@/components/common/SimpleListPage';

const config: ListConfig<YourType> = {
  title: '列表标题',
  description: '描述',
  columns: [
    { key: 'id', header: 'ID', className: 'w-20' },
    { key: 'name', header: '名称' },
  ],
  rowKey: (row) => row.id,
  fetchFn: async (params) => {
    const res = await api.list(params);
    return { rows: res.data, total: res.total };
  },
};

export function YourListPage() {
  return <SimpleListPage config={config} />;
}
```

---

## 6. 性能优化

### 6.1 已实现的优化

| 组件 | 优化 | 效果 |
|------|------|------|
| `DemandListPage` | 提取 `memo(DemandFilter)` 组件 | 输入筛选不触发表格重渲染 |
| `DataTable` | `memo` 包装 | 无关状态变化不触发行重排 |
| `TutorCard` | `memo` 化（已废弃） | 筛选只重渲染变化的卡片 |
| 图片 | `loading="lazy"` + `decoding="async"` | 异步解码，不阻塞主线程 |

### 6.2 优化检查清单

添加新组件时问自己：

- [ ] 是否需要 `memo`？（列表项 + 渲染成本高 → 是）
- [ ] 传给子组件的回调是否稳定？（子组件 memo 时 → 用 `useCallback`）
- [ ] 配置对象是否每次新建？（传给 memo 组件 → 用 `useMemo`）
- [ ] 列表 `key` 是否稳定？（优先用业务 ID，不用数组下标）
- [ ] 图片是否懒加载？（非首屏 → 加 `loading="lazy"`）

---

## 7. 类型安全

### 7.1 严格模式配置

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

### 7.2 常见类型错误

```typescript
// ❌ 错误：类型断言绕过检查
const data = res.data as never; // 不要这样

// ✅ 正确：定义准确的类型
interface ApiResponse {
  rows: Demand[];
  total: number;
}
const data: ApiResponse = res.data;
```

### 7.3 API 响应类型

所有 API 函数都应有明确返回类型：

```typescript
// ✅ 正确
export function listDemands(query: DemandQuery): Promise<PageResult<Demand>> {
  return customerRequest.post('/customer/demand/list', query);
}

// ❌ 错误（缺少返回类型）
export function listDemands(query: DemandQuery) {
  return customerRequest.post('/customer/demand/list', query);
}
```

---

## 8. 测试与验证

### 8.1 必做检查（每次改动后）

```bash
# 1. 类型检查（必须 0 error）
npx tsc -b --force

# 2. 构建验证（必须成功）
npx vite build

# 3. 本地预览（检查功能是否正常）
npx vite preview
# 访问 http://localhost:4173
```

### 8.2 性能验证

```bash
# 构建后检查产物大小
ls -lh dist/assets/*.js

# 关键指标：
# - Entry chunk < 300 KB (gzip < 100 KB)
# - Dashboard chunk < 500 KB (已懒加载，可接受)
```

### 8.3 移动端测试

使用 Chrome DevTools：
1. 按 F12 → 切换设备工具栏
2. 选择 iPhone SE / iPhone 14 Pro
3. 检查：
   - [ ] 底栏导航可用
   - [ ] 所有按钮 ≥ 44px
   - [ ] 表单在小屏幕上可用
   - [ ] 抽屉/弹窗不溢出

---

## 9. 已知问题与禁区

### 9.1 ❌ 已废弃功能（不要碰）

| 路径 | 状态 | 原因 |
|------|------|------|
| `src/pages/tutors/*` | **已废弃** | 旧家教系统，统一到客户账号 |
| `api/miniapp.ts` (家教接口) | **已废弃** | 只保留类型定义 |
| `/tutors` `/tutors/:id` 路由 | **已重定向** | 指向需求池或 404 |
| `/admin/tutor` 后台入口 | **已重定向** | 指向 `/admin/teacher` |

### 9.2 ⚠️ 已知技术债（待解决，不要恶化）

| 问题 | 影响 | 优先级 |
|------|------|--------|
| `Profile.tsx` 911 行 | 可读性差 | P2 |
| `ChooseRole` 身份选择流程冗余 | 用户体验 | P1 |
| 科目 chip UI 重复 | 维护成本 | P2 |

**规则：**
- ✅ 修复上述问题：欢迎
- ❌ 让问题更严重（如 Profile 继续膨胀）：禁止

### 9.3 🚫 绝对禁止

| 操作 | 理由 |
|------|------|
| 修改 `src/components/ui/*` | shadcn/ui 生成文件，改了会被覆盖 |
| 直接改 `node_modules` | 重装就丢失，用 patch-package 或 fork |
| 提交 `.env.local` | 包含敏感信息，已在 `.gitignore` |
| 硬编码颜色（如 `#ffffff`、`sky-500`） | 破坏设计系统，用 `--primary` 等令牌 |
| 混用 admin/customer token | API 会拒绝，用对应实例 |

---

## 10. 快速参考

### 10.1 常用命令

```bash
# 开发
pnpm dev                    # 启动 Vite dev server (默认 5173)
pnpm build                  # 生产构建
pnpm preview                # 预览构建产物 (4173)

# 检查
pnpm type-check             # 类型检查（如果有配置）
npx tsc -b --force          # 手动类型检查

# 清理
rm -rf dist node_modules    # 清理构建产物和依赖
pnpm install                # 重新安装
```

### 10.2 常用组件路径

```typescript
// 布局
import { PageHeader } from '@/components/common/PageHeader';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';

// 表格
import { DataTable } from '@/components/common/DataTable';
import { SimpleListPage } from '@/components/common/SimpleListPage';

// 状态
import { LoadingState } from '@/components/common/LoadingState';
import { ErrorState } from '@/components/common/ErrorState';
import { Empty } from '@/components/common/Empty';

// UI（shadcn）
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

// API
import * as customerApi from '@/api/customer';
import * as adminApi from '@/api'; // 后台 API 统一从 api/index.ts 导出
```

### 10.3 常用类型路径

```typescript
import type { Demand, Role, CustomerAccount } from '@/api/customer';
import type { PageResult, ApiResult } from '@/types/api';
```

---

## 11. 设计决策日志

| 日期 | 决策 | 理由 |
|------|------|------|
| 2025-01-17 | **统一老师实体到客户账号系统** | 两套老师系统导致数据孤岛，学生找不到新注册的老师 |
| 2025-01-17 | **合并 TeacherHome/StudentHome 为 DemandListPage** | 70.8% 代码重复，任何字段改动都要改两遍 |
| 2025-01-17 | **简化注册流程为 1 步** | 原 3 步流程（Landing → Register → ChooseRole）有 2 次无效选择 |
| 2025-01-17 | **移动端按钮全部 ≥ 44px** | 符合 iOS 人机界面指南，提升触控体验 |

---

## 12. 学习资源

- **React 官方文档**: https://react.dev
- **Tailwind CSS**: https://tailwindcss.com
- **shadcn/ui**: https://ui.shadcn.com
- **React Router**: https://reactrouter.com
- **Zustand**: https://zustand-demo.pmnd.rs

---

## 13. 联系方式

- **项目文档**: 见仓库根目录 `tutor-platform/tutor/tutor-web/`
- **优化报告**: `README-OPTIMIZATION.md` / `ARCHITECTURE-AUDIT.md`
- **性能优化**: `PERFORMANCE-OPTIMIZATION-DETAILS.md`

---

> **最后更新**: 2025-01-17  
> **文档版本**: 1.0  
> **维护者**: 开发团队

