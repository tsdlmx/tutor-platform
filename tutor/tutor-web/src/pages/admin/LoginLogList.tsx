import * as monitorApi from '@/api/monitor';
import { formatDateTime } from '@/lib/constants';
import type { LoginInfor } from '@/types/api';
import { Badge } from '@/components/ui';
import { SimpleListPage, type SimpleListConfig } from '@/pages/admin/SimpleListPage';

const config: SimpleListConfig<LoginInfor> = {
  title: '登录日志',
  description: '后台账号的登录记录与登录来源',
  filters: [
    { name: 'userName', label: '登录名称', type: 'input', placeholder: '如 admin' },
    { name: 'ipaddr', label: '登录地址', type: 'input', placeholder: '如 127.0.0.1' },
    {
      name: 'status',
      label: '登录状态',
      type: 'select',
      options: [
        { label: '成功', value: '0' },
        { label: '失败', value: '1' },
      ],
    },
  ],
  fetch: (query) => monitorApi.listLoginInfor(query),
  rowKey: (row, i) => row.infoId ?? `row-${i}`,
  columns: [
    { key: 'infoId', title: '访问编号', width: '100px', align: 'right' },
    { key: 'userName', title: '用户名称', width: '130px' },
    { key: 'ipaddr', title: '登录地址', width: '140px' },
    { key: 'loginLocation', title: '登录地点', width: '140px' },
    { key: 'browser', title: '浏览器', width: '120px' },
    { key: 'os', title: '操作系统', width: '120px' },
    {
      key: 'status',
      title: '登录状态',
      width: '100px',
      render: (r) =>
        r.status === '0' ? (
          <Badge tone="success" dot>
            成功
          </Badge>
        ) : (
          <Badge tone="danger" dot>
            失败
          </Badge>
        ),
    },
    { key: 'msg', title: '操作信息' },
    { key: 'loginTime', title: '登录时间', width: '170px', render: (r) => formatDateTime(r.loginTime) },
  ],
  detailSections: (r) => [
    {
      title: '登录详情',
      fields: [
        { label: '访问编号', value: r.infoId },
        { label: '用户名称', value: r.userName },
        { label: '登录地址', value: r.ipaddr, copyable: true },
        { label: '登录地点', value: r.loginLocation },
        { label: '浏览器', value: r.browser },
        { label: '操作系统', value: r.os },
        {
          label: '登录状态',
          value: r.status === '0' ? <Badge tone="success">成功</Badge> : <Badge tone="danger">失败</Badge>,
        },
        { label: '登录时间', value: formatDateTime(r.loginTime) },
        { label: '操作信息', value: r.msg, span: 2 },
      ],
    },
  ],
};

export default function LoginLogList() {
  return <SimpleListPage config={config} />;
}
