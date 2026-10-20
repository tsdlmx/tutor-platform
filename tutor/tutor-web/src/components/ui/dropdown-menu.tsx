import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[60] min-w-[10rem] overflow-hidden rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-lifted',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { tone?: 'default' | 'destructive' }
>(function DropdownMenuItem({ className, tone = 'default', ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none',
        'transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        tone === 'destructive' && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-2xs text-muted-foreground', className)} {...props} />;
});

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border/70', className)} {...props} />;
});
