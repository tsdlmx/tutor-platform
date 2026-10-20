import { requestData, requestOk, requestPage } from '@/api/request';
import type { TutorInfo, TutorQuery } from '@/types/api';

/** GET /system/tutorInfo/list -> {code,total,rows} */
export function listTutor(query: TutorQuery) {
  return requestPage<TutorInfo>({ url: '/system/tutorInfo/list', method: 'get', params: query });
}

/** GET /system/tutorInfo/{tutorId} */
export function getTutor(tutorId: number) {
  return requestData<TutorInfo>({ url: `/system/tutorInfo/${tutorId}`, method: 'get' });
}

export interface AuditPayload {
  tutorId: number;
  /** 0待审核 1审核通过 2审核拒绝 */
  auditStatus: string;
  auditRemark?: string;
}

/** PUT /system/tutorInfo/audit —— 核心审核接口 */
export function auditTutor(payload: AuditPayload) {
  return requestOk({ url: '/system/tutorInfo/audit', method: 'put', data: payload });
}

/** PUT /system/tutorInfo */
export function updateTutor(data: Partial<TutorInfo>) {
  return requestOk({ url: '/system/tutorInfo', method: 'put', data });
}

/** DELETE /system/tutorInfo/{ids} */
export function deleteTutor(ids: number | number[]) {
  const path = Array.isArray(ids) ? ids.join(',') : String(ids);
  return requestOk({ url: `/system/tutorInfo/${path}`, method: 'delete' });
}
