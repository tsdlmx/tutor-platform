import { requestData, requestPage } from '@/api/request';
import type { LoginInfor, OnlineUser, OperLog, PageQuery, ServerInfo } from '@/types/api';

/** GET /monitor/online/list */
export function listOnline(query: PageQuery & { userName?: string; ipaddr?: string } = {}) {
  return requestPage<OnlineUser>({ baseURL: '/admin-api', url: '/monitor/online/list', method: 'get', params: query });
}

/** DELETE /monitor/online/{tokenId} —— 强退 */
export function forceLogout(tokenId: string) {
  return requestData<unknown>({ baseURL: '/admin-api', url: `/monitor/online/${tokenId}`, method: 'delete' });
}

/** GET /monitor/logininfor/list —— 读 Go 侧的登录审计（sys_login_audit） */
export function listLoginInfor(
  query: PageQuery & { userName?: string; ipaddr?: string; status?: string; beginTime?: string; endTime?: string } = {},
) {
  return requestPage<LoginInfor>({ baseURL: '/admin-api', url: '/monitor/logininfor/list', method: 'get', params: query });
}

/** GET /monitor/operlog/list */
export function listOperLog(
  query: PageQuery & { title?: string; operName?: string; businessType?: number; status?: number } = {},
) {
  return requestPage<OperLog>({ url: '/monitor/operlog/list', method: 'get', params: query });
}

/** GET /monitor/server —— Go 服务的宿主机与运行时指标 */
export function getServerInfo() {
  return requestData<ServerInfo>({ baseURL: '/admin-api', url: '/monitor/server', method: 'get' });
}
