import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Baby,
  ChevronRight,
  ClipboardList,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  ShieldCheck,
  Smartphone,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';
import { avatarUrl } from '@/lib/user';
import { useAuth } from '@/store/auth';
import * as tutorApi from '@/api/tutor';
import * as userPostApi from '@/api/userPost';
import {
  Avatar,
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FullPageSpinner,
  Tooltip,
} from '@/components/ui';
import { ThemeToggle } from '@/components/common';

interface AdminNavItem {
  to: string;
  label: string;
  /** 二级说明：一句话讲清这个入口是什么数据，避免同名菜单混淆 */
  hint: string;
  icon: LucideIcon;
}

interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
  /** 历史遗留数据：视觉上弱化 */
  subdued?: boolean;
}

/**
 * 后台导航按「数据域」分组，而不是按页面先后平铺。
 *
 * 三个容易混淆的入口在这里被明确区分：
 * - 家教业务 / 家教档案与审核：t_tutor_info 的家教档案，审核动作发生在这里；
 * - 客户账号 / 入驻老师、入驻学生：客户侧邮箱注册的账号（t_customer_account），只做查看与启停用；
 * - 历史数据 / 微信用户：与当前账号体系无关的小程序历史数据，单独收在最后一组。
 */
const NAV_GROUPS: AdminNavGroup[] = [
  {
    title: '概览',
    items: [{ to: '/admin/dashboard', label: '数据概览', hint: '规模、分布与待办', icon: LayoutDashboard }],
  },
  {
    title: '家教业务',
    items: [
      { to: '/admin/tutor', label: '家教档案与审核', hint: '家教资质审核入口', icon: GraduationCap },
    ],
  },
  {
    title: '内容管理',
    items: [
      { to: '/admin/post', label: '帖子审核', hint: '学生与老师发布的帖子，审核后才进广场', icon: MessagesSquare },
    ],
  },
  {
    title: '客户账号',
    items: [
      { to: '/admin/teacher', label: '入驻老师', hint: '邮箱注册的老师账号', icon: Users },
      { to: '/admin/student', label: '入驻学生', hint: '邮箱注册的学生账号', icon: Baby },
    ],
  },
  {
    title: '系统管理',
    items: [
      { to: '/admin/user', label: '系统用户', hint: '后台账号与部门', icon: UserCog },
      { to: '/admin/role', label: '角色', hint: '角色与权限字符', icon: ShieldCheck },
      { to: '/admin/online', label: '在线用户', hint: '当前登录会话', icon: MonitorSmartphone },
    ],
  },
  {
    title: '日志与监控',
    items: [
      { to: '/admin/logininfor', label: '登录日志', hint: '登录记录与来源', icon: FileClock },
      { to: '/admin/operlog', label: '操作日志', hint: '后台操作审计', icon: ClipboardList },
      { to: '/admin/server', label: '服务监控', hint: 'CPU / 内存 / 运行时', icon: Server },
    ],
  },
  {
    title: '历史数据',
    subdued: true,
    items: [{ to: '/admin/wxuser', label: '微信用户', hint: '小程序历史数据', icon: UserRound }],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** 不在侧栏里、但需要正确显示在顶栏路径中的页面 */
const EXTRA_PAGES: { to: string; label: string; group: string }[] = [
  { to: '/admin/profile', label: '个人中心', group: '账号' },
];

/** /admin/tutor?x 这类路径同样要高亮 */
const pathOnly = (p: string) => p.split('?')[0].replace(/\/+$/, '');

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [postPendingCount, setPostPendingCount] = useState(0);

  const current = useMemo(() => {
    const p = pathOnly(pathname);
    const hit = [...NAV_ITEMS, ...EXTRA_PAGES]
      .sort((a, b) => b.to.length - a.to.length)
      .find((n) => p === n.to || p.startsWith(`${n.to}/`));
    if (!hit) return { title: '管理后台', group: undefined };
    const group =
      'group' in hit ? hit.group : NAV_GROUPS.find((g) => g.items.some((i) => i.to === hit.to))?.title;
    return { title: hit.label, group };
  }, [pathname]);

  /* 待审核数量 —— 供侧栏角标与顶栏入口使用（后端不可用时静默降级） */
  const loadPending = useCallback(async () => {
    try {
      const { total } = await tutorApi.listTutor({ auditStatus: '0', pageNum: 1, pageSize: 1 });
      setPendingCount(Number(total) || 0);
    } catch {
      setPendingCount(0);
    }
    try {
      const total = await userPostApi.pendingCount();
      setPostPendingCount(Number(total) || 0);
    } catch {
      setPostPendingCount(0);
    }
  }, []);

  useEffect(() => {
    void loadPending();
    const timer = setInterval(() => void loadPending(), 120_000);
    return () => clearInterval(timer);
  }, [loadPending]);

  /* 移动端抽屉里的导航点击后自动关闭 */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActivePath = useCallback(
    (to: string) => {
      const p = pathOnly(pathname);
      return p === to || p.startsWith(`${to}/`);
    },
    [pathname],
  );

  const sidebar = (isCollapsed: boolean, inDrawer = false) => (
    <nav
      aria-label="后台导航"
      className={cn(
        'flex h-full min-h-0 flex-col border-r border-border bg-card',
        !inDrawer && 'sticky top-0',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center border-b border-border/70', isCollapsed ? 'justify-center px-2' : 'px-3')}>
        <Link
          to="/admin/dashboard"
          className={cn('flex items-center gap-2.5 rounded-lg py-1', isCollapsed ? 'justify-center' : 'px-1')}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-3.5 w-3.5" />
          </span>
          {!isCollapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">{APP_NAME}</span>
              <span className="block truncate text-2xs text-muted-foreground">管理后台</span>
            </span>
          ) : null}
        </Link>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain py-2', isCollapsed ? 'px-2' : 'px-2.5')}>
        {NAV_GROUPS.map((group, index) => (
          <div
            key={group.title}
            className={cn(
              (group.subdued || (isCollapsed && index > 0)) && 'mt-2 border-t border-border/60 pt-2',
            )}
          >
            {!isCollapsed ? (
              <p className="px-2.5 pb-1 pt-2 text-2xs uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
            ) : null}

            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActivePath(item.to);
                const Icon = item.icon;
                const badge =
                  item.to === '/admin/tutor'
                    ? pendingCount > 0
                      ? pendingCount
                      : undefined
                    : item.to === '/admin/post'
                      ? postPendingCount > 0
                        ? postPendingCount
                        : undefined
                      : undefined;

                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (inDrawer) setMobileOpen(false);
                    }}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-lg text-xs transition-colors',
                      isCollapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-1.5',
                      active
                        ? 'bg-primary/[0.08] text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {!isCollapsed ? (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium leading-5">{item.label}</span>
                        <span
                          className={cn(
                            'block truncate text-2xs leading-4',
                            active ? 'text-primary/70' : 'text-muted-foreground',
                          )}
                        >
                          {item.hint}
                        </span>
                      </span>
                    ) : null}
                    {badge !== undefined ? (
                      isCollapsed ? (
                        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
                      ) : (
                        <span className="tabular ml-auto shrink-0 rounded-full bg-warning/[0.14] px-1.5 text-2xs font-medium leading-4 text-warning">
                          {badge}
                        </span>
                      )
                    ) : null}
                    {badge !== undefined && isCollapsed ? (
                      <span className="sr-only">{badge} 条待审核</span>
                    ) : null}
                  </NavLink>
                );

                return isCollapsed ? (
                  <Tooltip key={item.to} content={`${item.label} · ${item.hint}`} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={cn('shrink-0 border-t border-border/70 py-2', isCollapsed ? 'px-2' : 'px-2.5')}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <ThemeToggle variant="switch" />
            <Link
              to="/tutors"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Smartphone className="h-3.5 w-3.5" />
              移动端预览
            </Link>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 桌面端侧栏（可折叠） */}
      <aside
        className={cn(
          'hidden h-screen shrink-0 transition-[width] duration-200 md:block',
          collapsed ? 'w-[68px]' : 'w-[240px]',
        )}
      >
        {sidebar(collapsed)}
      </aside>

      {/* 移动端抽屉导航 */}
      <Drawer
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        side="left"
        className="max-w-[280px] p-0"
        title={<span className="text-xs text-muted-foreground">导航</span>}
      >
        <div className="-mx-5 -my-4 h-[calc(100%+2rem)]">{sidebar(false, true)}</div>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="打开导航"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>

          <Tooltip content={collapsed ? '展开侧栏' : '收起侧栏'}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </Tooltip>

          <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-xs">
            {current.group ? (
              <>
                <span className="hidden shrink-0 text-muted-foreground sm:inline">{current.group}</span>
                <ChevronRight className="hidden h-3 w-3 shrink-0 text-muted-foreground sm:inline" aria-hidden />
              </>
            ) : null}
            <span className="truncate font-medium text-foreground">{current.title}</span>
          </nav>

          {pendingCount > 0 ? (
            <Link
              to="/admin/tutor?auditStatus=0"
              className="ml-2 hidden items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 transition-colors hover:bg-muted sm:inline-flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
              <span className="tabular text-2xs font-medium text-foreground">{pendingCount}</span>
              <span className="text-2xs text-muted-foreground">条待审核</span>
            </Link>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-muted"
                  aria-label="账户菜单"
                >
                  <Avatar size="sm" src={avatarUrl(user)} name={user?.nickName ?? user?.userName} />
                  <span className="hidden max-w-[8rem] truncate text-xs sm:block">
                    {user?.nickName || user?.userName || '未登录'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>
                  <span className="block truncate text-xs font-medium text-foreground">
                    {user?.nickName || user?.userName || '—'}
                  </span>
                  <span className="block truncate">{user?.dept?.deptName ?? '未分配部门'}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/admin/profile">
                    <UserCog className="h-3.5 w-3.5" />
                    个人中心
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="destructive" onSelect={() => void logout()}>
                  <LogOut className="h-3.5 w-3.5" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/25">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
            {/* 后台页面也是 lazy 的：只在这一块转圈，侧边栏与顶栏不动 */}
            <Suspense fallback={<FullPageSpinner text="正在加载页面…" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
