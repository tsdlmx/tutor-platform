import { requestData, requestPage } from '@/api/request';
import type { WxUser, WxUserQuery } from '@/types/api';

/** GET /system/wxUser/list */
export function listWxUser(query: WxUserQuery) {
  return requestPage<WxUser>({ url: '/system/wxUser/list', method: 'get', params: query });
}

/** GET /system/wxUser/{userId} */
export function getWxUser(userId: number) {
  return requestData<WxUser>({ url: `/system/wxUser/${userId}`, method: 'get' });
}
