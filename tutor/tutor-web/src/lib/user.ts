import { resolveAssetUrl } from '@/lib/constants';
import type { SysUser } from '@/types/api';

/** 取用户头像地址（后端返回相对路径时补全） */
export function avatarUrl(user?: SysUser | null): string | undefined {
  return resolveAssetUrl(user?.avatar);
}
