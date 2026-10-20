import { requestData, requestPage } from '@/api/request';
import type {
  PageQuery,
  SysConfig,
  SysDept,
  SysDictData,
  SysDictType,
  SysMenu,
  SysNotice,
  SysPost,
  SysRole,
  SysUser,
} from '@/types/api';

/* ----------------------------- 系统用户 ----------------------------- */
export function listUser(query: PageQuery & { userName?: string; phonenumber?: string; status?: string; deptId?: number }) {
  return requestPage<SysUser>({ url: '/system/user/list', method: 'get', params: query });
}
export function getUser(userId: number) {
  return requestData<{ data: SysUser; roles: SysRole[]; posts: SysPost[] }>({
    url: `/system/user/${userId}`,
    method: 'get',
  });
}

/* ------------------------------- 角色 ------------------------------- */
export function listRole(query: PageQuery & { roleName?: string; roleKey?: string; status?: string }) {
  return requestPage<SysRole>({ url: '/system/role/list', method: 'get', params: query });
}

/* ------------------------------- 菜单 ------------------------------- */
export function listMenu(query: PageQuery & { menuName?: string; status?: string } = {}) {
  return requestPage<SysMenu>({ url: '/system/menu/list', method: 'get', params: query });
}

/* ------------------------------- 部门 ------------------------------- */
export function listDept(query: PageQuery & { deptName?: string; status?: string } = {}) {
  return requestPage<SysDept>({ url: '/system/dept/list', method: 'get', params: query });
}

/* ------------------------------- 岗位 ------------------------------- */
export function listPost(query: PageQuery & { postCode?: string; postName?: string; status?: string } = {}) {
  return requestPage<SysPost>({ url: '/system/post/list', method: 'get', params: query });
}

/* ----------------------------- 字典类型 ----------------------------- */
export function listDictType(query: PageQuery & { dictName?: string; dictType?: string; status?: string } = {}) {
  return requestPage<SysDictType>({ url: '/system/dict/type/list', method: 'get', params: query });
}

/* ----------------------------- 字典数据 ----------------------------- */
export function listDictData(query: PageQuery & { dictType?: string; dictLabel?: string; status?: string } = {}) {
  return requestPage<SysDictData>({ url: '/system/dict/data/list', method: 'get', params: query });
}

/* ------------------------------- 参数 ------------------------------- */
export function listConfig(query: PageQuery & { configName?: string; configKey?: string; configType?: string } = {}) {
  return requestPage<SysConfig>({ url: '/system/config/list', method: 'get', params: query });
}

/* ------------------------------- 公告 ------------------------------- */
export function listNotice(query: PageQuery & { noticeTitle?: string; noticeType?: string; createBy?: string } = {}) {
  return requestPage<SysNotice>({ url: '/system/notice/list', method: 'get', params: query });
}
