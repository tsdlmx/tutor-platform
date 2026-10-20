# 性能优化详细技术报告

> 本报告详细记录了针对高频页面的 React 渲染优化工作

---

## 🎯 优化范围

审查了 5 个高频页面的渲染性能：
- `TeacherHome.tsx` (教师需求池) → 实际是 `DemandListPage` 的薄包装
- `StudentHome.tsx` (学生我的需求) → 实际是 `DemandListPage` 的薄包装
- `TutorList.tsx` (家教列表)
- `Profile.tsx` (个人中心)
- `shared.tsx` (共享组件)

**真正的热点：3 个核心文件**

---

## 🔥 关键性能瓶颈及修复

### 1. DemandListPage - 筛选输入触发全页重渲染

**问题诊断：**

原代码将筛选表单状态（科目/年级/关键词）放在页面级 state，导致：
- 在关键词输入框每敲一个字，整页重渲染
- 桌面表格：10 行 × 7 列 = 70 个单元格全部重排
- 移动端：10 张卡片全部重新渲染
- **这是本次审查发现的最大性能浪费**

**修复方案：**

```typescript
// 优化前：页面级 state
const [keyword, setKeyword] = useState('');
const [subject, setSubject] = useState('');
// 每次输入都触发整页重渲染

// 优化后：抽离独立组件，状态内部化
const DemandFilter = memo(({ onSearch, onClear, initialValues }) => {
  const [keyword, setKeyword] = useState('');
  const [subject, setSubject] = useState('');
  
  // 输入只重渲染这个筛选卡片
  // 提交后才通过 onSearch 通知父组件
});
```

**具体改进：**

1. **抽出 `memo(DemandFilter)` 子组件**
   - 输入框状态收在组件内部
   - 只在提交时通过 `onSearch` 回调传递条件
   - 敲键只重渲染筛选卡片，不影响表格/卡片列表

2. **外部重置通过 `key` 重挂载**
   ```typescript
   <DemandFilter 
     key={filterResetKey} 
     onSearch={handleSearch}
   />
   // 点击"重置筛选条件"时 setFilterResetKey(Date.now())
   // 不需要 effect 同步内部状态
   ```

3. **所有配置对象 memo 化**
   ```typescript
   const columns = useMemo(() => [...], [scope]);
   const emptyAction = useMemo(() => ({...}), [scope]);
   const drawerSections = useMemo(() => [...], [demand]);
   const filterExtra = useMemo(() => <Badge>...</Badge>, [totalCount]);
   const cardFooter = useCallback((d) => <Actions />, [scope]);
   ```

4. **所有事件处理器 useCallback 化**
   ```typescript
   const openDetail = useCallback((d) => {...}, []);
   const search = useCallback((vals) => {...}, [loadList]);
   const resetQuery = useCallback(() => {...}, [loadList]);
   const cancelDemand = useCallback((id) => {...}, [loadList]);
   const removeDemand = useCallback((id) => {...}, [loadList, navigate]);
   const retry = useCallback(() => {...}, [loadList]);
   ```

5. **提取模块级常量**
   ```typescript
   const demandRowKey = (d: Demand) => `demand-${d.demandId}`;
   // 不再每次渲染创建新函数
   ```

**性能提升：**
- 输入关键词：从 70+ 组件重渲染 → 只重渲染筛选卡片
- 表格交互：无关状态变化不再触发行重排
- 内存优化：减少闭包创建和对象分配

---

### 2. DataTable - 通用表格缺少 memo

**问题诊断：**

通用表格组件未使用 memo，导致：
- 打开详情抽屉：表格所有行重新渲染
- `acting/removing` 等无关状态变化：表格重排
- 6 个调用方（4 个后台页面 + 2 个客户端页面）都受影响

**修复方案：**

```typescript
// 优化前
function DataTable<T>({ columns, data, ... }: Props<T>) {
  // 每次父组件重渲染，表格全部重排
}

// 优化后
const DataTableImpl = function DataTable<T>({ ... }: Props<T>) {
  // 实现不变
};

export const DataTable = memo(DataTableImpl) as typeof DataTableImpl;
// 保持泛型签名，同时获得 memo 优化
```

