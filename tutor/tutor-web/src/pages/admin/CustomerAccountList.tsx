import { useCallback, useState } from 'react';
import { Eye, GraduationCap, Power, RefreshCw, UserRound } from 'lucide-react';
import * as accountApi from '@/api/customerAccount';
import { COMMON_STATUS, emptyText, formatDateTime } from '@/lib/constants';
import type { CustomerAccountRow, CustomerRole } from '@/types/api';
import { Avatar, Badge, Button, Field, Input, Select, toast } from '@/components/ui';
import { DataTable, DetailDrawer, FilterBar, PageHeader, type DataColumn } from '@/components/common';
import { usePagedList } from '@/hooks/usePagedList';

/**
 * 客户账号列表（入驻老师 / 入驻学生共用一套）
 *
 * 这两页的数据不是原来的 t_parent_info / t_student_info，而是**客户侧自己注册**的账号
 * （t_customer_account）：客户用邮箱注册，注册完自己选身份。
 * 所以「入驻老师」= role=TEACHER，「入驻学生」= role=STUDENT。
 */

interface FilterState {
  email: string;
  nickname: string;
  status: string;
}

const EMPTY: FilterState = { email: '', nickname: '', status: '' };

const ROLE_META: Record<
  CustomerRole,
  { label: string; short: string; tone: 'info' | 'success'; icon: React.ReactNode }
> = {
  TEACHER: { label: '入驻老师', short: '老师', tone: 'info', icon: <GraduationCap className="h-3 w-3" /> },
  STUDENT: { label: '入驻学生', short: '学生', tone: 'success', icon: <UserRound className="h-3 w-3" /> },
};

export default function CustomerAccountList({ role }: { role: CustomerRole }) {
  const meta = ROLE_META[role];
  const [draft, setDraft] = useState<FilterState>(EMPTY);
  const [detail, setDetail] = useState<CustomerAccountRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const list = usePagedList<CustomerAccountRow>(
    (query) => accountApi.listAccounts({ ...(query as Record<string, unknown>), role } as never),
    { pageSize: 10 },
  );

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

  /** 启用 / 停用：停用后该账号在客户端登录会被拦下 */
  const toggleStatus = useCallback(
    async (row: CustomerAccountRow) => {
      if (row.accountId == null) return;
      const next = row.status === '1' ? '0' : '1';
      setBusyId(row.accountId);
      try {
        await accountApi.updateAccountStatus(row.accountId, next);
        toast.success(next === '1' ? '账号已停用' : '账号已启用');
        list.reload();
        setDetail((d) => (d && d.accountId === row.accountId ? { ...d, status: next } : d));
      } catch (e) {
        toast.error('操作失败', { description: e instanceof Error ? e.message : '请稍后重试' });
      } finally {
        setBusyId(null);
      }
    },
    [list],
  );

  const columns: DataColumn<CustomerAccountRow>[] = [
    {
      key: 'nickname',
      title: meta.label,
      width: '240px',
      render: (a) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={a.nickname || a.email} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{emptyText(a.nickname || a.email?.split('@')[0])}</p>
            <p className="truncate text-2xs text-muted-foreground">{emptyText(a.email)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      title: '身份',
      width: '104px',
      render: () => (
        <Badge tone={meta.tone}>
          {meta.icon}
          {meta.short}
        </Badge>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: '90px',
      render: (a) => {
        const s = COMMON_STATUS[a.status ?? '0'];
        return <Badge tone={s?.tone ?? 'muted'}>{s?.label ?? '未知'}</Badge>;
      },
    },
    {
      key: 'lastLoginTime',
      title: '最后登录',
      width: '170px',
      render: (a) => (a.lastLoginTime ? formatDateTime(a.lastLoginTime) : '—'),
    },
    { key: 'createTime', title: '注册时间', width: '170px', render: (a) => formatDateTime(a.createTime) },
    {
      key: 'actions',
      title: '操作',
      width: '190px',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDetail(a)}>
            <Eye className="h-3.5 w-3.5" />
            详情
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busyId === a.accountId}
            onClick={() => void toggleStatus(a)}
          >
            <Power className="h-3.5 w-3.5" />
            {a.status === '1' ? '启用' : '停用'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={meta.label}
        description={`客户在网站首页用邮箱注册、身份为${meta.short}的账号，可查看详情并启停用`}
        className="[&_h1]:text-base"
      >
        <Badge tone="muted" className="hidden sm:inline-flex">
          {meta.icon}
          共 {list.total} 条
        </Badge>
        <Button variant="outline" size="sm" onClick={list.reload} disabled={list.loading}>
          <RefreshCw className={list.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      <FilterBar onSubmit={onSearch} onReset={onReset} loading={list.loading}>
        <Field label="邮箱">
          <Input
            placeholder="支持模糊搜索"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
          />
        </Field>
        <Field label="昵称">
          <Input
            placeholder="支持模糊搜索"
            value={draft.nickname}
            onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))}
          />
        </Field>
        <Field label="状态">
          <Select
            value={draft.status}
            placeholder="全部状态"
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            options={Object.entries(COMMON_STATUS).map(([value, m]) => ({ label: m.label, value }))}
          />
        </Field>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(a, i) => a.accountId ?? `row-${i}`}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(a) => setDetail(a)}
        headerTitle={`${meta.label}（${list.total} 条）`}
        emptyTitle={`暂无${meta.label}账号`}
        emptyDescription={`客户在客户端注册并选择「${meta.short}」身份后，会出现在这里`}
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
        title={detail?.nickname || detail?.email || `${meta.label}详情`}
        description={detail?.email}
        sections={
          detail
            ? [
                {
                  title: '账号信息',
                  fields: [
                    { label: '账号ID', value: detail.accountId },
                    { label: '邮箱', value: detail.email, copyable: true },
                    { label: '昵称', value: detail.nickname },
                    {
                      label: '身份',
                      value: (
                        <Badge tone={meta.tone}>
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      ),
                    },
                    {
                      label: '状态',
                      value: (
                        <Badge tone={COMMON_STATUS[detail.status ?? '0']?.tone ?? 'muted'}>
                          {COMMON_STATUS[detail.status ?? '0']?.label ?? '未知'}
                        </Badge>
                      ),
                    },
                    { label: '注册时间', value: formatDateTime(detail.createTime) },
                    { label: '最后登录', value: detail.lastLoginTime ? formatDateTime(detail.lastLoginTime) : '—' },
                    { label: '更新时间', value: formatDateTime(detail.updateTime) },
                  ],
                },
                {
                  title: '说明',
                  fields: [
                    {
                      label: '账号来源',
                      value: '客户在网站首页用邮箱注册并选择身份',
                      span: 2,
                    },
                    {
                      label: '停用效果',
                      value: '停用后该账号无法登录客户端（已登录会话也会失效）',
                      span: 2,
                    },
                  ],
                },
              ]
            : []
        }
      />
    </div>
  );
}
