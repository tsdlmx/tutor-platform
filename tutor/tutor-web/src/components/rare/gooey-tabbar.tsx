import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { prefetchHandlers } from '@/router/prefetch';

export interface GooeyTabItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** 精确匹配（默认前缀匹配） */
  end?: boolean;
}

export interface GooeyTabbarProps {
  items: GooeyTabItem[];
  className?: string;
  /** 仅用于调试标识；同一时间只会有一个底栏 */
  idPrefix?: string;
}

/**
 * 每一栏的「匹配得分」，越大越优先：
 *   精确命中            → 1000 + 路径长度
 *   前缀命中（to + /）  → 路径长度
 *   不命中              → -1
 *
 * 为什么要算分：`/demands` 与 `/demands/new` 这类前缀关系会让两项同时命中，
 * 逐项判断会出现「两个 tab 同时高亮」。取唯一最高分即可。
 */
function matchScore(pathname: string, item: GooeyTabItem) {
  if (pathname === item.to) return 1000 + item.to.length;
  if (item.end) return -1;
  if (pathname.startsWith(`${item.to}/`)) return item.to.length;
  return -1;
}

/**
 * 底部标签栏 —— 全站客户侧共用（组件名沿用历史，视觉已改成克制版）：
 * 一条细的滑动指示条 + 主色图标/文字，没有气泡、没有模糊光晕。
 * 指示条位置用内联 `left` 百分比 + CSS transition 平滑移动，
 * 因此这个组件不依赖任何动画库（首屏不该为它背 42KB）。
 */
export function GooeyTabbar({ items, className }: GooeyTabbarProps) {
  const { pathname } = useLocation();

  const scores = items.map((item) => matchScore(pathname, item));
  const best = scores.reduce((max, s) => (s > max ? s : max), -1);
  const activeIndex = scores.findIndex((s) => best >= 0 && s === best);
  const count = Math.max(1, items.length);

  return (
    <nav
      aria-label="底部导航"
      className={cn(
        'glass fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <div className="relative mx-auto max-w-lg">
        {/* 滑动指示条：贴着底栏上沿，位置随激活项平滑移动 */}
        {activeIndex >= 0 ? (
          <span
            aria-hidden
            className="absolute top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary transition-[left] duration-300 ease-out"
            style={{ left: `${((activeIndex + 0.5) / count) * 100}%` }}
          />
        ) : null}

        <ul className="flex h-14 items-stretch px-1">
          {items.map((item, index) => {
            const active = activeIndex === index;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  {...prefetchHandlers(item.to)}
                  className={cn(
                    'flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 text-2xs transition-colors',
                    active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="[&_svg]:h-4.5 [&_svg]:w-4.5 [&_svg]:stroke-[1.75]">{item.icon}</span>
                  <span className="leading-4">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
