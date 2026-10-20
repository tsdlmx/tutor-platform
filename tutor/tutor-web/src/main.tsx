import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { applyTheme, themeStore } from '@/lib/storage';
import '@/styles/globals.css';
import '@/styles/rare.css';

/* 首屏就把持久化的主题打到 <html> 上，避免暗色用户看到白闪 */
applyTheme(themeStore.get());

const container = document.getElementById('root');
if (!container) throw new Error('#root 节点不存在，检查 index.html');

/** 移除 index.html 里的静态 loading 占位 */
document.getElementById('app-boot')?.remove();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
