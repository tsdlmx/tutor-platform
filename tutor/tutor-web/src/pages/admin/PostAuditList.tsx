import { useCallback, useState } from 'react';
import { Check, FileText, RefreshCw, ShieldCheck, X } from 'lucide-react';
import * as userPostApi from '@/api/userPost';
import type { AdminUserPost } from '@/api/userPost';
import { formatDateTime, stripHtml } from '@/lib/constants';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from '@/components/ui';
import { DataTable, DetailDrawer, PageHeader, type DataColumn } from '@/components/common';
import { usePagedList } from '@/hooks/usePagedList';

/** 审核状态 → 展示 */
const AUDIT_META: Record<
  string,
  { label: string; tone: 'warning' | 'success' | 'danger' | 'muted' }
> = {
  '0': { label: '待审核', tone: 'warning' },
  '1': { label: '已通过', tone: 'success' },
  '2': { label: '已拒绝', tone: 'danger' },
};

const TABS: { value: string; label: string }[] = [
  { value: '0', label: '待审核' },
  { value: '1', label: '已通过' },
  { value: '2', label: '已拒绝' },
  { value: '', label: '全部' },
];

/**
 * 帖子审核（管理后台）
 *
 * 客户在「我的」里发的帖子默认是「待审核」，通过之后才会出现在广场和作者主页；
 * 拒绝时可以填理由，作者在自己的帖子列表里能看到。
 */
