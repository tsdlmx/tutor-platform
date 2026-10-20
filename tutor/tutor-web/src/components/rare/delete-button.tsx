import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button';

export interface DeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  /** 默认文案 */
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  /** 是否显示垃圾桶图标 */
  icon?: boolean;
  /** 触发确认后自动取消的毫秒数 */
  timeout?: number;
}

/**
 * delete-button —— 破坏性操作就地二次确认（不弹模态框）。
 * 点击后按钮组横向展开为「确认删除 / 取消」，3 秒内无操作自动回退。
 */
export function DeleteButton({
  onConfirm,
  label = '删除',
  confirmLabel = '确认删除',
  cancelLabel = '取消',
  size = 'sm',
  variant = 'ghost',
  className,
  disabled,
  icon = true,
  timeout = 3000,
}: DeleteButtonProps) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), timeout);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed, timeout]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      setArmed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('inline-flex items-center', className)}>
      {armed ? (
          <div className="rare-rise inline-flex items-center gap-1">
            <Button
              variant="destructive"
              size={size}
              disabled={busy}
              onClick={confirm}
              className="whitespace-nowrap"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {confirmLabel}
            </Button>
            <Button
              variant="ghost"
              size={size}
              disabled={busy}
              onClick={() => setArmed(false)}
              aria-label={cancelLabel}
              className="px-2"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">{cancelLabel}</span>
            </Button>
          </div>
        ) : (
          <div className="rare-rise">
            <Button
              variant={variant}
              size={size}
              disabled={disabled}
              onClick={() => setArmed(true)}
              className="whitespace-nowrap text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {icon ? <Trash2 className="h-3.5 w-3.5" /> : null}
              {label}
            </Button>
          </div>
        )}
    </div>
  );
}
