import * as React from 'react';
import { cn } from '@/lib/cn';

/* shadcn 风格的轻量表格原语 —— 无第三方依赖，样式由调用方组合 */

export const TableWrapper = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function TableWrapper({ className, ...props }, ref) {
    return <div ref={ref} className={cn('relative w-full overflow-x-auto', className)} {...props} />;
  },
);

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  function Table({ className, ...props }, ref) {
    return <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />;
  },
);

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-border/70', className)} {...props} />;
  },
);

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
  },
);

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          'border-b border-border/50 transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn(
          'h-10 whitespace-nowrap bg-muted/40 px-3 text-left align-middle text-xs font-medium text-muted-foreground',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
  },
);

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('mt-3 text-xs text-muted-foreground', className)} {...props} />;
}
