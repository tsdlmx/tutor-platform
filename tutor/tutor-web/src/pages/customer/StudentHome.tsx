import { DemandListPage } from './DemandListPage';

/**
 * 学生端首页 —— 我的需求列表：查看状态、编辑、取消、删除。
 * 页面实现与老师端需求池共用 DemandListPage，这里只决定 scope。
 */
export default function StudentHome() {
  return <DemandListPage scope="mine" />;
}
