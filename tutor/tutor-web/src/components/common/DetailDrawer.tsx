import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';

export interface DetailField {
  label: ReactNode;
  value: ReactNode;
  /** 占两列 */
  span?: 1 | 2;
  /** 显示复制按钮（把 value 当纯文本复制） */
  copyable?: boolean;
  /** 值为空时的占位，默认 — */
  fallback?: string;
}

export interface DetailSection {
  title?: ReactNode;
  fields: DetailField[];
}

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  /** 单区块字段 */
  fields?: DetailField[];
  /** 多区块字段（与 fields 二选一或叠加） */
  sections?: DetailSection[];
  loading?: boolean;
  footer?: ReactNode;
  /** 追加自由内容（如头像、图片墙） */
  children?: ReactNode;
  side?: 'right' | 'left' | 'bottom';
  className?: string;
}

function isEmpty(v: ReactNode) {
  return v === null || v === undefined || v === '' || v === false;
}

function FieldRow({ field }: { field: DetailField }) {
  const [copied, setCopied] = useState(false);
  const text = typeof field.value === 'string' ? field.value : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('复制失败，请手动选择文本');
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-border/40 py-2.5 last:border-0',
        field.span === 2 && 'sm:col-span-2',
      )}
    >
      <span className="text-2xs text-muted-foreground">{field.label}</span>
      <span className="flex items-start gap-1.5 break-words text-xs leading-5">
        <span className="min-w-0 flex-1">{isEmpty(field.value) ? (field.fallback ?? '—') : field.value}</span>
        {field.copyable && text ? (
          <button
            type="button"
            onClick={copy}
            aria-label="复制"
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * DetailDrawer —— 右侧抽屉里的「标签/值」详情表。
 * 所有列表页的"查看详情"共用，避免每页写一遍。
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  fields,
  sections,
  loading = false,
  footer,
  children,
  side = 'right',
  className,
}: DetailDrawerProps) {
  const blocks: DetailSection[] = [
    ...(fields && fields.length ? [{ fields }] : []),
    ...(sections ?? []),
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? '详情'}
      description={description}
      side={side}
      footer={footer}
      className={className}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 border-b border-border/40 py-2.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full max-w-[15rem]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {children}
          {blocks.map((block, bi) => (
            <section key={bi} className="flex flex-col">
              {block.title ? (
                <h4 className="mb-1 text-xs font-medium text-muted-foreground">{block.title}</h4>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {block.fields.map((f, fi) => (
                  <FieldRow key={fi} field={f} />
                ))}
              </div>
            </section>
          ))}

          {!loading && blocks.length === 0 && !children ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无详情</p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

/** 详情动作按钮的便捷封装（抽屉底部常用） */
export function DrawerActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export { Button as DrawerButton };
