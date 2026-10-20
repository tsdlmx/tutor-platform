import { DemandListPage } from './DemandListPage';

/**
 * 老师端首页 —— 「列出所有有需求的学生」。
 * 数据来自 GET /customer/demands（老师视角只返回未取消的需求，按时间倒序）。
 * 页面实现与「我的需求」共用 DemandListPage，这里只决定 scope。
 */
export default function TeacherHome() {
  return <DemandListPage scope="pool" />;
}
