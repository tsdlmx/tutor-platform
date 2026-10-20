import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/layouts/AdminLayout';
import { FullPageSpinner } from '@/components/ui';
import { customerTokenStore, type Role } from '@/api/customer';
import { tokenStore } from '@/lib/storage';
import { useAuth } from '@/store/auth';
import {
  CUSTOMER_CHOOSE_ROLE_PATH,
  CUSTOMER_LOGIN_PATH,
  accountHomePath,
  useCustomerAuth,
} from '@/store/customerAuth';

/*
 * ------------------------------------------------------------------
 * 首屏与路由分包
 * ------------------------------------------------------------------
 * 只有「打开站点第一眼就要看到的东西」是静态引入的：
 *   CustomerLayout（外壳）+ Landing（根路径）。
 * 登录 / 注册页也是 lazy 的（它们带的入场动画会额外拉一个动画库，
 * 而首次访客停在首页时并不需要它们）。其余页面同理。
 * ------------------------------------------------------------------
 */
import CustomerLayout from '@/pages/customer/CustomerLayout';
import CustomerLanding from '@/pages/customer/Landing';

const CustomerLogin = lazy(() => import('@/pages/customer/Login'));
const CustomerRegister = lazy(() => import('@/pages/customer/Register'));
const CustomerForgotPassword = lazy(() => import('@/pages/customer/ForgotPassword'));

const CustomerNotFound = lazy(() => import('@/pages/customer/NotFound'));
const ChooseRole = lazy(() => import('@/pages/customer/ChooseRole'));
const Plaza = lazy(() => import('@/pages/customer/Plaza'));
const TeacherDemands = lazy(() => import('@/pages/customer/TeacherHome'));
const StudentDemands = lazy(() => import('@/pages/customer/StudentHome'));
const DemandForm = lazy(() => import('@/pages/customer/StudentDemandForm'));
const CustomerProfile = lazy(() => import('@/pages/customer/Profile'));

const TutorList = lazy(() => import('@/pages/tutors/TutorList'));
const TutorDetail = lazy(() => import('@/pages/tutors/TutorDetail'));

