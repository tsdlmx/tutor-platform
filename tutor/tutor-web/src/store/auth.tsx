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
import * as authApi from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/request';
import { getCompat, postCompat } from '@/lib/httpCompat';
import { tokenStore } from '@/lib/storage';
import { HOME_PATH } from '@/lib/constants';
import { toast } from '@/components/ui/use-toast';
import type { LoginInfo, SysUser } from '@/types/api';

export const LOGIN_PATH = '/admin/login';

export interface AuthContextValue {
  user: SysUser | null;
  roles: string[];
  permissions: string[];
  /** 首次校验 token 期间为 true */
  booting: boolean;
  /** 是否已登录（有 token 且 getInfo 成功） */
  authenticated: boolean;
  login: (body: authApi.LoginBody) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** 权限判断：支持单个或数组（任一命中即可）；管理员或 *:*:* 直接放行 */
  hasPermi: (perm?: string | string[]) => boolean;
  hasRole: (role?: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY = { user: null as SysUser | null, roles: [] as string[], permissions: [] as string[] };

/**
 * 取回登录 token：
 * 主路径 authApi.login()（解包 .data）；
 * 兜底 RuoYi 原生 /login 返回 { code, msg, token }（字段平铺，无 data 包装）。
 */
async function resolveToken(body: authApi.LoginBody): Promise<string | undefined> {
  const res = await authApi.login(body);
  if (res?.token) return res.token;
  const flat = await postCompat<{ token?: string }>('/login', body);
  return flat?.token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<SysUser | null>(EMPTY.user);
  const [roles, setRoles] = useState<string[]>(EMPTY.roles);
  const [permissions, setPermissions] = useState<string[]>(EMPTY.permissions);
  const [booting, setBooting] = useState<boolean>(() => Boolean(tokenStore.get()));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setUser(null);
    setRoles([]);
    setPermissions([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      reset();
      return;
    }
    // 主路径：authApi.getInfo()（解包 .data）
    const info = await authApi.getInfo();
    let normalized: LoginInfo | undefined = info;
    // 兜底：部分 RuoYi 部署把 user/roles/permissions 平铺在根节点上
    if (!normalized?.user) {
      normalized = await getCompat<LoginInfo>('/getInfo');
    }
    if (!mounted.current) return;
    setUser(normalized?.user ?? null);
    setRoles(Array.isArray(normalized?.roles) ? normalized.roles : []);
    setPermissions(Array.isArray(normalized?.permissions) ? normalized.permissions : []);
  }, [reset]);

  /* 启动时用已有 token 换取用户信息 */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokenStore.get()) {
        setBooting(false);
        return;
      }
      try {
        await refresh();
      } catch {
        tokenStore.clear();
        if (alive) reset();
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh, reset]);

  /* 注册全局 401 处理：清 token + 跳登录（只在 AuthProvider 内部注册一次） */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      reset();
      toast.error('登录状态已过期', { description: '请重新登录后继续操作' });
      navigate(LOGIN_PATH, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, reset]);

  const login = useCallback(
    async (body: authApi.LoginBody) => {
      const token = await resolveToken(body);
      if (!token) throw new Error('登录响应缺少 token');
      tokenStore.set(token);
      try {
        await refresh();
      } catch (e) {
        // token 拿到了但 getInfo 失败：清掉，避免半登录状态
        tokenStore.clear();
        reset();
        throw e;
      }
    },
    [refresh, reset],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* 后端可能已失效，忽略 */
    }
    tokenStore.clear();
    reset();
    navigate(LOGIN_PATH, { replace: true });
  }, [navigate, reset]);

  const hasPermi = useCallback(
    (perm?: string | string[]) => {
      if (!perm || (Array.isArray(perm) && perm.length === 0)) return true;
      const list = Array.isArray(perm) ? perm : [perm];
      if (permissions.includes('*:*:*') || roles.includes('admin')) return true;
      return list.some((p) => permissions.includes(p));
    },
    [permissions, roles],
  );

  const hasRole = useCallback(
    (role?: string | string[]) => {
      if (!role || (Array.isArray(role) && role.length === 0)) return true;
      const list = Array.isArray(role) ? role : [role];
      return roles.includes('admin') || list.some((r) => roles.includes(r));
    },
    [roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      roles,
      permissions,
      booting,
      authenticated: Boolean(user),
      login,
      logout,
      refresh,
      hasPermi,
      hasRole,
    }),
    [user, roles, permissions, booting, login, logout, refresh, hasPermi, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内部使用');
  return ctx;
}

export { HOME_PATH };
