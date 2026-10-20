import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FilePlus, GraduationCap, Home, LogOut, Menu, MessagesSquare, Search, UserRound, UserRoundCog } from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';
import { accountHomePath, useCustomerAuth } from '@/store/customerAuth';
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FullPageSpinner,
  Input,
  Label,
  toast,
} from '@/components/ui';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { CustomerBottomNav } from '@/components/layouts/CustomerBottomNav';
import { CustomerFooter } from '@/components/layouts/CustomerFooter';
import { ROLE_LABEL } from '@/pages/customer/labels';
import * as customerApi from '@/api/customer';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

/**
 * 客户区外壳（全站唯一的一套客户界面）。
 *
 *   sticky 顶栏（品牌 + 主导航 + 主题 + 账户菜单）
 *   → main（按路由 lazy 的页面）
 *   → 页脚（平台总览 / 备案 / 公开入口）
 *   → 移动端底部导航（md 以下）
 *
 * 「首页」指向当前身份的主页（老师 → /demands，学生 → /demands/mine）：
 * 登录后访问 `/` 本来就会被 Landing 重定向到那里，再单独放一个
 * 「老师端 / 学生端」入口只是重复。
 *
 * 账户相关动作（我的主页 / 选择身份 / 退出）收进头像下拉菜单，
 * 顶栏不再堆一排按钮——这是后台类产品更常见的做法。
 */
