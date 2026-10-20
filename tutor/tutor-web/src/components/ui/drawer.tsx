import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export type DrawerSide = 'right' | 'left' | 'bottom';

const SIDES: Record<DrawerSide, string> = {
  right: 'rare-drawer-right inset-y-0 right-0 h-full w-full max-w-md border-l',
  left: 'rare-drawer-left inset-y-0 left-0 h-full w-full max-w-md border-r',
  bottom: 'rare-drawer-bottom inset-x-0 bottom-0 max-h-[88vh] w-full rounded-t-2xl border-t',
};

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  side?: DrawerSide;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  footer,
  className,
  children,
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col border-border/70 bg-card shadow-lifted',
            SIDES[side],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle className="truncate text-sm">{title}</DialogTitle>
              {description ? <DialogDescription className="truncate">{description}</DialogDescription> : null}
            </div>
            <DialogPrimitive.Close
              // 关闭是移动端抽屉上最高频的动作：p-1 + 16px 图标只有 24px，
              // 这里给足 44px 触控区（视觉上仍只是一个 × 图标）
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/25 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
