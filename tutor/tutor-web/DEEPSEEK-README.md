# 👋 DeepSeek 开发者，你好！

这是一个家教平台的前端项目。为了让你更高效地帮助开发，我们准备了完整的开发规范文档。

---

## 🚀 开始前必读

### 第一步：阅读开发规范

📖 **[`DEVELOPMENT-GUIDE.md`](./DEVELOPMENT-GUIDE.md)** - 你的完整上下文文档

这份 13 章的文档包含了你需要的所有信息：

- ✅ 项目结构和技术栈
- ✅ **关键架构决策**（特别是"两套老师系统"的统一方案）
- ✅ 代码规范和最佳实践
- ✅ 性能优化模式（何时用 memo/useMemo/useCallback）
- ✅ **已废弃功能清单**（不要碰的代码）
- ✅ **绝对禁止操作**（会破坏项目的行为）
- ✅ 快速参考（常用命令、组件路径、类型路径）

**请在开始任何开发工作前，先完整阅读这份文档！**

---

## ⚠️ 关键警告（请务必注意）

### 1. 两套老师系统已统一

**背景：** 项目曾有两套老师系统（`t_tutor_info` 小程序旧系统 vs `t_customer_account` 客户账号系统），现在已统一到客户账号系统。

**已废弃（不要使用）：**
- ❌ `src/pages/tutors/*` (3 个页面)
- ❌ `api/miniapp.ts` 的家教接口
- ❌ `/tutors` `/tutors/:id` 路由
- ❌ `/admin/tutor` 后台入口
- ❌ `TutorInfo` 类型

**唯一使用（正确的）：**
- ✅ `/me` (个人中心) → 老师填写简历
- ✅ `/admin/teacher` (后台老师管理)
- ✅ `api/customer.ts` (getProfile, updateProfile)
- ✅ `CustomerAccount` + `TeacherProfile` 类型

**规则：如果用户要求修改"老师"相关功能，只使用客户账号系统，不要触碰旧家教系统！**

### 2. API 双实例隔离

```typescript
// ❌ 错误：混用 token
import { request } from '@/api/request'; // admin 专用
customerApi.getProfile(); // 会失败

// ✅ 正确：使用对应实例
import * as customerApi from '@/api/customer'; // 客户端专用
```

### 3. 不要修改的文件

| 路径 | 理由 |
|------|------|
| `src/components/ui/*` | shadcn/ui 生成，改了会被覆盖 |
| `node_modules` | 重装就丢失 |
| `.env.local` | 敏感信息，不提交 |

### 4. 设计系统规范

```typescript
// ❌ 错误：硬编码颜色
<div className="bg-white text-black">

// ✅ 正确：使用设计令牌
<div className="bg-card text-card-foreground">
```

**禁止硬编码颜色**：如 `#ffffff`、`rgb(...)`、`sky-500` 等。
**必须使用令牌**：`--background`、`--primary`、`--muted` 等。

---

## 📝 开发工作流

### 典型任务流程

1. **理解需求**
   ```
   用户：给需求列表增加一个筛选条件
   ```

2. **查阅文档**
   ```bash
   # 打开 DEVELOPMENT-GUIDE.md
   # 找到第 5 章"常见任务" → 5.3 添加新表单字段
   ```

3. **实现改动**
   ```typescript
   // 1. 更新类型（src/api/customer.ts）
   export interface Demand {
     newFilter?: string;
   }
   
   // 2. 更新表单（src/pages/customer/DemandListPage.tsx）
   // 3. 更新校验（如需要）
   ```

4. **验证改动**
   ```bash
   # 必做：类型检查
   npx tsc -b --force
   
   # 必做：构建验证
   npx vite build
   
   # 可选：本地预览
   npx vite preview
   ```

5. **告知用户**
   ```
   ✅ 已添加筛选条件
   ✅ TypeScript 0 error
   ✅ Vite build 通过
   
   修改文件：
   - src/api/customer.ts
   - src/pages/customer/DemandListPage.tsx
   ```

---

## 🎯 性能优化原则

### 何时用 `memo`