export function CustomerLayout() {
  const { account, authenticated, loading, logout } = useCustomerAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  /* 注销账号：需要二次确认并重新输入密码 */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  /* 路由变化后收起移动端抽屉 */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const home = authenticated && account?.role ? accountHomePath(account) : '/';
  const displayName = account?.nickname || account?.email || '';

  /* 顺序与移动底栏一致：首页 →（选身份）→（发布需求）→ 广场 → 我的 →（找家教，仅游客） */
  const navItems: NavItem[] = [
    { to: home, label: '首页', icon: <Home />, end: true },
    ...(authenticated && !account?.role
      ? [{ to: '/choose-role', label: '选择身份', icon: <UserRoundCog /> }]
      : []),
    // 学生独有：发布需求入口
    ...(account?.role === 'STUDENT'
      ? [{ to: '/demands/new', label: '发布需求', icon: <FilePlus /> }]
      : []),
    ...(authenticated ? [{ to: '/plaza', label: '广场', icon: <MessagesSquare /> }] : []),
    ...(authenticated ? [{ to: '/me', label: '我的', icon: <UserRound /> }] : []),
    // 「找家教」只对未登录访客展示：登录后（老师/学生）都没有这个入口，路由层也会拦
    ...(authenticated ? [] : [{ to: '/tutors', label: '找家教', icon: <Search /> }]),
  ];

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
      isActive
        ? 'bg-primary-foreground/15 font-medium text-primary-foreground'
        : 'text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground',
    );

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/', { replace: true });
  }

  /** 注销账号（行使删除权）：删除账号与本人简历、帖子、需求、申请，不可恢复 */
  async function handleDeleteAccount() {
    if (deleting) return;
    if (!deletePassword) {
      toast.error('请先输入登录密码');
      return;
    }
    setDeleting(true);
    try {
      await customerApi.deleteAccount(deletePassword);
      setDeleteOpen(false);
      setDeletePassword('');
      toast.success('账号已注销', { description: '你的账号与相关内容已删除' });
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('注销失败', { description: err instanceof Error ? err.message : '请稍后重试' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-muted/25 max-md:pb-[calc(env(safe-area-inset-bottom)+4.5rem)]"
      style={{ ['--tabbar-h' as string]: '72px' }}
    >
      {/* 顶栏：整条用品牌色 #3C65E2（--primary）。玻璃拟态在这里没有意义，
          半透明的白会把它洗成灰蓝，所以直接用实色 + 白字。 */}
      <header className="sticky top-0 z-40 border-b border-primary-foreground/15 bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-3 sm:px-5">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</span>
          </Link>

          {/* 桌面端主导航 */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" />

            {loading ? (
              <span className="h-8 w-8 animate-pulse rounded-full bg-primary-foreground/25" aria-hidden />
            ) : authenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="账户菜单"
                    className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-primary-foreground/15"
                  >
                    <Avatar size="sm" name={displayName} />
                    <span className="hidden max-w-[8rem] truncate text-xs font-medium sm:block">
                      {displayName}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-1">
                    <span className="truncate text-xs font-medium">{displayName}</span>
                    <span className="truncate text-2xs font-normal text-muted-foreground">
                      {account?.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/me">我的主页</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={home}>{account?.role === 'STUDENT' ? '我的需求' : '需求池'}</Link>
                  </DropdownMenuItem>
                  {/* 身份是一次性确定的，已选身份后不提供切换入口 */}
                  {account?.role ? null : (
                    <DropdownMenuItem asChild>
                      <Link to="/choose-role">选择身份</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleLogout()}>
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    退出登录
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false);
                      setDeletePassword('');
                      setDeleteOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    注销账号
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="hidden text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground sm:inline-flex"
                >
                  <Link to="/login">登录</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                >
                  <Link to="/register">注册</Link>
                </Button>
              </>
            )}

            {/* 移动端：底栏负责主导航，这里只放次要入口 */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground md:hidden"
              aria-label="打开菜单"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* 移动端抽屉：只放底栏没有的次要入口 */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} side="right" className="max-w-[280px]" title="菜单">
        {authenticated ? (
          <div className="flex flex-col gap-1">
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar size="default" name={displayName} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{displayName}</p>
                <p className="truncate text-2xs text-muted-foreground">{account?.email}</p>
              </div>
              <Badge tone={account?.role ? 'info' : 'muted'} className="ml-auto">
                {account?.role ? ROLE_LABEL[account.role] : '未选身份'}
              </Badge>
            </div>
            <DrawerLink to="/plaza" onClick={() => setMenuOpen(false)}>
              广场
            </DrawerLink>
            <DrawerLink to="/me" onClick={() => setMenuOpen(false)}>
              我的主页
            </DrawerLink>
            <DrawerLink to={home} onClick={() => setMenuOpen(false)}>
              {account?.role === 'STUDENT' ? '我的需求' : '需求池'}
            </DrawerLink>
            {account?.role ? null : (
              <DrawerLink to="/choose-role" onClick={() => setMenuOpen(false)}>
                选择身份
              </DrawerLink>
            )}
            <Button variant="outline" className="mt-3" onClick={() => void handleLogout()}>
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link to="/login">登录</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/register">注册</Link>
            </Button>
          </div>
        )}
      </Drawer>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 sm:px-5 sm:py-6">
        {/*
          二级页面是按路由 lazy 加载的：等 chunk 期间只在这一块显示占位，
          顶栏和底部导航保持不动（否则整屏闪一下 spinner，观感很差）。
        */}
        <Suspense fallback={<FullPageSpinner text="正在加载页面…" />}>
          <Outlet />
        </Suspense>
      </main>

      {/* 页脚 = 平台总览 / 备案信息那一栏；统计只登录后请求一次 */}
      <CustomerFooter />

      {/* 移动端底部导航：按老师 / 学生 / 未选身份 / 游客给出不同主入口（md 以上隐藏） */}
      <CustomerBottomNav />

      {/* 注销账号确认：不可恢复，因此要求重新输入密码 */}
      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>注销账号</DialogTitle>
            <DialogDescription>
              注销会立即删除你的账号，以及本人的简历、帖子、需求与申请记录，且<strong>无法恢复</strong>。
              为保障账号安全，请输入登录密码确认。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-password">登录密码</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="请输入当前账号的密码"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteAccount()} loading={deleting}>
              确认注销
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DrawerLink({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex min-h-[44px] items-center rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export default CustomerLayout;
