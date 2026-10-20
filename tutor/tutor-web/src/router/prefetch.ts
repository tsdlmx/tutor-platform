/**
 * 路由 chunk 预取（按「用户意图」触发，不是一上来就下）
 *
 * 页面是按路由 lazy 加载的，点底栏时才开始下 chunk，慢网上会看到 100~300ms 的
 * 占位。这里在 pointerenter / focus / touchstart 这些「手指/鼠标已经放上去」的
 * 时刻提前把对应 chunk 拉进缓存 —— 真正点击时几乎是瞬间渲染。
 *
 * 注意两点：
 *   1. 只在有意图时触发，不会增加首屏请求数（首屏指标不受影响）；
 *   2. import 的路径字符串必须和 router/index.tsx 里 lazy() 用的完全一致，
 *      否则会打进第二个 chunk（同一模块被重复打包）。
 */
const loaders: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/customer/Landing'),
  '/tutors': () => import('@/pages/tutors/TutorList'),
  '/choose-role': () => import('@/pages/customer/ChooseRole'),
  '/demands': () => import('@/pages/customer/TeacherHome'),
  '/demands/mine': () => import('@/pages/customer/StudentHome'),
  '/demands/new': () => import('@/pages/customer/StudentDemandForm'),
  '/me': () => import('@/pages/customer/Profile'),
  '/login': () => import('@/pages/customer/Login'),
};

const started = new Set<string>();

export function prefetchRoute(path: string) {
  const load = loaders[path];
  if (!load || started.has(path)) return;
  started.add(path);
  // 预取失败（断网、部署换了 hash）不算错误：真点击时还会再取一次
  void load().catch(() => undefined);
}

/** 给 <Link> 用的标准事件集合 */
export const prefetchHandlers = (path: string) => ({
  onPointerEnter: () => prefetchRoute(path),
  onFocus: () => prefetchRoute(path),
  onTouchStart: () => prefetchRoute(path),
});
