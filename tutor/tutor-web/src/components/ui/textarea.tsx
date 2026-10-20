import * as React from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-hairline transition-colors',
        'placeholder:text-muted-foreground/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-destructive/70 focus-visible:ring-destructive/30' : 'border-input',
        className,
      )}
      {...props}
    />
  );
});
