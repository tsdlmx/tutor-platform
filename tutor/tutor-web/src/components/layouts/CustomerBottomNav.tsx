import { Home, Megaphone, MessagesSquare, Search, UserRound, UserRoundCog } from 'lucide-react';
import { GooeyTabbar, type GooeyTabItem } from '@/components/rare/gooey-tabbar';
import { accountHomePath, useCustomerAuth } from '@/store/customerAuth';

/**
 * 客户侧移动底栏（全站只有这一套，不再区分 H5 / 客户区）。
 *
 *   * 未登录：首页 / 找家教 / 登录
 *   * 已登录未选身份：首页 / 选身份 / 找家教 / 我的
 *   * 老师：首页(/demands) / 广场 / 我的
 *   * 学生：首页(/demands/mine) / 发布需求 / 广场 / 我的
 *
 * 两个刻意的设计：
 *
 * 1. 「首页」= 当前身份的主页。登录后访问 `/` 会被 Landing 直接送到那里，
 *    所以底栏里不能再放一个「学生需求 / 我的需求」——那会是同一个页面（重复入口）。
 * 2. 「首页」的链接直接写角色地址而不是 `/`。否则当前路径是 /demands 时
 *    导航写的是 `/`，匹配不上，会出现「一栏都不高亮」。
 *
 * 「找家教」只给未登录访客（见 router 的 RequireGuestOnly）：
 * 老师不需要找老师，学生是「发需求等老师对接」，登录后都没有这个入口。
 *
 * 平台统计在页脚（CustomerFooter）。
 */
export function CustomerBottomNav() {
  const { account, authenticated } = useCustomerAuth();
  const role = account?.role ?? null;

  /** 首页地址：登录且选了身份就到角色主页，否则就是站点根 */
  const home = authenticated && role ? accountHomePath(account) : '/';
  const homeTab: GooeyTabItem = { to: home, label: '首页', icon: <Home />, end: true };
  const tutorTab: GooeyTabItem = { to: '/tutors', label: '找家教', icon: <Search /> };
  const plazaTab: GooeyTabItem = { to: '/plaza', label: '广场', icon: <MessagesSquare /> };
  const meTab: GooeyTabItem = { to: '/me', label: '我的', icon: <UserRound /> };

  const items: GooeyTabItem[] =
    role === 'TEACHER'
      ? // 老师：需求池 + 广场 + 我的（不需要「找老师」）
        [homeTab, plazaTab, meTab]
      : role === 'STUDENT'
        ? // 学生/家长：发需求 + 广场 + 我的（不需要逛家教库）
          [homeTab, { to: '/demands/new', label: '发布需求', icon: <Megaphone /> }, plazaTab, meTab]
        : authenticated
          ? [homeTab, { to: '/choose-role', label: '选身份', icon: <UserRoundCog /> }, plazaTab, meTab]
          : [homeTab, tutorTab, { to: '/login', label: '登录', icon: <UserRound /> }];

  return (
    <GooeyTabbar
      items={items}
      idPrefix={`customer-${role ?? (authenticated ? 'norole' : 'guest')}`}
      className="md:hidden"
    />
  );
}

export default CustomerBottomNav;
