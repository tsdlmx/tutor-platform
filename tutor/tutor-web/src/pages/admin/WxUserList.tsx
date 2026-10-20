import { useCallback, useState } from 'react';
import { Eye, MessageSquare, RefreshCw } from 'lucide-react';
import * as wxUserApi from '@/api/wxuser';
import { COMMON_STATUS, WX_USER_TYPE, emptyText, formatDateTime, resolveAssetUrl } from '@/lib/constants';
import type { WxUser } from '@/types/api';
import { Avatar, Badge, Button, Field, Input, Select } from '@/components/ui';
import { DataTable, DetailDrawer, FilterBar, PageHeader, type DataColumn } from '@/components/common';
import { usePagedList } from '@/hooks/usePagedList';

interface FilterState {
  nickname: string;
  phone: string;
  userType: string;
  status: string;
}

const EMPTY: FilterState = { nickname: '', phone: '', userType: '', status: '' };

function genderOf(v?: number) {
  if (v === 1) return '男';
  if (v === 2) return '女';
  return '未知';
}

export default function WxUserList() {
  const [draft, setDraft] = useState<FilterState>(EMPTY);
  const [detail, setDetail] = useState<WxUser | null>(null);
  const list = usePagedList<WxUser>((query) => wxUserApi.listWxUser(query), { pageSize: 10 });

  const onSearch = useCallback(() => {
    const next: Record<string, unknown> = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v) next[k] = v;
    });
    list.search(next);
  }, [draft, list]);

  const onReset = useCallback(() => {
    setDraft(EMPTY);
    list.search({});
  }, [list]);

  const columns: DataColumn<WxUser>[] = [
    {
      key: 'nickname',
      title: '用户',
      width: '210px',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={resolveAssetUrl(u.avatar)} name={u.nickname} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{emptyText(u.nickname)}</p>
            <p className="truncate text-2xs text-muted-foreground">ID: {u.userId ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'userType',
      title: '用户类型',
      width: '100px',
      render: (u) => <Badge tone="outline">{WX_USER_TYPE[u.userType ?? ''] ?? emptyText(u.userType)}</Badge>,
    },
    {
      key: 'openid',
      title: 'openid',
      width: '190px',
      render: (u) => (
        <span className="block max-w-[180px] truncate font-mono text-2xs text-muted-foreground" title={u.openid}>
          {emptyText(u.openid)}
        </span>
      ),
    },
    { key: 'phone', title: '手机号', width: '140px', render: (u) => emptyText(u.phone) },
    {
      key: 'parentNo',
      title: '关联身份',
      width: '150px',
      render: (u) => <span className="text-2xs text-muted-foreground">{u.parentNo || u.tutorNo || '未绑定'}</span>,
    },
    { key: 'points', title: '积分', width: '80px', align: 'right', render: (u) => u.points ?? 0 },
    {
      key: 'avgRating',
      title: '评分',
      width: '86px',
      align: 'right',
      render: (u) =>
        typeof u.avgRating === 'number' ? (
          <span className="tabular text-xs">{u.avgRating.toFixed(1)}</span>
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      title: '状态',
      width: '90px',
      render: (u) => {
        const meta = COMMON_STATUS[u.status ?? '0'];
        return <Badge tone={meta?.tone ?? 'muted'}>{meta?.label ?? '未知'}</Badge>;
      },
    },
    { key: 'lastLoginTime', title: '最近登录', width: '170px', render: (u) => formatDateTime(u.lastLoginTime) },
    {
      key: 'actions',
      title: '操作',
      width: '90px',
      align: 'right',
      render: (u) => (
        <Button size="sm" variant="ghost" onClick={() => setDetail(u)}>
          <Eye className="h-3.5 w-3.5" />
          详情
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="微信用户"
        description="小程序时期的微信用户历史数据，与当前邮箱账号体系无关联，仅作查阅"
        className="[&_h1]:text-base"
      >
        <Badge tone="muted" className="hidden sm:inline-flex">
          <MessageSquare className="h-3 w-3" />
          共 {list.total} 条
        </Badge>
        <Button variant="outline" size="sm" onClick={list.reload} disabled={list.loading}>
          <RefreshCw className={list.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      <FilterBar onSubmit={onSearch} onReset={onReset} loading={list.loading}>
        <Field label="昵称">
          <Input placeholder="支持模糊搜索" value={draft.nickname} onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))} />
        </Field>
        <Field label="手机号">
          <Input placeholder="如 13800000000" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
        </Field>
        <Field label="用户类型">
          <Select
            value={draft.userType}
            placeholder="全部类型"
            onChange={(e) => setDraft((d) => ({ ...d, userType: e.target.value }))}
            options={Object.entries(WX_USER_TYPE).map(([value, label]) => ({ label, value }))}
          />
        </Field>
        <Field label="状态">
          <Select
            value={draft.status}
            placeholder="全部状态"
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            options={Object.entries(COMMON_STATUS).map(([value, meta]) => ({ label: meta.label, value }))}
          />
        </Field>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(u, i) => u.userId ?? `row-${i}`}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(u) => setDetail(u)}
        headerTitle={`微信用户（${list.total} 条）`}
        emptyTitle="暂无微信用户数据"
        emptyDescription="历史数据为空，说明当前没有小程序时期导入的用户"
        pageNum={list.pageNum}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPageNum}
        onPageSizeChange={list.setPageSize}
        className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4"
      />

      <DetailDrawer
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={detail?.nickname ?? '微信用户详情'}
        description={detail ? `用户 ID ${detail.userId ?? '—'}` : undefined}
        sections={
          detail
            ? [
                {
                  title: '微信信息',
                  fields: [
                    { label: '用户ID', value: detail.userId },
                    { label: '昵称', value: detail.nickname },
                    { label: '性别', value: genderOf(detail.gender) },
                    { label: '手机号', value: detail.phone, copyable: true },
                    { label: 'openid', value: detail.openid, copyable: true, span: 2 },
                    { label: 'unionid', value: detail.unionid, copyable: true, span: 2 },
                  ],
                },
                {
                  title: '身份与统计',
                  fields: [
                    { label: '用户类型', value: WX_USER_TYPE[detail.userType ?? ''] ?? detail.userType },
                    { label: '邀请人ID', value: detail.inviterId },
                    { label: '家长编号（历史）', value: detail.parentNo },
                    { label: '家教编号', value: detail.tutorNo },
                    { label: '积分', value: detail.points ?? 0 },
                    { label: '平均评分', value: typeof detail.avgRating === 'number' ? detail.avgRating.toFixed(1) : undefined },
                    { label: '评价总数', value: detail.totalEvaluations ?? 0 },
                    {
                      label: '状态',
                      value: (
                        <Badge tone={COMMON_STATUS[detail.status ?? '0']?.tone ?? 'muted'}>
                          {COMMON_STATUS[detail.status ?? '0']?.label ?? '未知'}
                        </Badge>
                      ),
                    },
                    { label: '最近登录', value: formatDateTime(detail.lastLoginTime) },
                    { label: '创建时间', value: formatDateTime(detail.createTime) },
                    { label: '更新时间', value: formatDateTime(detail.updateTime) },
                    { label: '备注', value: detail.remark, span: 2 },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  );
}
