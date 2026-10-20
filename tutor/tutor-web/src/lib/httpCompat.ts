import http from '@/api/request';

/**
 * 响应形态兼容层。
 *
 * 背景：RuoYi 原生的 AjaxResult 会把字段平铺在响应根节点上，例如
 *   POST /login        -> { code, msg, token }
 *   GET  /getInfo      -> { code, msg, user, roles, permissions }
 *   GET  /captchaImage -> { code, img, uuid, captchaEnabled }
 *   GET  /monitor/server -> { code, msg, cpu, mem, jvm, sys, sysFiles }
 * 而本项目 src/api/*.ts 里的 requestData() 统一解包 `.data`（适用于
 * /miniapp/** 与 AjaxResult.success(data) 形态的接口，如 /system/tutorInfo/{id}）。
 *
 * 两种形态在后端都可能出现，因此这里提供一对"先取 .data、取不到就用根对象"的
 * 读取函数，仅在 authApi/monitorApi 等既有封装拿不到有效字段时作为兜底调用 ——
 * 不修改 src/api/** 的任何行为，只保证登录、验证码、服务监控在两种后端形态下都可用。
 */
function pick<T>(payload: unknown): T {
  const body = payload as Record<string, unknown> | undefined;
  if (body && typeof body === 'object' && body.data !== undefined && body.data !== null) {
    return body.data as T;
  }
  return (body ?? {}) as T;
}

/** GET，自动兼容 {code,data:{...}} 与 {code,...平铺} 两种形态 */
export async function getCompat<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await http.get(url, { params });
  return pick<T>(res.data);
}

/** POST，自动兼容两种形态 */
export async function postCompat<T>(url: string, data?: unknown): Promise<T> {
  const res = await http.post(url, data);
  return pick<T>(res.data);
}
