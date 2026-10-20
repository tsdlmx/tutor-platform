import axios, { type AxiosRequestConfig } from 'axios';
import type { ApiResult } from '@/types/api';

const publicWebHttp = axios.create({
  baseURL: import.meta.env.VITE_CUSTOMER_API_BASE_URL || '/web-api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json;charset=utf-8' },
});

/** Public Web routes deliberately use an unauthenticated client. */
export async function requestPublicWebData<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await publicWebHttp.request<ApiResult<T>>(config);
  const body = response.data;
  if (!body || body.code !== 200) {
    throw new Error(body?.msg || '请求失败');
  }
  return body.data as T;
}
