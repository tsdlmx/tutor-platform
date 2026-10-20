import { requestData, requestPage } from '@/api/request';

/**
 * 管理后台：客户帖子审核
 *
 * 客户发的帖子先落成「待审核」(audit_status=0)，后台通过后才出现在广场与个人主页。
 *
 * GET /system/userPost/list?auditStatus=0|1|2（不传 = 全部）
 * GET /system/userPost/pendingCount
 * PUT /system/userPost/audit  { postId, auditStatus, auditRemark? }
 */

export interface AdminUserPost {
  postId: number;
  accountId?: number;
  content?: string;
  images?: string | null;
  /** 0待审核 1通过 2拒绝 */
  auditStatus?: string | null;
  auditRemark?: string | null;
  auditTime?: string | null;
  createTime?: string | null;
  /** 作者昵称（后端关联客户账号给出） */
  authorName?: string | null;
  authorRole?: string | null;
  imageList?: string[];
}

export interface AdminUserPostQuery {
  pageNum?: number;
  pageSize?: number;
  auditStatus?: string;
}

export function listPosts(query: AdminUserPostQuery = {}) {
  return requestPage<AdminUserPost>({
    url: '/system/userPost/list',
    method: 'get',
    params: query,
  });
}

export function pendingCount() {
  return requestData<number>({ url: '/system/userPost/pendingCount', method: 'get' });
}

/** 审核：auditStatus 1 通过 / 2 拒绝（可带拒绝理由） */
export function auditPost(postId: number, auditStatus: '1' | '2', auditRemark?: string) {
  return requestData<string>({
    url: '/system/userPost/audit',
    method: 'put',
    data: { postId, auditStatus, auditRemark: auditRemark ?? null },
  });
}
