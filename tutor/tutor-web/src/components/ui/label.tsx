import * as React from 'react';
import { cn } from '@/lib/cn';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, required, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn('flex items-center gap-1 text-xs font-medium text-foreground/80', className)}
      {...props}
    >
      {children}
      {required ? <span className="text-destructive">*</span> : null}
    </label>
  );
});

/** 表单行：标签 + 控件 + 错误提示 */
export function Field({
  label,
  required,
  error,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-2xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-2xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
