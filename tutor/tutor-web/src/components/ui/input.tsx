import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 前缀图标（左侧） */
  icon?: React.ReactNode;
  /** 右侧附加内容 */
  suffix?: React.ReactNode;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, suffix, invalid, ...props },
  ref,
) {
  const base = cn(
    'flex h-9 w-full rounded-lg border bg-background px-3 py-1 text-sm shadow-hairline transition-colors',
    'placeholder:text-muted-foreground/70',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring/50',
    'disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-destructive/70 focus-visible:ring-destructive/30' : 'border-input',
    className,
  );

  if (!icon && !suffix) return <input ref={ref} className={base} {...props} />;

  return (
    <div className="relative flex w-full items-center">
      {icon ? (
        <span className="pointer-events-none absolute left-3 flex text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      ) : null}
      <input ref={ref} className={cn(base, icon && 'pl-9', suffix && 'pr-9')} {...props} />
      {suffix ? <span className="absolute right-2 flex items-center text-muted-foreground">{suffix}</span> : null}
    </div>
  );
});
