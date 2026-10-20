import * as React from 'react';
import { cn } from '@/lib/cn';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(
  function Card({ className, interactive = false, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-border/70 bg-card text-card-foreground shadow-hairline',
          interactive && 'transition-shadow duration-200 hover:shadow-soft',
          className,
        )}
        {...props}
      />
    );
  },
);

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
  },
);

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn('text-sm font-semibold leading-none tracking-tight', className)} {...props} />;
  },
);

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />;
  },
);

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />;
  },
);

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex items-center gap-2 border-t border-border/60 p-4', className)} {...props} />;
  },
);
