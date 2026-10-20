import { requestData } from '@/api/request';
import { requestPublicWebData } from '@/api/publicWeb';
import type { MiniappLoginState, MiniappTutorListQuery, TutorInfo } from '@/types/api';

/**
 * GET /miniapp/tutor/list —— 公开接口，无需 token
 * 注意返回体是 {code,msg,data:[...]}，不是 {total,rows}
 */
export function listPublicTutors(query: MiniappTutorListQuery = {}) {
  return requestPublicWebData<TutorInfo[]>({ url: '/miniapp/tutor/list', method: 'get', params: query });
}

/** GET /miniapp/tutor/detail/{tutorId} —— 公开接口 */
export function getPublicTutorDetail(tutorId: number) {
  return requestPublicWebData<TutorInfo>({ url: `/miniapp/tutor/detail/${tutorId}`, method: 'get' });
}

/** GET /miniapp/auth/checkLogin —— 公开接口，返回 {isLogin,userId} */
export function checkLogin() {
  return requestData<MiniappLoginState>({ baseURL: '/admin-api', url: '/miniapp/auth/checkLogin', method: 'get' });
}