**验证安全性：**

检查了所有 6 个调用方：
- ✅ `DemandListPage.tsx` - 新数组 + 稳定回调
- ✅ `admin/TutorList.tsx` - 新数组 + 稳定回调
- ✅ `admin/WxUserList.tsx` - 新数组 + 稳定回调
- ✅ `admin/CustomerAccountList.tsx` - 新数组 + 稳定回调
- ✅ `admin/AdminUserList.tsx` - 新数组 + 稳定回调
- ✅ `hooks/usePagedList.ts` - 新数组 + 稳定回调

**无风险：** 没有原地 mutate 导致 memo 看到旧数据的情况

**性能提升：**
- 抽屉开关：表格不重渲染
- 按钮 loading 状态：表格不重渲染
- 页面其他状态变化：表格不重渲染

---

### 3. TutorList - URL 同步过度触发

**问题诊断：**

```typescript
// 优化前
useEffect(() => {
  const next = { subject, gradeId, sortBy };
  setParams(next, { replace: true }); // 无条件更新
}, [subject, gradeId, sortBy, setParams]);
// 每次重渲染都触发一次 history.replace
```

**问题：**
- 每次进入页面：触发一次多余的导航
- 依赖变化后：即使 URL 已是目标值，仍然 replace
- 多余的 history 操作和重渲染

**修复方案：**

```typescript
// 优化后
useEffect(() => {
  const [params] = searchParams;
  const current = {
    subject: params.get('subject') || '',
    gradeId: params.get('gradeId') || '',
    sortBy: params.get('sortBy') || 'updateTime',
  };
  const next = { subject, gradeId, sortBy };
  
  // 先比对，一致就不操作（幂等）
  if (
    current.subject === next.subject &&
    current.gradeId === next.gradeId &&
    current.sortBy === next.sortBy
  ) {
    return;
  }
  
  setParams(next, { replace: true });
}, [subject, gradeId, sortBy, searchParams, setParams]);
```

**性能提升：**
- 避免不必要的 history.replace
- 减少导航触发的重渲染
- 幂等操作，不会自激循环

---

### 4. TutorCard - 缺少 memo 导致筛选重渲染

**问题诊断：**

- 本地关键词过滤后，即使卡片内容未变也全部重渲染
- 每张卡片包含 `Avatar` 图片组件，渲染成本较高
- 这是唯一值得对列表项做 memo 的场景

**修复方案：**

```typescript
// 优化前
export function TutorCard({ tutor, to }: Props) {
  // 每次父组件筛选状态变化，所有卡片重渲染
}

// 优化后
export const TutorCard = memo(({ tutor, to }: Props) => {
  // tutor 对象来自接口数组，引用稳定
  // 筛选后保留的卡片不重新渲染
});
```

**稳定的 key：**

```typescript
// 优化前
key={tutor.tutorId ?? i} // 缺 id 时退化成下标

// 优化后
const tutorKey = (t: Tutor) => 
  t.tutorId || `${t.tutorNum}-${t.name}-${t.school}-${t.phone}`;
// id 优先，兜底用稳定的业务字段组合
```

**性能提升：**
- 筛选操作：只重渲染新增/移除的卡片
- 图片加载：避免重新触发 Avatar 渲染
- 列表滚动：保持已渲染卡片的 DOM

---

### 5. Pagination - 每次渲染创建新数组

**问题诊断：**

```typescript
// 优化前
function Pagination({ pageSizes = [10, 20, 50, 100] }) {
  const options = pageSizes.map(size => ({ ... })); // 每次新建
}
```

**修复方案：**

```typescript
// 优化后
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100]; // 模块级常量

function Pagination({ pageSizes = DEFAULT_PAGE_SIZES }) {
  const options = useMemo(
    () => pageSizes.map(size => ({ label: `${size} 条/页`, value: size })),
    [pageSizes]
  );
}
```

**性能提升：**
- 避免每次渲染创建新数组
- 减少 Select 组件的 props 变化
- 降低内存分配

---

