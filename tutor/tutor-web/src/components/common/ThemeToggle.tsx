import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { applyTheme, themeStore, type ThemeMode } from '@/lib/storage';
import { Button } from '@/components/ui/button';

export interface ThemeToggleProps {
  className?: string;
  /** 'icon' 只显示图标；'switch' 显示为一行可点击的开关行 */
  variant?: 'icon' | 'switch';
}

/**
 * ThemeToggle —— 亮/暗切换。主题写在 <html class="dark">，与 globals.css 的变量对应。
 * 首次挂载时把持久化主题应用到 DOM（main.tsx 里已经先跑了一次，这里做兜底）。
 */
export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>(() => themeStore.get());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function toggle() {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    themeStore.set(next);
  }

  const isDark = mode === 'dark';

  if (variant === 'switch') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isDark}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-accent',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          {isDark ? '深色模式' : '浅色模式'}
        </span>
        <span
          className={cn(
            'relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors',
            isDark ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
          style={{ height: '1.125rem', width: '2rem' }}
        >
          <span
            className={cn(
              'block h-3.5 w-3.5 rounded-full bg-background shadow-hairline transition-transform duration-200',
              isDark ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      className={cn('overflow-hidden', className)}
    >
      {/* 图标切换只用 CSS 过渡：这条路径在首屏上，不值得为它背一个动画库 */}
      <span key={mode} className="flex items-center justify-center transition-transform duration-200">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </Button>
  );
}