```typescript
// ✅ 需要：列表项（渲染成本高 + 引用稳定）
export const DemandCard = memo(({ demand }: Props) => {
  return <Card>...</Card>;
});

// ❌ 不需要：简单组件 + 子组件没 memo
function SimpleButton({ onClick }: Props) {
  return <button onClick={onClick}>按钮</button>;
}
```

### 何时用 `useCallback` / `useMemo`

```typescript
// ✅ 需要：传给 memo 组件的回调
const handleClick = useCallback(() => {
  doSomething();
}, [dependency]);

// ✅ 需要：传给 memo 组件的配置对象
const columns = useMemo(() => [...], [deps]);

// ❌ 不需要：子组件没 memo
const handleClick = () => {}; // 内联箭头 OK
```

**详见：** `DEVELOPMENT-GUIDE.md` 第 4.2 章 "性能优化模式"

---

## 🧪 必做检查（每次改动后）

```bash
# 1. 类型检查（必须 0 error）
npx tsc -b --force

# 2. 构建验证（必须成功）
npx vite build
```

**规则：只有两个检查都通过，改动才算完成！**

---

## 📚 完整文档列表

| 文档 | 用途 |
|------|------|
| **[`DEVELOPMENT-GUIDE.md`](./DEVELOPMENT-GUIDE.md)** | **开发规范（必读）** |
| [`DOCS-INDEX.md`](./DOCS-INDEX.md) | 文档导航索引 |
| [`ARCHITECTURE-AUDIT.md`](./ARCHITECTURE-AUDIT.md) | 架构审计报告（了解历史问题） |
| [`PERFORMANCE-OPTIMIZATION-DETAILS.md`](./PERFORMANCE-OPTIMIZATION-DETAILS.md) | React 性能优化详解 |
| [`README-OPTIMIZATION.md`](./README-OPTIMIZATION.md) | 优化工作完整报告 |

---

## 🤝 协作提示

### 与用户沟通

1. **明确需求**
   ```
   用户：给页面加个按钮
   
   你：请问这个按钮的功能是？点击后需要做什么？
   ```

2. **提供方案**
   ```
   根据需求，我有两种方案：
   
   方案 A：在表格顶部添加操作按钮
   - 优点：符合现有设计模式
   - 缺点：移动端可能空间不足
   
   方案 B：在每行添加操作图标
   - 优点：移动端友好
   - 缺点：表格会变宽
   
   推荐方案 A，因为...
   ```

3. **报告结果**
   ```
   ✅ 功能已实现
   ✅ TypeScript 0 error
   ✅ Vite build 通过
   
   修改文件：
   - src/pages/customer/DemandListPage.tsx (新增操作按钮)
   - src/api/customer.ts (新增 API 调用)
   
   请刷新页面查看效果。
   ```

### 遇到问题时

1. **查阅文档**
   ```
   DEVELOPMENT-GUIDE.md → 第 9 章"已知问题与禁区"
   ```

2. **说明情况**
   ```
   ❌ 发现问题：src/pages/tutors/TutorList.tsx 需要修改
   
   根据 DEVELOPMENT-GUIDE.md 第 3.1 章，
   /tutors 页面已废弃，现在使用客户账号系统。
   
   建议：修改 /me 页面的老师简历功能
   正确文件：src/pages/customer/Profile.tsx
   ```

3. **提供替代方案**
   ```
   原需求可以通过以下方式实现：
   1. ...
   2. ...
   
   请确认是否采用此方案。
   ```

---

## 🎉 准备好了吗？

现在你可以：

1. ✅ 打开 **[`DEVELOPMENT-GUIDE.md`](./DEVELOPMENT-GUIDE.md)** 完整阅读
2. ✅ 理解项目结构和架构决策
3. ✅ 记住已废弃功能和禁区
4. ✅ 开始高效开发！

---

> **提示：** 遇到任何不确定的情况，优先查阅 `DEVELOPMENT-GUIDE.md`。  
> **联系：** 如果文档没有覆盖的内容，及时询问用户。

**祝你开发愉快！** 🚀
