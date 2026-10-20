import { requestData, requestPage } from '@/api/request';
import type { CustomerAccountQuery, CustomerAccountRow } from '@/types/api';

/**
 * 客户账号（管理后台视角）
 *
 * 客户用邮箱注册、自己选「老师」或「学生」，账号存在 t_customer_account，
 * 与后台自身的 sys_user 是两套东西。这里给后台提供只读查询 + 启用/停用。
 *
 * GET  /system/customerAccount/list?role=TEACHER|STUDENT
 * GET  /system/customerAccount/{accountId}
 * PUT  /system/customerAccount/status
 */
export function listAccounts(query: CustomerAccountQuery) {
  return requestPage<CustomerAccountRow>({
    baseURL: '/admin-api',
    url: '/system/customerAccount/list',
    method: 'get',
    params: query,
  });
}

export function getAccount(accountId: number) {
  return requestData<CustomerAccountRow>({
    baseURL: '/admin-api', url: `/system/customerAccount/${accountId}`,
    method: 'get',
  });
}

/** 启用 / 停用账号：status 0 正常，1 停用 */
export function updateAccountStatus(accountId: number, status: '0' | '1') {
  return requestData<null>({
    baseURL: '/admin-api',
    url: '/system/customerAccount/status',
    method: 'put',
    data: { accountId, status },
  });
}
