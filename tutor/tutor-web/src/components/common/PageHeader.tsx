import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 显示返回箭头（H5 详情页常用） */
  back?: boolean;
  onBack?: () => void;
  /** 右侧操作区 */
  children?: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function PageHeader({
  title,
  description,
  back = false,
  onBack,
  children,
  className,
  sticky = false,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3',
        sticky && 'glass sticky top-0 z-30 -mx-4 mb-4 border-b border-border/60 px-4 py-3 sm:-mx-6 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {back ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="返回"
            onClick={() => (onBack ? onBack() : navigate(-1))}
            // 返回是手机上的高频操作：icon-sm 只有 32px，这里补到 44px 触控高度
            className="h-11 w-11 shrink-0 md:h-8 md:w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>

      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
