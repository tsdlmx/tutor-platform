import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Handshake, Pencil, Plus, RefreshCw, Search, Users } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { Demand } from '@/api/customer';
import { cn } from '@/lib/cn';
import { formatDateTime, stripHtml } from '@/lib/constants';
import {
  Badge, Button, Card, Empty, ErrorState, Field, Input, Pagination, Skeleton, toast,
} from '@/components/ui';
import { DeleteButton } from '@/components/rare';
import {
  DataTable, DetailDrawer, FilterBar, PageHeader, type DataColumn, type DetailSection,
} from '@/components/common';
import {
  DemandCard, DemandStatusBadge, SubjectTags,
  classModeLabel, demandSubjects, demandStatusMeta, formatBudget,
} from '@/pages/customer/shared';

/**
 * 需求列表页 —— 老师端「需求池」与学生端「我的需求」共用同一份实现。
 *
 * 两边真正不同的只有三件事：页头/空态文案、表格列（老师看城市 + 上课方式，
 * 学生看状态 + 更新时间）、操作列（学生多出编辑 / 取消 / 删除）。
 * 筛选、分页、详情抽屉、骨架屏、错误态完全一致，所以用 scope 参数区分；
 * 路由入口仍是 TeacherHome / StudentHome 两个薄包装。
 */
export type DemandScope = 'pool' | 'mine';

/** 表格行 / 表头统一的留白，保证每行等高、表头与单元格对齐 */
const CELL = 'px-4 py-3';
const HEAD = 'h-10 px-4';

const PAGE_SIZES = [10, 20, 50];

/** 筛选条件：首页只做关键词搜索（原来的科目 / 年级下拉已去掉） */
interface FilterForm {
  keyword: string;
}

const EMPTY_FILTER: FilterForm = { keyword: '' };

/** 需求编号 → 编辑页地址（与路由 /demands/:id/edit 一致） */
function editPath(demandId: number) {
  return `/demands/${demandId}/edit`;
}

/** 表格行 key —— 需求编号本身稳定，提到模块级避免每次渲染新建函数 */
const demandRowKey = (d: Demand) => d.demandId;

/**
 * 筛选表单 —— 输入框状态留在自己身上，页面只接收「提交后」的查询条件。
 *
 * 这样敲关键词只会重渲染这一张筛选卡片，不会带着表格和卡片列表一起重排。
 * 外部若要把输入框也清空（空态里的「重置筛选条件」），换 key 重新挂载即可，
 * 不必再用 effect 去同步内部状态。
 */
const DemandFilter = memo(function DemandFilter({
  loading,
  extra,
  onSearch,
  onReset,
}: {
  loading: boolean;
  /** 右侧统计徽章（条数会变，由页面自己拼好传进来） */
  extra: ReactNode;
  /** 点「查询」或回车：把关键词交给页面 */
  onSearch: (filter: FilterForm) => void;
  /** 点「重置」：清空输入框并让页面回到无筛选状态 */
  onReset: () => void;
}) {
  const [keyword, setKeyword] = useState('');

  function submit() {
    onSearch({ keyword: keyword.trim() });
  }

  function reset() {
    setKeyword('');
    onReset();
  }

  return (
    <FilterBar onSubmit={submit} onReset={reset} loading={loading} columnsClassName="grid-cols-1" extra={extra}>
      <Field label="搜索">
        <Input
          value={keyword}
          placeholder="输入关键词搜索需求标题或描述，回车即可"
          icon={<Search className="h-3.5 w-3.5" />}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </Field>
    </FilterBar>
  );
});

