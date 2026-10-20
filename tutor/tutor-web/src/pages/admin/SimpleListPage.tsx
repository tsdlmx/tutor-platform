import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  PageHeader,
  type DataColumn,
  type DetailSection,
} from '@/components/common';
import { usePagedList } from '@/hooks/usePagedList';

export interface SimpleFilterConfig {
  name: string;
  label: string;
  type: 'input' | 'select';
  placeholder?: string;
  options?: { label: string; value: string | number }[];
}

export interface SimpleListConfig<T> {
  title: string;
  description?: string;
  /** 顶部右侧附加内容（导出按钮等） */
  headerExtra?: ReactNode;
  filters?: SimpleFilterConfig[];
  columns: DataColumn<T>[];
  rowKey: (row: T, index: number) => string | number;
  /** 同 usePagedList：入参放宽为 any，避免在每份配置里重复写类型断言 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch: (query: any) => Promise<{ total: number; rows: T[] }>;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  /** 行操作（会追加一列「操作」） */
  rowActions?: (row: T, ctx: { reload: () => void }) => ReactNode;
  detailTitle?: (row: T) => string;
  detailDescription?: (row: T) => string;
  detailSections?: (row: T) => DetailSection[];
  /** 是否允许点击行打开详情（默认有 detailSections 时开启） */
  rowClickable?: boolean;
}

/**
 * SimpleListPage —— 配置驱动的通用列表页。
 * 角色 / 在线用户 / 登录日志 / 操作日志 / 系统用户等"标准 CRUD 列表"共用一个实现，
 * 避免在每个页面里重复筛选、分页、骨架屏、抽屉详情这些样板代码。
 */
export function SimpleListPage<T>({ config }: { config: SimpleListConfig<T> }) {
  const filters = config.filters ?? [];
  const emptyDraft = useMemo(
    () => Object.fromEntries(filters.map((f) => [f.name, ''])) as Record<string, string>,
    [filters],
  );
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft);
  const [detail, setDetail] = useState<T | null>(null);

  const list = usePagedList<T>(config.fetch, { pageSize: config.pageSize ?? 10 });

  const rowActions = config.rowActions;
  const detailSections = config.detailSections;
  const clickable = config.rowClickable ?? Boolean(detailSections);

  const columns = useMemo<DataColumn<T>[]>(() => {
    const base = [...config.columns];
    if (rowActions || detailSections) {
      base.push({
        key: '__actions',
        title: '操作',
        width: rowActions ? '200px' : '90px',
        align: 'right',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            {rowActions?.(row, { reload: list.reload })}
            {detailSections ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetail(row);
                }}
              >
                详情
              </Button>
            ) : null}
          </div>
        ),
      });
    }
    return base;
  }, [config.columns, rowActions, detailSections, list.reload]);

  const onSearch = useCallback(() => {
    const next: Record<string, unknown> = {};
    Object.entries(draft).forEach(([k, v]) => {
      if (v !== '') next[k] = v;
    });
    list.search(next);
  }, [draft, list]);

  const onReset = useCallback(() => {
    setDraft(emptyDraft);
    list.search({});
  }, [emptyDraft, list]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={config.title}
        description={config.description}
        className="[&_h1]:text-base"
      >
        <Badge tone="muted" className="hidden sm:inline-flex">
          共 {list.total} 条
        </Badge>
        <Button variant="outline" size="sm" onClick={list.reload} disabled={list.loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', list.loading && 'animate-spin')} />
          刷新
        </Button>
        {config.headerExtra}
      </PageHeader>

      {filters.length > 0 ? (
        <FilterBar onSubmit={onSearch} onReset={onReset} loading={list.loading}>
          {filters.map((f) => (
            <Field key={f.name} label={f.label}>
              {f.type === 'select' ? (
                <Select
                  value={draft[f.name] ?? ''}
                  placeholder={f.placeholder ?? '全部'}
                  options={f.options ?? []}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                />
              ) : (
                <Input
                  value={draft[f.name] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </FilterBar>
      ) : null}

      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={config.rowKey}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={clickable && detailSections ? (row) => setDetail(row) : undefined}
        headerTitle={`${config.title}（${list.total} 条）`}
        emptyTitle={config.emptyTitle ?? '暂无数据'}
        emptyDescription={config.emptyDescription}
        pageNum={list.pageNum}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPageNum}
        onPageSizeChange={list.setPageSize}
        className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4"
      />

      {detailSections ? (
        <DetailDrawer
          open={detail !== null}
          onOpenChange={(o) => {
            if (!o) setDetail(null);
          }}
          title={detail ? (config.detailTitle?.(detail) ?? '详情') : '详情'}
          description={detail ? config.detailDescription?.(detail) : undefined}
          sections={detail ? detailSections(detail) : []}
        />
      ) : null}
    </div>
  );
}

export default SimpleListPage;
