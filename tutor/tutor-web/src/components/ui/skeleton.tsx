import type * as React from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton-shimmer rounded-md bg-muted', className)} {...props} />;
}

/** 表格骨架 —— 与 DataTable 的列数/行数对齐 */
export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'w-32' : c === cols - 1 ? 'w-16' : 'flex-1')}
              style={{ opacity: 1 - r * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