export default function PostAuditList() {
  const [detail, setDetail] = useState<AdminUserPost | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  /** 拒绝弹窗 */
  const [rejecting, setRejecting] = useState<AdminUserPost | null>(null);
  const [remark, setRemark] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const list = usePagedList<AdminUserPost>(
    (query) =>
      userPostApi.listPosts({
        pageNum: Number(query.pageNum) || 1,
        pageSize: Number(query.pageSize) || 10,
        auditStatus: typeof query.auditStatus === 'string' ? query.auditStatus : undefined,
      }),
    { pageSize: 10, initialFilters: { auditStatus: '0' } },
  );

  /* 当前页签 = 数据源里的筛选条件（不在本地再存一份，避免两处状态漂移） */
  const auditStatus = typeof list.filters.auditStatus === 'string' ? list.filters.auditStatus : '0';

  const pass = useCallback(
    async (row: AdminUserPost) => {
      setBusyId(row.postId);
      try {
        await userPostApi.auditPost(row.postId, '1');
        toast.success('已通过', { description: '这条帖子现在会出现在广场上' });
        list.reload();
        setDetail((d) => (d && d.postId === row.postId ? { ...d, auditStatus: '1' } : d));
      } catch (e) {
        toast.error('审核失败', { description: e instanceof Error ? e.message : '请稍后重试' });
      } finally {
        setBusyId(null);
      }
    },
    [list],
  );

  const reject = useCallback(async () => {
    if (!rejecting) return;
    setSubmittingReject(true);
    try {
      await userPostApi.auditPost(rejecting.postId, '2', remark.trim() || undefined);
      toast.success('已拒绝', { description: remark.trim() ? '理由已记录，作者可见' : undefined });
      setRejecting(null);
      setRemark('');
      list.reload();
    } catch (e) {
      toast.error('操作失败', { description: e instanceof Error ? e.message : '请稍后重试' });
    } finally {
      setSubmittingReject(false);
    }
  }, [rejecting, remark, list]);

  const columns: DataColumn<AdminUserPost>[] = [
    {
      key: 'content',
      title: '帖子内容',
      render: (p) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="block max-w-[28rem] truncate text-xs">
            {stripHtml(p.content, 80) || '（无文字内容）'}
          </span>
          <span className="text-2xs text-muted-foreground">#{p.postId}</span>
        </div>
      ),
    },
    {
      key: 'author',
      title: '作者',
      width: '160px',
      render: (p) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs">{p.authorName || '匿名用户'}</span>
          <span className="text-2xs text-muted-foreground">
            {p.authorRole === 'TEACHER' ? '老师' : p.authorRole === 'STUDENT' ? '学生' : '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'auditStatus',
      title: '状态',
      width: '96px',
      render: (p) => {
        const meta = AUDIT_META[p.auditStatus ?? '0'] ?? AUDIT_META['0'];
        return (
          <Badge tone={meta.tone} dot>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'createTime',
      title: '发布时间',
      width: '170px',
      render: (p) => (
        <span className="tabular text-2xs text-muted-foreground">{formatDateTime(p.createTime)}</span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '200px',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDetail(p)}>
            <FileText className="h-3.5 w-3.5" />
            详情
          </Button>
          {p.auditStatus !== '1' ? (
            <Button size="sm" variant="ghost" loading={busyId === p.postId} onClick={() => void pass(p)}>
              <Check className="h-3.5 w-3.5" />
              通过
            </Button>
          ) : null}
          {p.auditStatus !== '2' ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setRemark('');
                setRejecting(p);
              }}
            >
              <X className="h-3.5 w-3.5" />
              拒绝
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="帖子审核" description="客户发布的帖子经审核通过后才会出现在广场与个人主页">
        <Button variant="outline" size="sm" disabled={list.loading} onClick={() => list.reload()}>
          <RefreshCw className={list.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      {/* 状态页签：切换即重新查询 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.value || 'all'}
            size="sm"
            variant={auditStatus === t.value ? 'default' : 'outline'}
            onClick={() => list.search({ auditStatus: t.value })}
          >
            {t.label}
          </Button>
        ))}
        <span className="ml-auto text-2xs text-muted-foreground">
          {list.loading ? '加载中…' : `共 ${list.total} 条`}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(p) => p.postId}
        loading={list.loading}
        error={list.error}
        onRetry={() => list.reload()}
        emptyTitle={auditStatus === '0' ? '没有待审核的帖子' : '没有符合条件的帖子'}
        emptyDescription={auditStatus === '0' ? '客户发帖后会出现在这里' : '换个状态看看'}
        onRowClick={(p) => setDetail(p)}
        pageNum={list.pageNum}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPageNum}
        onPageSizeChange={(size) => {
          list.setPageSize(size);
          list.setPageNum(1);
        }}
      />

      {/* 详情抽屉 */}
      <DetailDrawer
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail ? `帖子 #${detail.postId}` : '帖子详情'}
        description={
          detail
            ? `${detail.authorName || '匿名用户'} · ${
                detail.authorRole === 'TEACHER' ? '老师' : detail.authorRole === 'STUDENT' ? '学生' : '—'
              } · ${formatDateTime(detail.createTime)}`
            : undefined
        }
        sections={
          detail
            ? [
                {
                  title: '内容',
                  fields: [
                    {
                      label: '正文',
                      span: 2,
                      value: detail.content ? (
                        <span className="whitespace-pre-wrap text-xs leading-5">{detail.content}</span>
                      ) : (
                        '（无文字内容）'
                      ),
                    },
                    { label: '图片数', value: (detail.imageList ?? []).length },
                    {
                      label: '审核状态',
                      value: (
                        <Badge tone={(AUDIT_META[detail.auditStatus ?? '0'] ?? AUDIT_META['0']).tone}>
                          {(AUDIT_META[detail.auditStatus ?? '0'] ?? AUDIT_META['0']).label}
                        </Badge>
                      ),
                    },
                    { label: '审核时间', value: detail.auditTime ? formatDateTime(detail.auditTime) : '—' },
                    { label: '拒绝理由', value: detail.auditRemark || '—' },
                  ],
                },
              ]
            : []
        }
        footer={
          detail ? (
            <div className="flex items-center gap-2">
              {detail.auditStatus !== '1' ? (
                <Button size="sm" loading={busyId === detail.postId} onClick={() => void pass(detail)}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  通过
                </Button>
              ) : null}
              {detail.auditStatus !== '2' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setRemark('');
                    setRejecting(detail);
                  }}
                >
                  拒绝
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {/* 拒绝理由弹窗 */}
      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => (!open ? setRejecting(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝这条帖子</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-2xs text-muted-foreground">
              拒绝理由会显示给作者（选填，最多 255 字）。
            </p>
            <Textarea
              value={remark}
              maxLength={255}
              placeholder="例如：包含广告或联系方式"
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              loading={submittingReject}
              onClick={() => void reject()}
            >
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
