import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast, useToasts, type ToastTone } from '@/components/ui/use-toast';

const ICONS: Record<ToastTone, React.ReactNode> = {
  default: <Info className="h-4 w-4 text-muted-foreground" />,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  loading: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
};

const ACCENT: Record<ToastTone, string> = {
  default: 'before:bg-border',
  success: 'before:bg-success',
  error: 'before:bg-destructive',
  warning: 'before:bg-warning',
  loading: 'before:bg-muted-foreground/40',
};

/** 全局提示视口 —— 固定右上角，移动端自动收窄 */
export function Toaster() {
  const items = useToasts();

  return (
    <div
      className="pointer-events-none fixed right-0 top-0 z-[100] flex w-full max-w-[min(92vw,22rem)] flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4"
      role="region"
      aria-live="polite"
    >
      {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rare-toast-in',
              'pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-border/70 bg-card/95 p-3 pl-4 shadow-lifted backdrop-blur',
              'before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[""]',
              ACCENT[t.tone],
            )}
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-5">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 break-all text-2xs leading-4 text-muted-foreground">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              aria-label="关闭提示"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
      ))}
    </div>
  );
}

/**
 * 挂载 Toaster 的 Provider。
 * toast 的 store 是模块级的（命令式调用无需 Provider），
 * 这里保留 Provider 形态是为了让 App 根部的组合更直观、并为将来扩展留口子。
 */
export function ToastProvider({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
