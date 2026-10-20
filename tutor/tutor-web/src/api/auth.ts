import { requestData, requestOk } from '@/api/request';
import type { CaptchaImage, LoginInfo, SysUser } from '@/types/api';

export interface LoginBody {
  username: string;
  password: string;
  code: string;
  uuid: string;
}

/** GET /captchaImage —— 无需 token */
export function getCaptchaImage() {
  return requestData<CaptchaImage>({ baseURL: '/admin-api', url: '/captchaImage', method: 'get' });
}

/** POST /login */
export function login(body: LoginBody) {
  return requestData<{ token: string }>({ baseURL: '/admin-api', url: '/login', method: 'post', data: body });
}

/** POST /logout */
export function logout() {
  return requestOk({ baseURL: '/admin-api', url: '/logout', method: 'post' });
}

/** GET /getInfo —— 返回 {user, roles, permissions} */
export function getInfo() {
  return requestData<LoginInfo>({ baseURL: '/admin-api', url: '/getInfo', method: 'get' });
}

/** GET /system/user/profile */
export function getProfile() {
  return requestData<{ user: SysUser; roleGroup: string; postGroup: string }>({
    baseURL: '/admin-api',
    url: '/system/user/profile',
    method: 'get',
  });
}

/** PUT /system/user/profile —— 修改个人资料 */
export function updateProfile(data: Partial<SysUser>) {
  return requestOk({ baseURL: '/admin-api', url: '/system/user/profile', method: 'put', data });
}

/** PUT /system/user/profile/updatePwd */
export function updateUserPwd(oldPassword: string, newPassword: string) {
  return requestOk({
    baseURL: '/admin-api',
    url: '/system/user/profile/updatePwd',
    method: 'put',
    data: { oldPassword, newPassword },
  });
}
