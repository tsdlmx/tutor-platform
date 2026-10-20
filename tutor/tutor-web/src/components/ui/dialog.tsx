import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return <DialogPrimitive.Overlay ref={ref} className={cn('rare-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]', className)} {...props} />;
});

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent({ className, children, hideClose = false, ...props }, ref) {
    return (
      <DialogPortal>
        <DialogOverlay />
        {/* 用 flex 居中，避免 translate 与入场动画的 transform 打架 */}
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              'rare-dialog pointer-events-auto relative grid w-full max-w-lg gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-lifted',
              className,
            )}
            {...props}
          >
            {children}
            {hideClose ? null : (
              <DialogPrimitive.Close
                // 与抽屉一致：44px 触控区，避免移动端点不中
                className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    );
  },
);

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 pr-6', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
});

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />;
});
