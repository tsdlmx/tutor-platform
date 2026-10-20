import type { FormEvent, ReactNode } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface FilterBarProps {
  children: ReactNode;
  onSubmit?: () => void;
  onReset?: () => void;
  loading?: boolean;
  /** 右侧额外操作（如「新建」按钮）放在筛选区之外 */
  extra?: ReactNode;
  className?: string;
  /** 每个筛选项的最小宽度 */
  columnsClassName?: string;
}

/**
 * FilterBar —— 列表页顶部筛选区：可提交的 form，回车即查询，
 * 移动端自动堆叠为单列。
 */
export function FilterBar({
  children,
  onSubmit,
  onReset,
  loading = false,
  extra,
  className,
  columnsClassName = 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
}: FilterBarProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit?.();
  }

  return (
    <Card className={cn('p-4', className)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className={cn('grid gap-3', columnsClassName)}>{children}</div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={loading}>
              <Search className="h-3.5 w-3.5" />
              查询
            </Button>
            {onReset ? (
              <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={loading}>
                <RotateCcw className="h-3.5 w-3.5" />
                重置
              </Button>
            ) : null}
          </div>
          {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
        </div>
      </form>
    </Card>
  );
}
