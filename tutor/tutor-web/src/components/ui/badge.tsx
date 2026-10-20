import * as React from 'react';
import { cn } from '@/lib/cn';
import type { BadgeTone } from '@/lib/constants';

const TONES: Record<BadgeTone, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  success: 'border-success/30 bg-success/[0.12] text-success',
  warning: 'border-warning/30 bg-warning/[0.12] text-warning',
  danger: 'border-destructive/30 bg-destructive/[0.12] text-destructive',
  info: 'border-sky-500/30 bg-sky-500/[0.12] text-sky-600 dark:text-sky-400',
  muted: 'border-border bg-muted text-muted-foreground',
  outline: 'border-border bg-transparent text-foreground',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** 左侧小圆点 */
  dot?: boolean;
}

export function Badge({ className, tone = 'default', dot = false, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium leading-4',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}