/** 两个 scope 的静态文案（条数等动态部分在组件里拼） */
const COPY = {
  pool: {
    title: '学生需求列表',
    description: '全部未取消的辅导需求，按发布时间倒序展示',
    listHeader: '需求列表',
    emptyTitle: '暂时还没有学生发布需求',
    emptyTitleFiltered: '没有符合条件的需求',
    emptyDescription: '学生发布需求后会立即出现在这里，可稍后刷新查看。',
    emptyDescriptionFiltered: '换个关键词再试，也可以重置筛选条件查看全部需求。',
    descriptionEmpty: '学生未填写详细说明',
  },
  mine: {
    title: '我的需求',
    description: '发布、修改与跟进自己的辅导需求',
    listHeader: '我的需求',
    emptyTitle: '你还没有发布过需求',
    emptyTitleFiltered: '没有符合条件的我的需求',
    emptyDescription: '写清科目、年级、预算与上课方式，老师就能在需求池里看到你。',
    emptyDescriptionFiltered: '换个关键词再试，也可以重置筛选条件。',
    descriptionEmpty: '未填写详细说明',
  },
};

/* ------------------------------------------------------------------ *
 * 表格列：两个 scope 共用一份定义，差异列按 scope 组装
 * ------------------------------------------------------------------ */

/** 列工厂：省掉每列都重复的 key/title/className/headerClassName 样板 */
function col(
  key: string,
  title: string,
  render: (d: Demand) => ReactNode,
  extra?: Partial<DataColumn<Demand>>,
): DataColumn<Demand> {
  return { key, title, render, className: CELL, headerClassName: HEAD, ...extra };
}

/** 需求列：老师视角多一行学生姓名 */
function titleColumn(showStudent: boolean): DataColumn<Demand> {
  const maxWidth = showStudent ? 'max-w-[22rem]' : 'max-w-[15rem]';
  return col('title', '需求', (d) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={cn('block truncate text-xs font-medium', maxWidth)}>
        {d.title || `需求 #${d.demandId}`}
      </span>
      {showStudent ? (
        <span className="block max-w-[22rem] truncate text-2xs text-muted-foreground">
          {d.studentName || '匿名学生'}
        </span>
      ) : null}
    </div>
  ));
}

const SUBJECT_COLUMN = col('subject', '科目', (d) => (
  <div className="flex max-w-[12rem] flex-wrap items-center gap-1">
    <SubjectTags subjects={demandSubjects(d)} max={2} />
  </div>
));

const GRADE_COLUMN = col('grade', '年级', (d) => <span className="text-xs">{d.grade || '—'}</span>, { width: '7rem' });

const BUDGET_COLUMN = col('budget', '预算', (d) => (
  <span className="tabular whitespace-nowrap text-xs font-medium text-primary">
    {formatBudget(d.budgetMin, d.budgetMax, d.budgetUnit)}
  </span>
), { width: '9.5rem' });

const timeColumn = (key: 'createTime' | 'updateTime', title: string) =>
  col(key, title, (d) => (
    <span className="tabular whitespace-nowrap text-2xs text-muted-foreground">
      {formatDateTime(d[key])}
    </span>
  ), { width: '9.5rem' });

/** 老师视角独有：上课方式 / 城市 / 发布时间 */
const CLASS_MODE_COLUMN = col(
  'classMode', '上课方式',
  (d) => <span className="whitespace-nowrap text-xs text-muted-foreground">{classModeLabel(d.classMode)}</span>,
  { width: '7rem' },
);

const CITY_COLUMN = col(
  'city', '城市',
  (d) => <span className="block truncate text-xs text-muted-foreground">{d.city || '—'}</span>,
  { width: '6rem' },
);

const CREATE_TIME_COLUMN = timeColumn('createTime', '发布时间');

/** 学生视角独有：状态 / 更新时间 */
const STATUS_COLUMN = col('status', '状态', (d) => <DemandStatusBadge demand={d} />, { width: '6rem' });

const UPDATE_TIME_COLUMN = timeColumn('updateTime', '更新时间');

/**
 * 学生视角的操作区：编辑 / 取消 / 删除。
 * 表格（ghost 按钮）与移动端卡片（outline + 44px 触控高度）共用，只改样式不改行为。
 */