### 6. PostCard - 图片解码优化

**修复方案：**

```typescript
// 优化前
<img src={url} loading="lazy" />

// 优化后
<img src={url} loading="lazy" decoding="async" />
```

**效果：**
- 长信息流中的图片解码不阻塞主线程
- 保持滚动流畅性
- 已有 `loading="lazy"` 的基础上进一步优化

---

## ✅ 确认无需优化的部分

以下经过审查，确认无性能问题或刻意不改：

### Profile.tsx
- ✅ `loadProfile` 已是 `useCallback([])` + 挂载一次
- ✅ `TABS` 在模块级，不重建
- ✅ Radix Tabs 惰性挂载（切回时才拉数据）
- ✅ `onTotalChange` 传的是稳定 setter，effect 不自激
- ✅ 内联箭头保留（子组件没 memo，包 useCallback 只是噪音）

### TutorList 其余部分
- ✅ `query`/`visible` 已 `useMemo`
- ✅ `GRADE_OPTIONS`/`SUBJECT_OPTIONS`/`SORT_SELECT_OPTIONS` 是模块常量
- ✅ 定位 effect `[]` 只跑一次
- ✅ 抽屉内容由 Radix 关闭时不挂载

### DemandListPage 的 loadList effect
- ✅ `useCallback([query, isMine])` + `useEffect([loadList])` 是正确写法
- ✅ 不构成过度渲染

### 列表 key
- ✅ 需求卡/帖子卡都用业务 id (`demandId`/`postId`)
- ✅ 骨架屏、`DetailDrawer` 字段、`pageItems` 的 index key 属于静态不重排场景，保留

### 图片尺寸属性
- ✅ `Avatar` 有固定尺寸容器 + `loading="lazy"`
- ✅ 帖子多图是 CSS 定高缩略图 (`h-24`)
- ✅ Admin 登录页 logo/验证码是首屏资源，不该 lazy
- ⚠️  单图 (`max-h-64`) 没有固定宽高比：硬写 `width/height` 会把长图裁成固定方块，属于设计改动而非性能修复，所以只加了 `decoding` 并留注释说明

---

## 📊 性能改进总结

| 组件 | 问题 | 解决方案 | 提升 |
|------|------|----------|------|
| `DemandListPage` | 输入触发全页重渲染 (70+ 组件) | 提取 memo(DemandFilter) | ⚡⚡⚡ 显著 |
| `DataTable` | 无关状态触发表格重排 | memo 包装 | ⚡⚡ 中等 |
| `TutorList` | URL 同步多余导航 | 比对后再写 | ⚡ 轻微 |
| `TutorCard` | 筛选触发所有卡片重渲染 | memo 化 | ⚡⚡ 中等 |
| `Pagination` | 每次创建新数组 | 模块常量 + useMemo | ⚡ 轻微 |
| `PostCard` | 图片解码阻塞主线程 | decoding="async" | ⚡ 轻微 |

---

## ✅ 验证结果

```bash
$ npx tsc -b --force
✅ 0 errors (noUnusedLocals 已启用)

$ npx vite build
✅ Built in 7.4s
```

---

## 🎯 优化原则

本次优化遵循以下原则：

1. **只修明显问题** - 不做过度优化
2. **保持类型安全** - memo 保留泛型签名
3. **验证无副作用** - 检查所有调用方，确保无原地 mutate
4. **性能 vs 设计** - 不为性能改变视觉呈现
5. **实用主义** - 子组件没 memo 就不包 useCallback

---

## 📝 修改文件清单

- ✅ `src/pages/customer/DemandListPage.tsx`
- ✅ `src/components/common/DataTable.tsx`
- ✅ `src/pages/tutors/TutorList.tsx`
- ✅ `src/pages/tutors/TutorCard.tsx`
- ✅ `src/components/ui/pagination.tsx`
- ✅ `src/pages/customer/shared.tsx`

**总计：6 个文件**

---

> **优化完成时间：** 2025-01-17  
> **审查者：** 子代理 080b7f66  
> **验证状态：** ✅ TypeScript 0 error / Vite build 通过
