import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}

const SIZES = { sm: 'h-3.5 w-3.5', default: 'h-4 w-4', lg: 'h-6 w-6' } as const;

export function Spinner({ className, size = 'default' }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin text-muted-foreground', SIZES[size], className)} />;
}

/** 整页加载遮罩（路由级 lazy / 权限校验时使用） */
export function FullPageSpinner({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner size="lg" />
      <span className="text-xs">{text}</span>
    </div>
  );
}
