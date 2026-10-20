import type { ReactNode } from 'react';
import { Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

export interface EmptyProps {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Empty({ title = '暂无数据', description, icon, action, className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** 错误态（请求失败）—— 与 Empty 区分开，避免"接口挂了"被当成"没数据" */
export function ErrorState({
  message = '加载失败',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/[0.12] text-destructive">
        <RefreshCw className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">出错了</p>
      <p className="max-w-sm break-all text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ text = '加载中…', className }: { text?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 px-6 py-12 text-xs text-muted-foreground', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}
