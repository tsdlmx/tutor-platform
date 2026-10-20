import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface StatCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  hint?: ReactNode;
  /** 数字后缀，如 "人" */
  suffix?: string;
  /** 图标底色 tones */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  loading?: boolean;
  delay?: number;
  onClick?: () => void;
  className?: string;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-primary/[0.08] text-primary',
  success: 'bg-success/[0.12] text-success',
  warning: 'bg-warning/[0.14] text-warning',
  danger: 'bg-destructive/[0.12] text-destructive',
  info: 'bg-sky-500/[0.12] text-sky-600 dark:text-sky-400',
};

export function StatCard({
  label,
  value,
  icon,
  hint,
  suffix,
  tone = 'default',
  loading = false,
  delay = 0,
  onClick,
  className,
}: StatCardProps) {
  // 入场动画用 CSS（.rare-rise + animationDelay）：统计卡在后台/客户侧都常见，
  // 不值得为它引一个动画库；数字也不再滚动计数，直接显示（专业后台的常态做法）。
  return (
    <div
      className={`rare-rise ${className ?? ''}`.trim()}
      style={delay ? { animationDelay: `${delay * 1000}ms` } : undefined}
    >
      <Card
        interactive={Boolean(onClick)}
        onClick={onClick}
        className={cn('relative overflow-hidden p-4', onClick && 'cursor-pointer')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <div className="mt-2 flex items-baseline gap-1">
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <span className="text-2xl font-semibold tracking-tight">{value}</span>
              )}
              {suffix && !loading ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
            </div>
            {hint ? <div className="mt-1.5 text-2xs text-muted-foreground">{hint}</div> : null}
          </div>

          {icon ? (
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4',
                TONES[tone],
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
