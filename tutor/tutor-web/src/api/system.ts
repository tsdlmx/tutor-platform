import { requestPage } from '@/api/request';
import type { PageQuery, SysRole, SysUser } from '@/types/api';

/**
 * 系统用户与角色，已迁移到 Go（/admin-api）。
 *
 * 这里只保留有页面引用的接口。部门、菜单、岗位、字典、参数、公告等模块目前
 * 在前端没有页面，Java 侧对应接口随 Java 退役；需要时按 Go 侧契约重新实现，
 * 不要再回挂到 /dev-api。
 */

/* ----------------------------- 系统用户 ----------------------------- */
export function listUser(query: PageQuery & { userName?: string; phonenumber?: string; status?: string; deptId?: number }) {
  return requestPage<SysUser>({ baseURL: '/admin-api', url: '/system/user/list', method: 'get', params: query });
}

/* ------------------------------- 角色 ------------------------------- */
export function listRole(query: PageQuery & { roleName?: string; roleKey?: string; status?: string }) {
  return requestPage<SysRole>({ baseURL: '/admin-api', url: '/system/role/list', method: 'get', params: query });
}
