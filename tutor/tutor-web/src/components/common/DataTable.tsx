import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Empty, ErrorState } from '@/components/ui/empty';

export type ColumnAlign = 'left' | 'center' | 'right';

export interface DataColumn<T> {
  key: string;
  title: ReactNode;
  /** 无 render 时按该字段取值 */
  dataIndex?: keyof T | string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: ColumnAlign;
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;

  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;

  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;

  /** 表格左上角标题 / 右上角操作区 */
  headerTitle?: ReactNode;
  toolbar?: ReactNode;

  /* 分页（全部可选，不传则不渲染分页条） */
  pageNum?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;

  className?: string;
  /** 表格区域最大高度，超出滚动（表头吸顶） */
  maxHeight?: string;
}

const ALIGN: Record<ColumnAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function cellValue<T>(row: T, col: DataColumn<T>): ReactNode {
  const key = (col.dataIndex ?? col.key) as string;
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}

/**
 * DataTable —— 通用分页表格：列配置 + 骨架屏 + 空态/错误态 + 分页。
 * 所有列表页共用，保证交互与视觉一致。
 */
function DataTableImpl<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = '暂无数据',
  emptyDescription,
  emptyAction,
  skeletonRows = 8,
  onRowClick,
  rowClassName,
  headerTitle,
  toolbar,
  pageNum,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
  maxHeight,
}: DataTableProps<T>) {
  const showPagination = typeof total === 'number' && pageNum !== undefined && pageSize !== undefined && onPageChange;
  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {headerTitle !== undefined || toolbar !== undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <div className="text-xs font-medium text-muted-foreground">{headerTitle}</div>
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : isEmpty ? (
        <Empty title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <TableWrapper className={cn(maxHeight && 'overflow-y-auto')} style={maxHeight ? { maxHeight } : undefined}>
          <Table>
            <TableHeader className={cn(maxHeight && 'sticky top-0 z-10 [&_th]:bg-card')}>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(ALIGN[col.align ?? 'left'], col.headerClassName)}
                  >
                    {col.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading
                ? Array.from({ length: skeletonRows }).map((_, r) => (
                    <TableRow key={`sk-${r}`} className="hover:bg-transparent">
                      {columns.map((col, c) => (
                        <TableCell key={col.key} className={cn(ALIGN[col.align ?? 'left'], col.className)}>
                          <Skeleton
                            className={cn('h-3.5', c === 0 ? 'w-28' : c === columns.length - 1 ? 'w-14' : 'w-full max-w-[9rem]')}
                            style={{ opacity: 1 - r * 0.08 }}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row, i) => (
                    <TableRow
                      key={rowKey(row, i)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                    >
                      {columns.map((col) => (
                        <TableCell key={col.key} className={cn(ALIGN[col.align ?? 'left'], col.className)}>
                          {col.render ? col.render(row, i) : cellValue(row, col)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableWrapper>
      )}

      {showPagination ? (
        <div className="border-t border-border/60">
          <Pagination
            pageNum={pageNum}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * 包一层 memo：列表页里打开详情抽屉、切换按钮 loading 等「与表格无关」的
 * 状态变化，不必把每一行都重新渲染一遍。
 * 泛型签名在 memo 之后会丢失，所以断言回原来的组件类型。
 */
export const DataTable = memo(DataTableImpl) as typeof DataTableImpl;
