import * as systemApi from '@/api/system';
import { COMMON_STATUS, emptyText, formatDateTime } from '@/lib/constants';
import type { SysRole } from '@/types/api';
import { Badge } from '@/components/ui';
import { SimpleListPage, type SimpleListConfig } from '@/pages/admin/SimpleListPage';

function statusBadge(v?: string) {
  const meta = COMMON_STATUS[v ?? '0'];
  return <Badge tone={meta?.tone ?? 'muted'}>{meta?.label ?? '未知'}</Badge>;
}

const config: SimpleListConfig<SysRole> = {
  title: '角色管理',
  description: '后台角色、权限字符与数据范围配置',
  filters: [
    { name: 'roleName', label: '角色名称', type: 'input', placeholder: '如 管理员' },
    { name: 'roleKey', label: '权限字符', type: 'input', placeholder: '如 admin' },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      options: [
        { label: '正常', value: '0' },
        { label: '停用', value: '1' },
      ],
    },
  ],
  fetch: (query) => systemApi.listRole(query),
  rowKey: (row, i) => row.roleId ?? `row-${i}`,
  columns: [
    {
      key: 'roleName',
      title: '角色名称',
      width: '180px',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{emptyText(r.roleName)}</span>
          {r.admin ? <Badge tone="info">内置</Badge> : null}
        </div>
      ),
    },
    { key: 'roleKey', title: '权限字符', width: '160px' },
    { key: 'roleSort', title: '显示顺序', width: '90px', align: 'right' },
    { key: 'status', title: '状态', width: '90px', render: (r) => statusBadge(r.status) },
    { key: 'createTime', title: '创建时间', width: '160px', render: (r) => formatDateTime(r.createTime) },
    {
      key: 'remark',
      title: '备注',
      render: (r) => <span className="text-2xs text-muted-foreground">{emptyText(r.remark)}</span>,
    },
  ],
  detailTitle: (r) => r.roleName ?? '角色详情',
  detailSections: (r) => [
    {
      title: '角色信息',
      fields: [
        { label: '角色编号', value: r.roleId },
        { label: '角色名称', value: r.roleName },
        { label: '权限字符', value: r.roleKey, copyable: true },
        { label: '显示顺序', value: r.roleSort },
        { label: '数据范围', value: r.dataScope },
        { label: '状态', value: statusBadge(r.status) },
        { label: '创建时间', value: formatDateTime(r.createTime) },
        { label: '备注', value: r.remark, span: 2 },
      ],
    },
  ],
};

export default function RoleList() {
  return <SimpleListPage config={config} />;
}
