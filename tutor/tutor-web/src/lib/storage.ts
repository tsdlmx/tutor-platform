import { TOKEN_KEY, THEME_KEY } from '@/lib/constants';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export type ThemeMode = 'light' | 'dark';

export const themeStore = {
  get(): ThemeMode {
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === 'dark' || v === 'light') return v;
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  },
  set(mode: ThemeMode) {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore */
    }
    applyTheme(mode);
  },
};

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0a0b' : '#ffffff');
}
