import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { tokenStore } from '@/lib/storage';
import { mockAdapter } from '@/mock';
import type { ApiResult } from '@/types/api';

/** 全局未授权回调 —— 由 AuthProvider 注册 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
  }
}

const useMock = String(import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';

/** rare-ui 风格：把所有 axios 实例统一在一个 axios 对象上，带统一拦截器 */
const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/dev-api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json;charset=utf-8' },
  ...(useMock ? { adapter: mockAdapter } : {}),
});

/* ---------------------------- 请求拦截 ---------------------------- */
http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStore.get();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // GET 请求去掉 undefined / '' 参数，避免后端收到空串
    if (config.params) {
      const cleaned: Record<string, unknown> = {};
      Object.entries(config.params as Record<string, unknown>).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
      });
      config.params = cleaned;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

/* ---------------------------- 响应拦截 ---------------------------- */
http.interceptors.response.use(
  (response: AxiosResponse) => {
    const payload = response.data as ApiResult | undefined;
    // 非 JSON 包装（例如下载流）直接返回
    if (!payload || typeof payload.code !== 'number') return response;

    if (payload.code === 401) {
      tokenStore.clear();
      onUnauthorized?.();
      return Promise.reject(new ApiError(401, payload.msg || '登录状态已过期，请重新登录'));
    }
    if (payload.code !== 200) {
      return Promise.reject(new ApiError(payload.code, payload.msg || '请求失败'));
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      tokenStore.clear();
      onUnauthorized?.();
      return Promise.reject(new ApiError(401, '登录状态已过期，请重新登录'));
    }
    const data = error.response?.data as ApiResult | undefined;
    const msg =
      data?.msg ||
      (error.code === 'ECONNABORTED' ? '请求超时，请检查后端服务' : error.message) ||
      '网络异常';
    return Promise.reject(new ApiError(status ?? -1, msg));
  },
);

/** 取回 {code,msg,data} 里的 data */
export async function requestData<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request<ApiResult<T>>(config);
  return res.data.data as T;
}

/** 取回 {code,total,rows} 整个分页体 */
export async function requestPage<T>(config: AxiosRequestConfig): Promise<{ total: number; rows: T[] }> {
  const res = await http.request<{ code: number; total: number; rows: T[] }>(config);
  return { total: res.data.total ?? 0, rows: res.data.rows ?? [] };
}

/** 只关心成功/失败（增删改） */
export async function requestOk(config: AxiosRequestConfig): Promise<string> {
  const res = await http.request<ApiResult>(config);
  return res.data.msg || '操作成功';
}

export default http;
