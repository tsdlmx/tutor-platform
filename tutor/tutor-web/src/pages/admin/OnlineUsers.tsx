import * as monitorApi from '@/api/monitor';
import { formatDateTime } from '@/lib/constants';
import type { OnlineUser } from '@/types/api';
import { Badge, toast } from '@/components/ui';
import { DeleteButton } from '@/components/rare';
import { SimpleListPage, type SimpleListConfig } from '@/pages/admin/SimpleListPage';

const config: SimpleListConfig<OnlineUser> = {
  title: '在线用户',
  description: '当前登录的会话列表，可按会话强制退出',
  filters: [
    { name: 'userName', label: '登录名称', type: 'input', placeholder: '如 admin' },
    { name: 'ipaddr', label: '登录地址', type: 'input', placeholder: '如 127.0.0.1' },
  ],
  fetch: (query) => monitorApi.listOnline(query),
  rowKey: (row, i) => row.tokenId ?? `row-${i}`,
  columns: [
    {
      key: 'tokenId',
      title: '会话编号',
      width: '180px',
      render: (r) => (
        <span className="block max-w-[160px] truncate font-mono text-2xs text-muted-foreground" title={r.tokenId}>
          {r.tokenId}
        </span>
      ),
    },
    { key: 'userName', title: '登录名称', width: '120px' },
    { key: 'deptName', title: '所属部门', width: '130px' },
    { key: 'ipaddr', title: '主机', width: '130px' },
    { key: 'loginLocation', title: '登录地点', width: '140px' },
    { key: 'browser', title: '浏览器', width: '120px' },
    { key: 'os', title: '操作系统', width: '120px' },
    {
      key: 'loginTime',
      title: '登录时间',
      width: '170px',
      render: (r) => formatDateTime(r.loginTime),
    },
    {
      key: 'flag',
      title: '状态',
      width: '90px',
      render: () => (
        <Badge tone="success" dot>
          在线
        </Badge>
      ),
    },
  ],
  rowActions: (row, { reload }) => (
    <DeleteButton
      label="强退"
      confirmLabel="确认强退"
      onConfirm={async () => {
        try {
          await monitorApi.forceLogout(row.tokenId);
          toast.success('已强制退出该会话', { description: row.userName });
          reload();
        } catch (e) {
          toast.error('强退失败', { description: e instanceof Error ? e.message : '未知错误' });
        }
      }}
    />
  ),
  detailSections: (r) => [
    {
      title: '会话信息',
      fields: [
        { label: '会话编号', value: r.tokenId, copyable: true, span: 2 },
        { label: '登录名称', value: r.userName },
        { label: '所属部门', value: r.deptName },
        { label: '主机', value: r.ipaddr },
        { label: '登录地点', value: r.loginLocation },
        { label: '浏览器', value: r.browser },
        { label: '操作系统', value: r.os },
        { label: '登录时间', value: formatDateTime(r.loginTime) },
      ],
    },
  ],
};

export default function OnlineUsers() {
  return <SimpleListPage config={config} />;
}
