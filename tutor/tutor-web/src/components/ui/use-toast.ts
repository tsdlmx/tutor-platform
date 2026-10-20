import { useSyncExternalStore } from 'react';

export type ToastTone = 'default' | 'success' | 'error' | 'warning' | 'loading';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

export interface ToastOptions {
  description?: string;
  tone?: ToastTone;
  /** 毫秒；0 表示不自动关闭 */
  duration?: number;
}

type Listener = () => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l());
}

function dismiss(id: string) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

function push(title: string, opts: ToastOptions = {}): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ToastItem = {
    id,
    title,
    description: opts.description,
    tone: opts.tone ?? 'default',
    duration: opts.duration ?? 3200,
  };
  // 最多同时显示 4 条，超出丢弃最旧的
  items = [...items, item].slice(-4);
  emit();
  if (item.duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), item.duration),
    );
  }
  return id;
}

function update(id: string, patch: Partial<Omit<ToastItem, 'id'>>) {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
}

/** 命令式 toast —— 可在任何地方调用，不依赖 React 上下文 */
export const toast = Object.assign(
  (title: string, opts?: ToastOptions) => push(title, opts),
  {
    success: (title: string, opts?: ToastOptions) => push(title, { ...opts, tone: 'success' }),
    error: (title: string, opts?: ToastOptions) => push(title, { ...opts, tone: 'error', duration: opts?.duration ?? 4200 }),
    warning: (title: string, opts?: ToastOptions) => push(title, { ...opts, tone: 'warning' }),
    info: (title: string, opts?: ToastOptions) => push(title, { ...opts, tone: 'default' }),
    loading: (title: string, opts?: ToastOptions) => push(title, { ...opts, tone: 'loading', duration: 0 }),
    /** 把 loading 态就地改写为成功/失败 */
    resolve: (id: string, title: string, tone: ToastTone = 'success', description?: string) => {
      update(id, { title, tone, description, duration: 2600 });
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.set(
        id,
        setTimeout(() => dismiss(id), 2600),
      );
    },
    dismiss,
    clear: () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      items = [];
      emit();
    },
  },
);

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return items;
}

/** 订阅 toast 列表（供 Toaster 使用） */
export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type ToastApi = typeof toast;