function DemandActions({
  demand, acting, removing, mobile = false, onCancel, onRemove,
}: {
  demand: Demand;
  acting: boolean;
  removing: boolean;
  /** 移动端卡片形态 */
  mobile?: boolean;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const cancelled = String(demand.status ?? '') === '3';
  const variant = mobile ? 'outline' : 'ghost';
  return (
    // 点按钮不能顺带把卡片当成「查看」
    <div
      className={cn(
        'flex flex-wrap items-center justify-end',
        mobile ? 'w-full gap-2 [&_button]:h-11' : 'gap-1',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <Button variant={variant} size="sm" className={mobile ? 'h-11 px-4' : 'text-primary'} asChild>
        <Link to={editPath(demand.demandId)}>
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </Link>
      </Button>
      {!cancelled ? (
        <DeleteButton
          size="sm" variant={variant} label="取消需求" confirmLabel="确认取消"
          icon={false} disabled={acting} onConfirm={onCancel}
        />
      ) : null}
      <DeleteButton
        size="sm" variant={variant} label="删除" confirmLabel="确认删除"
        disabled={removing} onConfirm={onRemove}
      />
    </div>
  );
}

/** 移动端卡片骨架：两个 scope 只差底部按钮数量 */
function DemandCardSkeleton({ actions }: { actions: number }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-2/3" />
          <div className="mt-2 flex gap-1.5">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-1 flex items-center justify-end gap-2 border-t border-border/60 pt-2.5">
        {Array.from({ length: actions }).map((_, j) => (
          <Skeleton key={j} className="h-7 w-16" />
        ))}
      </div>
    </Card>
  );
}

/** 需求列表页本体：`pool` = 老师端需求池，`mine` = 学生端我的需求 */
export function DemandListPage({ scope }: { scope: DemandScope }) {
  const isMine = scope === 'mine';
  const copy = COPY[scope];

  const [query, setQuery] = useState<customerApi.DemandQuery>({ pageNum: 1, pageSize: 10 });
  /** 每 +1 就重新挂载筛选表单（连带清空输入框），用于空态里的「重置筛选条件」 */
  const [filterResetKey, setFilterResetKey] = useState(0);

  const [rows, setRows] = useState<Demand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 正在取消 / 正在删除的需求 id（按钮 loading 用） */
  const [acting, setActing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  /** 老师：我已申请过的需求ID（把按钮显示成「已申请」） */
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  /** 老师：正在提交申请的需求 id */
  const [applying, setApplying] = useState<number | null>(null);

  const [detail, setDetail] = useState<Demand | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const pageNum = query.pageNum ?? 1;
  const pageSize = query.pageSize ?? 10;

  /* 老师：拉一次「我已申请过的需求」，用于把按钮变成「已申请」 */
  const loadApplied = useCallback(async () => {
    if (isMine) return;
    try {
      setAppliedIds(new Set(await customerApi.listAppliedDemandIds()));
    } catch {
      setAppliedIds(new Set());
    }
  }, [isMine]);

  useEffect(() => {
    void loadApplied();
  }, [loadApplied]);

  /* 老师点「申请联系」 */
  const applyDemand = useCallback(async (d: Demand) => {
    setApplying(d.demandId);
    try {
      await customerApi.applyToDemand(d.demandId);
      setAppliedIds((prev) => new Set(prev).add(d.demandId));
      toast.success('已申请联系', { description: '学生会在「我的 → 老师申请」里看到你' });
    } catch (e) {
      toast.error('申请失败', { description: e instanceof Error ? e.message : '请稍后重试' });
    } finally {
      setApplying(null);
    }
  }, []);

  /* 需求列表 */
  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { total: t, rows: list } = await customerApi.listDemands(query);
      setRows(list);
      setTotal(t);
    } catch (e) {
      const fallback = isMine ? '我的需求加载失败' : '需求列表加载失败';
      setError(e instanceof Error ? e.message : fallback);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, isMine]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /* 筛选 / 分页 / 详情：全部 useCallback，保证 memo 过的表格与筛选区不会白白重渲染 */
  const search = useCallback((filter: FilterForm) => {
    setQuery((q) => ({ ...q, keyword: filter.keyword, pageNum: 1 }));
  }, []);

  const resetQuery = useCallback(() => {
    setQuery((q) => ({ ...EMPTY_FILTER, pageNum: 1, pageSize: q.pageSize }));
  }, []);

  /** 连输入框一起重置（筛选区自己点「重置」时只需 resetQuery，输入框它自己清） */
  const resetAll = useCallback(() => {
    setFilterResetKey((k) => k + 1);
    resetQuery();
  }, [resetQuery]);

  const changePage = useCallback((page: number) => setQuery((q) => ({ ...q, pageNum: page })), []);
  const changePageSize = useCallback(
    (size: number) => setQuery((q) => ({ ...q, pageSize: size, pageNum: 1 })),
    [],
  );

  const openDetail = useCallback((demand: Demand) => {
    setDetail(demand);
    setDetailOpen(true);
  }, []);

  /** 取消需求（状态置为 3 已取消）—— 仅学生视角有入口 */
  const cancelDemand = useCallback(
    async (demand: Demand) => {
      if (acting) return;
      setActing(demand.demandId);
      try {
        const msg = await customerApi.updateDemandStatus(demand.demandId, '3');
        toast.success('需求已取消', { description: msg });
        await loadList();
      } catch (e) {
        toast.error('取消失败', { description: e instanceof Error ? e.message : '请稍后重试' });
      } finally {
        setActing(null);
      }
    },
    [acting, loadList],
  );

  /** 删除需求；删掉当前页最后一条时自动回退一页 */
  const removeDemand = useCallback(
    async (demand: Demand) => {
      if (removing !== null) return;
      setRemoving(demand.demandId);
      try {
        const msg = await customerApi.deleteDemand(demand.demandId);
        toast.success('需求已删除', { description: msg });
        if (rows.length === 1 && pageNum > 1) {
          setQuery((q) => ({ ...q, pageNum: pageNum - 1 }));
        } else {
          await loadList();
        }
      } catch (e) {
        toast.error('删除失败', { description: e instanceof Error ? e.message : '请稍后重试' });
      } finally {
        setRemoving(null);
      }
    },
    [removing, rows.length, pageNum, loadList],
  );

  /** 复制需求摘要，方便老师转发给朋友或在聊天里回填 */
  async function copyDetail() {
    if (!detail) return;
    const text = [
      detail.title,
      `科目：${demandSubjects(detail).join('、') || '—'}`,
      `年级：${detail.grade || '—'}`,
      `预算：${formatBudget(detail.budgetMin, detail.budgetMax, detail.budgetUnit)}`,
      `上课方式：${classModeLabel(detail.classMode)}`,
      detail.city ? `城市：${detail.city}` : '',
      detail.description ? `描述：${stripHtml(detail.description, 200)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('需求信息已复制');
    } catch {
      toast.error('复制失败，请手动选择文本');
    }
  }

  const hasFilter = Boolean(query.keyword);
  const openCount = useMemo(() => rows.filter((d) => String(d.status ?? '') === '0').length, [rows]);

  const emptyTitle = hasFilter ? copy.emptyTitleFiltered : copy.emptyTitle;
  const emptyDescription = hasFilter ? copy.emptyDescriptionFiltered : copy.emptyDescription;

  /* 空态里的操作按钮也 memo 住：元素引用稳定，表格就不会为它重渲染 */
  const emptyAction = useMemo(
    () =>
      hasFilter ? (
        <Button variant="outline" size="sm" onClick={resetAll}>
          重置筛选条件
        </Button>
      ) : isMine ? (
        <Button size="sm" asChild>
          <Link to="/demands/new">
            <Plus className="h-3.5 w-3.5" />
            发布需求
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={loading}>
          {/* 与后台列表一致：加载中让图标转起来，否则点完按钮毫无反馈 */}
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新列表
        </Button>
      ),
    [hasFilter, isMine, loading, resetAll, loadList],
  );

  /* 表格列：按 scope 组装一次，只有「谁在取消/删除中」变化时才重建 */
  const columns = useMemo<DataColumn<Demand>[]>(() => {
    /* 操作列：老师是「查看 + 申请联系」 */
    const openColumn = col(
      'action',
      '操作',
      (d) => {
        const applied = appliedIds.has(d.demandId);
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={(e) => {
                e.stopPropagation();
                openDetail(d);
              }}
            >
              查看
            </Button>
            <Button
              variant={applied ? 'outline' : 'default'}
              size="sm"
              disabled={applied || applying === d.demandId}
              loading={applying === d.demandId}
              onClick={(e) => {
                e.stopPropagation();
                if (!applied) void applyDemand(d);
              }}
            >
              {applied ? '已申请' : '申请联系'}
            </Button>
          </div>
        );
      },
      { align: 'right', width: '11rem' },
    );

    /* 操作列：学生是「编辑 / 取消 / 删除」 */
    const manageColumn = col(
      'action',
      '操作',
      (d) => (
        <DemandActions
          demand={d}
          acting={acting === d.demandId}
          removing={removing === d.demandId}
          onCancel={() => cancelDemand(d)}
          onRemove={() => removeDemand(d)}
        />
      ),
      { align: 'right' },
    );

    return [
      titleColumn(!isMine),
      ...(isMine ? [STATUS_COLUMN] : []),
      SUBJECT_COLUMN,
      GRADE_COLUMN,
      BUDGET_COLUMN,
      ...(isMine ? [UPDATE_TIME_COLUMN] : [CLASS_MODE_COLUMN, CITY_COLUMN, CREATE_TIME_COLUMN]),
      isMine ? manageColumn : openColumn,
    ];
  }, [isMine, acting, removing, openDetail, cancelDemand, removeDemand, appliedIds, applying, applyDemand]);

  /** 移动端卡片底部：学生放操作区，老师放「查看」（与卡片点击同一个动作） */
  const cardFooter = useCallback(
    (d: Demand) =>
      isMine ? (
        <DemandActions
          demand={d}
          acting={acting === d.demandId}
          removing={removing === d.demandId}
          mobile
          onCancel={() => cancelDemand(d)}
          onRemove={() => removeDemand(d)}
        />
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-11 px-4" onClick={() => openDetail(d)}>
            查看
          </Button>
          {appliedIds.has(d.demandId) ? (
            <Button variant="outline" size="sm" className="h-11 px-4" disabled>
              <Handshake className="h-3.5 w-3.5" />
              已申请
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-11 px-4"
              disabled={applying === d.demandId}
              loading={applying === d.demandId}
              onClick={() => void applyDemand(d)}
            >
              <Handshake className="h-3.5 w-3.5" />
              申请联系
            </Button>
          )}
        </div>
      ),
    [isMine, acting, removing, cancelDemand, removeDemand, openDetail, appliedIds, applying, applyDemand],
  );

  /* 抽屉里的字段数组只在「打开/切换了某条需求」时重建 */
  const drawerSections = useMemo<DetailSection[]>(
    () =>
      detail
        ? [
            {
              title: '需求信息',
              fields: [
                { label: '需求编号', value: `#${detail.demandId}` },
                {
                  label: '状态',
                  value: <Badge tone={demandStatusMeta(detail).tone}>{demandStatusMeta(detail).label}</Badge>,
                },
                { label: '科目', value: demandSubjects(detail).join('、') || '—' },
                { label: '年级', value: detail.grade || '—' },
                { label: '预算', value: formatBudget(detail.budgetMin, detail.budgetMax, detail.budgetUnit) },
                { label: '上课方式', value: classModeLabel(detail.classMode) },
                { label: '城市', value: detail.city || '—' },
                ...(isMine
                  ? [{ label: '更新时间', value: formatDateTime(detail.updateTime) }]
                  : [
                      { label: '学生', value: detail.studentName || '匿名学生' },
                      { label: '发布时间', value: formatDateTime(detail.createTime) },
                      { label: '更新时间', value: formatDateTime(detail.updateTime) },
                    ]),
              ],
            },
            {
              title: '需求描述',
              fields: [
                {
                  label: '详细说明',
                  span: 2,
                  value: detail.description ? (
                    <span className="whitespace-pre-wrap text-xs leading-5">
                      {stripHtml(detail.description, 4000)}
                    </span>
                  ) : (
                    copy.descriptionEmpty
                  ),
                },
              ],
            },
          ]
        : [],
    [detail, isMine, copy],
  );

  const drawerFooter = detail ? (
    isMine ? (
      <>
        <DemandStatusBadge demand={detail} />
        <Button variant="outline" size="sm" asChild>
          <Link to={editPath(detail.demandId)}>
            <Pencil className="h-3.5 w-3.5" />
            编辑这条需求
          </Link>
        </Button>
      </>
    ) : (
      <Button variant="outline" size="sm" onClick={() => void copyDetail()}>
        复制需求信息
      </Button>
    )
  ) : null;

  const retry = useCallback(() => void loadList(), [loadList]);

  /* 筛选区右侧的统计徽章：元素引用稳定，筛选区就不会跟着页面一起重渲染 */
  const filterExtra = useMemo(
    () =>
      isMine ? (
        <div className="flex items-center gap-2">
          <Badge tone="muted">共 {total} 条</Badge>
          <Badge tone={openCount > 0 ? 'warning' : 'muted'} dot>
            本页待接单 {openCount}
          </Badge>
        </div>
      ) : (
        <Badge tone="muted">共 {total} 条需求</Badge>
      ),
    [isMine, total, openCount],
  );


  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={copy.title} description={copy.description}>
        <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={loading}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
        {isMine ? (
          <Button size="sm" asChild>
            <Link to="/demands/new">
              <Plus className="h-3.5 w-3.5" />
              发布需求
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      {/* 筛选：表单状态在 DemandFilter 内部，敲关键词不会牵动下面的表格 / 卡片列表。
          key 变化 = 重新挂载 = 输入框一并清空（空态里的「重置筛选条件」用）。 */}
      <DemandFilter
        key={filterResetKey}
        loading={loading}
        extra={filterExtra}
        onSearch={search}
        onReset={resetQuery}
      />

      {/* 桌面端：表格 */}
      <div className="hidden md:block">
        <DataTable
          columns={columns} rows={rows} rowKey={demandRowKey}
          loading={loading} error={error} onRetry={retry}
          skeletonRows={pageSize > 10 ? 10 : pageSize}
          emptyTitle={emptyTitle} emptyDescription={emptyDescription} emptyAction={emptyAction}
          onRowClick={openDetail} headerTitle={`${copy.listHeader} · 共 ${total} 条`}
          pageNum={pageNum} pageSize={pageSize}
          total={rows.length === 0 ? undefined : total}
          onPageChange={changePage} onPageSizeChange={changePageSize}
        />
      </div>

      {/* 移动端：卡片列表 */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <DemandCardSkeleton key={i} actions={isMine ? 3 : 1} />
          ))
        ) : error ? (
          <Card>
            <ErrorState message={error} onRetry={retry} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <Empty
              title={emptyTitle}
              description={emptyDescription}
              icon={isMine ? <CheckCircle2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}
              action={emptyAction}
            />
          </Card>
        ) : (
          <>
            {rows.map((d, i) => (
              <DemandCard
                key={d.demandId}
                demand={d}
                index={i}
                showStudent={!isMine}
                timeField={isMine ? 'updateTime' : 'createTime'}
                onClick={() => openDetail(d)}
                footer={cardFooter(d)}
              />
            ))}
            <Card className="p-0">
              <Pagination
                pageNum={pageNum} pageSize={pageSize} total={total} pageSizes={PAGE_SIZES}
                onPageChange={changePage} onPageSizeChange={changePageSize}
              />
            </Card>
          </>
        )}
      </div>

      {/* 需求详情 */}
      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail?.title || '需求详情'}
        description={
          detail
            ? isMine
              ? `发布于 ${formatDateTime(detail.createTime)}`
              : `${detail.studentName || '匿名学生'} · 发布于 ${formatDateTime(detail.createTime)}`
            : undefined
        }
        sections={drawerSections}
        footer={drawerFooter}
      />
    </div>
  );
}

export default DemandListPage;
