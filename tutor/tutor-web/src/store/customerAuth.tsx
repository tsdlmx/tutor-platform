import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as customerApi from '@/api/customer';
import {
  CustomerApiError,
  customerTokenStore,
  setCustomerUnauthorizedHandler,
  type CustomerAccount,
  type Role,
} from '@/api/customer';
import { toast } from '@/components/ui/use-toast';

/** 客户侧登录页 —— 401 时统一跳这里（与后台 /admin/login 无关） */
export const CUSTOMER_LOGIN_PATH = '/login';
export const CUSTOMER_CHOOSE_ROLE_PATH = '/choose-role';

/** 身份对应的首页：老师 → /teacher，学生 → /student，未选身份 → /choose-role */
export function roleHomePath(role?: Role | null): string {
  if (role === 'TEACHER') return '/demands';
  if (role === 'STUDENT') return '/demands/mine';
  return CUSTOMER_CHOOSE_ROLE_PATH;
}

export function accountHomePath(account?: CustomerAccount | null): string {
  return roleHomePath(account?.role ?? null);
}

export interface CustomerAuthContextValue {
  /** 当前登录的客户账号（未登录为 null） */
  account: CustomerAccount | null;
  /** 首次用 token 换 me 期间为 true（避免守卫把已登录用户踢到登录页） */
  loading: boolean;
  /** 有 token 且 /auth/me 成功 */
  authenticated: boolean;
  login: (body: customerApi.LoginBody) => Promise<CustomerAccount>;
  register: (body: customerApi.RegisterBody) => Promise<CustomerAccount>;
  logout: () => Promise<void>;
  setRole: (role: Role) => Promise<CustomerAccount>;
  refresh: () => Promise<CustomerAccount | null>;
  /** 便捷判断：不传 role 表示「只要登录了就算通过」 */
  requireRole: (role?: Role) => boolean;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(customerTokenStore.get()));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** 用当前 token 拉取账号信息；没 token 直接清空 */
  const refresh = useCallback(async () => {
    if (!customerTokenStore.get()) {
      setAccount(null);
      return null;
    }
    const info = await customerApi.me();
    if (mounted.current) setAccount(info ?? null);
    return info ?? null;
  }, []);

  /* 启动引导：有 token 就换账号信息，失败则视为登录失效 */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!customerTokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        await refresh();
      } catch {
        customerTokenStore.clear();
        if (alive) setAccount(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  /* 注册全局 401 处理：清客户 token + 跳客户登录页（只注册一次） */
  useEffect(() => {
    setCustomerUnauthorizedHandler(() => {
      customerTokenStore.clear();
      setAccount(null);
      toast.error('登录状态已过期', { description: '请重新登录后继续操作' });
      navigate(CUSTOMER_LOGIN_PATH, { replace: true });
    });
    return () => setCustomerUnauthorizedHandler(null);
  }, [navigate]);

  /**
   * 登录 / 注册成功后的收尾：写 token → 用 me 拿最新账号。
   * me 只是「补全信息」，失败不阻断（后端刚写完库时偶发不一致）；
   * 但如果是 401（token 无效），必须抛出去，让页面提示失败。
   */
  const applyAuth = useCallback(async (payload: customerApi.AuthPayload): Promise<CustomerAccount> => {
    if (!payload?.token) throw new Error('登录响应缺少 token');
    customerTokenStore.set(payload.token);
    if (payload.account && mounted.current) setAccount(payload.account);
    try {
      const info = await customerApi.me();
      if (info) {
        if (mounted.current) setAccount(info);
        return info;
      }
    } catch (e) {
      if (e instanceof CustomerApiError && e.code === 401) {
        customerTokenStore.clear();
        if (mounted.current) setAccount(null);
        throw e;
      }
    }
    if (payload.account) return payload.account;
    // token 拿到了但账号信息完全缺失：宁可报错，也不要进半登录状态
    customerTokenStore.clear();
    if (mounted.current) setAccount(null);
    throw new Error('登录响应异常，请稍后重试');
  }, []);

  const login = useCallback(
    async (body: customerApi.LoginBody) => {
      const payload = await customerApi.login(body);
      return applyAuth(payload);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (body: customerApi.RegisterBody) => {
      const payload = await customerApi.register(body);
      return applyAuth(payload);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await customerApi.logout();
    } catch {
      /* 后端会话可能已失效，忽略 */
    }
    customerTokenStore.clear();
    setAccount(null);
    toast.success('已退出登录');
    navigate('/', { replace: true });
  }, [navigate]);

  const setRole = useCallback(
    async (role: Role) => {
      const info = await customerApi.setRole(role);
      // 后端可能只回部分字段（甚至只回 msg）：以当前账号为底合并，并强制写入本次选择的身份，
      // 否则守卫会因为拿不到 role 又把人送回 /choose-role。
      const base: CustomerAccount = account ?? { email: info?.email ?? '' };
      const next: CustomerAccount = {
        ...base,
        ...(info?.email ? { email: info.email } : {}),
        ...(info?.nickname ? { nickname: info.nickname } : {}),
        ...(info?.createTime ? { createTime: info.createTime } : {}),
        ...(info?.accountId != null ? { accountId: info.accountId } : {}),
        role,
      };
      if (mounted.current) setAccount(next);
      return next;
    },
    [account],
  );

  const requireRole = useCallback((role?: Role) => !role || account?.role === role, [account]);

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      account,
      loading,
      authenticated: Boolean(account),
      login,
      register,
      logout,
      setRole,
      refresh,
      requireRole,
    }),
    [account, loading, login, register, logout, setRole, refresh, requireRole],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth 必须在 <CustomerAuthProvider> 内部使用');
  return ctx;
}
