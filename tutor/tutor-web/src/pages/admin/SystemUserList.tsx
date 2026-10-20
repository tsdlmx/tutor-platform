import * as systemApi from '@/api/system';
import { COMMON_STATUS, formatDateTime, genderLabel, resolveAssetUrl } from '@/lib/constants';
import type { SysUser } from '@/types/api';
import { Avatar, Badge } from '@/components/ui';
import { SimpleListPage, type SimpleListConfig } from '@/pages/admin/SimpleListPage';

function statusBadge(v?: string) {
  const meta = COMMON_STATUS[v ?? '0'];
  return <Badge tone={meta?.tone ?? 'muted'}>{meta?.label ?? '未知'}</Badge>;
}

const config: SimpleListConfig<SysUser> = {
  title: '系统用户',
  description: '后台登录账号、所属部门与账号状态',
  filters: [
    { name: 'userName', label: '登录名称', type: 'input', placeholder: '如 admin' },
    { name: 'phonenumber', label: '手机号码', type: 'input', placeholder: '如 13800000000' },
    {
      name: 'status',
      label: '用户状态',
      type: 'select',
      options: [
        { label: '正常', value: '0' },
        { label: '停用', value: '1' },
      ],
    },
  ],
  fetch: (query) => systemApi.listUser(query),
  rowKey: (row, i) => row.userId ?? `row-${i}`,
  columns: [
    {
      key: 'userName',
      title: '用户',
      width: '200px',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={resolveAssetUrl(u.avatar)} name={u.nickName ?? u.userName} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{u.nickName || u.userName || '—'}</p>
            <p className="truncate text-2xs text-muted-foreground">{u.userName ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'dept', title: '所属部门', width: '150px', render: (u) => u.dept?.deptName ?? '—' },
    { key: 'phonenumber', title: '手机号码', width: '140px' },
    { key: 'email', title: '邮箱', width: '180px' },
    { key: 'sex', title: '性别', width: '80px', render: (u) => genderLabel(u.sex) },
    { key: 'status', title: '状态', width: '90px', render: (u) => statusBadge(u.status) },
    { key: 'createTime', title: '创建时间', width: '170px', render: (u) => formatDateTime(u.createTime) },
  ],
  detailTitle: (u) => u.nickName || u.userName || '用户详情',
  detailSections: (u) => [
    {
      title: '账号信息',
      fields: [
        { label: '用户编号', value: u.userId },
        { label: '登录名称', value: u.userName, copyable: true },
        { label: '用户昵称', value: u.nickName },
        { label: '所属部门', value: u.dept?.deptName },
        { label: '手机号码', value: u.phonenumber, copyable: true },
        { label: '邮箱', value: u.email, copyable: true },
        { label: '性别', value: genderLabel(u.sex) },
        { label: '状态', value: statusBadge(u.status) },
        { label: '创建时间', value: formatDateTime(u.createTime) },
        { label: '最后登录 IP', value: u.loginIp },
        { label: '最后登录时间', value: formatDateTime(u.loginDate) },
        { label: '备注', value: u.remark, span: 2 },
      ],
    },
    {
      title: '角色',
      fields: [{ label: '已分配角色', value: (u.roles ?? []).map((r) => r.roleName).join('、'), span: 2, fallback: '未分配' }],
    },
  ],
};

export default function SystemUserList() {
  return <SimpleListPage config={config} />;
}