const AdminLogin = lazy(() => import('@/pages/admin/Login'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminTutorList = lazy(() => import('@/pages/admin/TutorList'));
const AdminCustomerAccountList = lazy(() => import('@/pages/admin/CustomerAccountList'));
const AdminWxUserList = lazy(() => import('@/pages/admin/WxUserList'));
const AdminPostAuditList = lazy(() => import('@/pages/admin/PostAuditList'));
const AdminSystemUserList = lazy(() => import('@/pages/admin/SystemUserList'));
const AdminRoleList = lazy(() => import('@/pages/admin/RoleList'));
const AdminOnlineUsers = lazy(() => import('@/pages/admin/OnlineUsers'));
const AdminLoginLogList = lazy(() => import('@/pages/admin/LoginLogList'));
const AdminOperLogList = lazy(() => import('@/pages/admin/OperLogList'));
const AdminServerMonitor = lazy(() => import('@/pages/admin/ServerMonitor'));
const AdminProfile = lazy(() => import('@/pages/admin/Profile'));
const AdminNotFound = lazy(() => import('@/pages/admin/NotFound'));

/** 路由切换时把滚动位置复位（PC 内层容器 + 移动端 window） */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/** 旧地址兼容：查到就去新地址（不 404，也不保留两份页面） */
function Redirect({ to, keepSearch = false }: { to: string; keepSearch?: boolean }) {
  const { search } = useLocation();
  return <Navigate to={keepSearch && search ? `${to}${search}` : to} replace />;
}

/**
 * 「找家教」只对**未登录的访客**开放。
 *
 * 产品口径：老师不需要找老师；学生/家长的需求是「发需求、等老师来对接」，
 * 也不需要去逛家教库。所以这条公开浏览页只留给访客（落地上用来了解平台），
 * 登录后一律送回自己的首页。
 * 用守卫而不是删路由：删了手输地址会 404，体验更差。
 */
function RequireGuestOnly({ children }: { children?: ReactNode }) {
  const { account, authenticated, loading } = useCustomerAuth();
  // 有 token 但还在换账号信息时先转圈，避免先看到页面再被弹走
  if (loading && customerTokenStore.get()) {
    return <FullPageSpinner text="正在校验登录状态…" />;
  }
  if (authenticated) {
    return <Navigate to={accountHomePath(account)} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** 后台登录守卫：booting 期间不闪登录页 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, booting } = useAuth();
  const location = useLocation();

  if (!tokenStore.get()) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (booting) return <FullPageSpinner text="正在校验登录状态…" />;
  if (!authenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * 客户侧守卫（老师 / 学生）：
 *   1. 没 token → /login（把当前地址记在 state.from，登录后可以回跳）
 *   2. 引导期（正在用 token 换账号）显示整页 loading，避免已登录用户被踢
 *   3. 未选身份（role = null）→ /choose-role（/choose-role 与 /me 本身除外）
 *   4. 身份与页面不匹配（如学生访问老师的需求池）→ 回到自己的首页
 *
 * 用作布局路由时可省略 children：直接渲染 <Outlet />。
 */
function RequireCustomer({
  allow,
  allowNullRole = false,
  children,
}: {
  allow?: Role;
  allowNullRole?: boolean;
  children?: ReactNode;
}) {
  const { account, authenticated, loading } = useCustomerAuth();
  const location = useLocation();
  const path = location.pathname;

  if (!customerTokenStore.get()) {
    return <Navigate to={CUSTOMER_LOGIN_PATH} replace state={{ from: path + location.search }} />;
  }
  if (loading) return <FullPageSpinner text="正在校验登录状态…" />;
  if (!authenticated) {
    return <Navigate to={CUSTOMER_LOGIN_PATH} replace state={{ from: path + location.search }} />;
  }

  const role = account?.role ?? null;
  if (!role && !allowNullRole && path !== CUSTOMER_CHOOSE_ROLE_PATH && path !== '/me') {
    return <Navigate to={CUSTOMER_CHOOSE_ROLE_PATH} replace />;
  }
  if (allow && role && role !== allow) {
    return <Navigate to={accountHomePath(account)} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/**
 * 站点信息架构（单一外壳，不再有第二套 H5 界面）
 * ------------------------------------------------------------------
 *   /                 落地页（已登录 → 角色首页）
 *   /tutors           找家教（**仅游客可见**；登录后回到自己的首页）
 *   /tutors/:id       家教详情
 *   /demands          需求池（老师视角：所有学生发布的需求）
 *   /demands/mine     我的需求（学生视角）
 *   /demands/new      发布需求（学生）
 *   /demands/:id/edit 编辑需求（学生）
 *   /plaza             广场（所有人审核通过的帖子）
 *   /me               我的主页（老师：身份头+简历+帖子；学生：身份头+老师申请+帖子）
 *   /u/:accountId     公开主页独立页；访问自己的 id 会重定向回 /me
 *   /forgot-password  找回密码（邮箱验证码 + 新密码）
 *   /choose-role      选择身份
 *   /admin/**         管理后台（独立外壳）
 *
 * 旧地址（/h5、/h5/tutor、/teacher、/student、/u/:accountId…）统一 301 式重定向到新地址，
 * 老书签和聊天里发出去的链接都不会 404。
 */
export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<FullPageSpinner text="正在加载页面…" />}>
        <Routes>
          {/* ============================ 客户侧 ============================ */}
          <Route element={<CustomerLayout />}>
            <Route index element={<CustomerLanding />} />

            {/* 公开内容：仅访客可见；登录后（老师/学生）都会回到自己的首页 */}
            <Route element={<RequireGuestOnly />}>
              <Route path="tutors" element={<TutorList />} />
              <Route path="tutors/:id" element={<TutorDetail />} />
            </Route>

            {/* 广场：登录后即可浏览（只显示审核通过的帖子） */}
            <Route element={<RequireCustomer allowNullRole />}>
              <Route path="plaza" element={<Plaza />} />
            </Route>

            {/* 已登录即可访问（role 为 null 时放行：/choose-role 与 /me） */}
            <Route element={<RequireCustomer allowNullRole />}>
              <Route path="choose-role" element={<ChooseRole />} />
              <Route path="me" element={<CustomerProfile />} />
            </Route>

            {/* 老师端：所有学生发布的需求 */}
            <Route element={<RequireCustomer allow="TEACHER" />}>
              <Route path="demands" element={<TeacherDemands />} />
            </Route>

            {/* 学生端：我的需求 + 发布 / 编辑 */}
            <Route element={<RequireCustomer allow="STUDENT" />}>
              <Route path="demands/mine" element={<StudentDemands />} />
              <Route path="demands/new" element={<DemandForm />} />
              <Route path="demands/:id/edit" element={<DemandForm />} />
            </Route>
          </Route>

          {/* 客户登录 / 注册 / 找回密码（全屏，不套用客户区外壳） */}
          <Route path="/login" element={<CustomerLogin />} />
          <Route path="/register" element={<CustomerRegister />} />
          <Route path="/forgot-password" element={<CustomerForgotPassword />} />

          {/* ======================== 旧地址重定向 ======================== */}
          <Route path="/h5" element={<Redirect to="/" />} />
          <Route path="/h5/tutor" element={<Redirect to="/tutors" keepSearch />} />
          <Route path="/h5/tutor/:id" element={<TutorDetailLegacy />} />
          <Route path="/h5/my" element={<Redirect to="/me" />} />
          {/* 公开主页不再是独立页面：并进 /me 的「公开主页」标签页，老链接照样能用 */}
          <Route path="/u/:accountId" element={<Redirect to="/me" />} />
          <Route path="/teacher" element={<Redirect to="/demands" />} />
          <Route path="/student" element={<Redirect to="/demands/mine" />} />
          <Route path="/student/new" element={<Redirect to="/demands/new" />} />
          <Route path="/student/:id/edit" element={<LegacyEditDemand />} />

          {/* ========================= 管理后台 ========================= */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="tutor" element={<AdminTutorList />} />
            {/* 入驻老师 / 入驻学生：都来自客户侧邮箱注册的账号（t_customer_account） */}
            <Route path="teacher" element={<AdminCustomerAccountList role="TEACHER" />} />
            <Route path="student" element={<AdminCustomerAccountList role="STUDENT" />} />
            <Route path="post" element={<AdminPostAuditList />} />
            <Route path="wxuser" element={<AdminWxUserList />} />
            <Route path="user" element={<AdminSystemUserList />} />
            <Route path="role" element={<AdminRoleList />} />
            <Route path="online" element={<AdminOnlineUsers />} />
            <Route path="logininfor" element={<AdminLoginLogList />} />
            <Route path="operlog" element={<AdminOperLogList />} />
            <Route path="server" element={<AdminServerMonitor />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route path="*" element={<AdminNotFound />} />
          </Route>

          {/* 顶层兜底 404 用客户侧那份：根路径属于客户 */}
          <Route element={<CustomerLayout />}>
            <Route path="*" element={<CustomerNotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

/** 旧 /h5/tutor/:id → /tutors/:id */
function TutorDetailLegacy() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tutors/${id ?? ''}`} replace />;
}

/** 旧 /student/:id/edit → /demands/:id/edit */
function LegacyEditDemand() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/demands/${id ?? ''}/edit`} replace />;
}

export default AppRoutes;
