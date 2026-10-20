import { requestData } from '@/api/request';
import type { MiniappLoginState, MiniappTutorListQuery, TutorInfo } from '@/types/api';

/**
 * GET /miniapp/tutor/list —— 公开接口，无需 token
 * 注意返回体是 {code,msg,data:[...]}，不是 {total,rows}
 */
export function listPublicTutors(query: MiniappTutorListQuery = {}) {
  return requestData<TutorInfo[]>({ url: '/miniapp/tutor/list', method: 'get', params: query });
}

/** GET /miniapp/tutor/detail/{tutorId} —— 公开接口 */
export function getPublicTutorDetail(tutorId: number) {
  return requestData<TutorInfo>({ url: `/miniapp/tutor/detail/${tutorId}`, method: 'get' });
}

/** GET /miniapp/auth/checkLogin —— 公开接口，返回 {isLogin,userId} */
export function checkLogin() {
  return requestData<MiniappLoginState>({ url: '/miniapp/auth/checkLogin', method: 'get' });
}
