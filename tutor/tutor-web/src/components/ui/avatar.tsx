import * as React from 'react';
import { cn } from '@/lib/cn';
import { resolveAssetUrl } from '@/lib/constants';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'xl';
  rounded?: 'full' | 'lg';
}

const SIZES = {
  xs: 'h-6 w-6 text-2xs',
  sm: 'h-8 w-8 text-xs',
  default: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
} as const;

function initials(name?: string | null) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // 中文取后两字，英文取首字母
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-2);
  return trimmed.slice(0, 2).toUpperCase();
}

export function Avatar({ src, name, size = 'default', rounded = 'full', className, ...props }: AvatarProps) {
  const [broken, setBroken] = React.useState(false);
  const url = resolveAssetUrl(src);
  const showImg = Boolean(url) && !broken;

  return (
    <div
      className={cn(
        'relative flex shrink-0 select-none items-center justify-center overflow-hidden bg-muted font-medium text-muted-foreground',
        rounded === 'full' ? 'rounded-full' : 'rounded-lg',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {showImg ? (
        <img
          src={url}
          alt={name ?? 'avatar'}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
