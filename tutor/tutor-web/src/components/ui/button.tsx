import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'link';

export type ButtonSize = 'sm' | 'default' | 'lg' | 'h5' | 'icon' | 'icon-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-hairline',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-hairline',
  success: 'bg-success text-success-foreground hover:bg-success/90 shadow-hairline',
  warning: 'bg-warning text-warning-foreground hover:bg-warning/90 shadow-hairline',
  link: 'text-primary underline-offset-4 hover:underline h-auto p-0',
};

/**
 * 尺寸约定：
 * - 断点前（<md，手机 / H5）一律 ≥44px 触控高度，md 之后回到原来的桌面密度，
 *   业务代码不用逐处写 `className="h-11"`，也不会「手机上好点、桌面上太肿」。
 * - `h5` 是明确的「移动优先 44px」尺寸，用在以手机为主的主操作上（如详情页拨打）。
 * - `icon` / `icon-sm` 保持紧凑：只用于表格行、分页这类密集区域的图标按钮；
 *   放大到 44px 会让分页条在 320-360px 屏上溢出。
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 rounded-md px-3 text-xs gap-1.5 md:h-8',
  default: 'h-11 rounded-lg px-4 text-sm gap-2 md:h-9',
  lg: 'h-11 rounded-lg px-6 text-sm gap-2 md:h-10',
  h5: 'h-11 rounded-xl px-5 text-[15px] gap-2',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-8 w-8 rounded-md',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 渲染为子元素（如 react-router 的 Link），保留样式 */
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const Comp: React.ElementType = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      // Slot 需要一个可接收 ref 的单一子元素
      disabled={asChild ? undefined : disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        VARIANTS[variant],
        variant !== 'link' && SIZES[size],
        className,
      )}
      {...props}
    >
      {/*
        重要：Radix 的 Slot 要求「恰好一个」React 元素子节点。
        原来的写法把 {loading ? <span/> : null} 和 {children} 并列，
        即使不 loading，React.Children.count 也是 2（null 也算一个），
        Slot 会抛 "Slot failed to slot onto its children."，
        导致整个页面白屏 —— 登录页就是这么挂的，用户根本登不进去。
        所以 asChild 时必须原样透传 children；loading 指示器只在原生 button 上加。
      */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : null}
          {children}
        </>
      )}
    </Comp>
  );
});
