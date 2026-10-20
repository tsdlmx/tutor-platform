import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  options: SelectOption[];
  /** 空值占位（value='' 的选项） */
  placeholder?: string;
  size?: 'sm' | 'default' | 'h5';
}

/**
 * 原生 select 的样式化封装 —— 与 shadcn 的视觉一致，但表单语义完整、
 * 移动端体验原生（H5 页面直接复用）。radix-select 也装好了，但原生更省事。
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, placeholder, size = 'default', ...props },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      <select
        ref={ref}
        className={cn(
          'w-full cursor-pointer appearance-none rounded-lg border border-input bg-background py-1 pr-8 text-sm shadow-hairline transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 pl-2.5 text-xs' : size === 'h5' ? 'h-11 pl-3.5 text-[15px]' : 'h-9 pl-3',
          className,
        )}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={String(o.value)} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
    </div>
  );
});
