import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

/** 默认每页条数 —— 提到模块级，避免每次渲染新建数组导致 options 反复重建 */
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

export interface PaginationProps {
  pageNum: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  className?: string;
}

/** 生成 1 … 4 5 [6] 7 8 … 20 形式的页码 */
function pageItems(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) items.push('gap');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push('gap');
  items.push(totalPages);
  return items;
}

export function Pagination({
  pageNum,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, pageNum), totalPages);
  const items = pageItems(current, totalPages);
  const sizeOptions = useMemo(
    () => pageSizes.map((s) => ({ label: `${s} 条`, value: String(s) })),
    [pageSizes],
  );

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-3 py-3', className)}>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular">
          共 <span className="font-medium text-foreground">{total}</span> 条 · 第 {current}/{totalPages} 页
        </span>
        {onPageSizeChange ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">每页</span>
            <Select
              size="sm"
              className="w-[74px]"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              options={sizeOptions}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="首页"
          disabled={current <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {items.map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === current ? 'default' : 'outline'}
              size="icon-sm"
              className="tabular"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          disabled={current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="末页"
          disabled={current >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
