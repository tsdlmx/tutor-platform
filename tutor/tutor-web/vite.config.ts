import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/*
  安全响应头（dev / preview 都生效）。
  注意：这里**故意不发 HSTS** —— 现在用的是自签证书，一旦浏览器记住 HSTS，
  证书还没换成受信任的就再也点不进「继续前往」了。等换上真证书再加。
*/
function securityHeaders() {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  };
  const apply = (server: { middlewares: { use: (fn: (req: unknown, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use((_req, res, next) => {
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      next();
    });
  };
  return {
    name: 'tutor-security-headers',
    configureServer: apply,
    configurePreviewServer: apply,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiBase = env.VITE_API_BASE_URL || '';
  const proxyPrefix = env.VITE_PROXY_PREFIX || '/dev-api';
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:18080';
  const webApiProxyPrefix = env.VITE_WEB_API_PROXY_PREFIX || '/web-api';
  const webApiProxyTarget = env.VITE_WEB_API_PROXY_TARGET || 'http://127.0.0.1:12501';
  const adminApiProxyPrefix = env.VITE_ADMIN_API_PROXY_PREFIX || '/admin-api';
  const adminApiProxyTarget = env.VITE_ADMIN_API_PROXY_TARGET || 'http://127.0.0.1:12501';

  /*
    TLS 开关（默认关闭 = 走 HTTP）：
      WEB_TLS=1 bash bin-linux/4-web.sh     -> 用 data/tls/server.{crt,key} 起 HTTPS
    为什么做成开关而不是一直开着：目前只有公网 IP、没有域名，公共 CA 不给裸 IP
    签证书，自签证书会让浏览器报「不受信任」。等域名下来、换上受信任证书后，
    把 WEB_TLS=1 打开即可（证书放 data/tls/，由 bin-linux/7-tls-cert.sh 管理）。
    证书缺失时即使开了开关也只是打印警告并退回 HTTP，不会把自己锁在门外。
  */
  const tlsDir = path.resolve(rootDir, '../../data/tls');
  const tlsKey = path.join(tlsDir, 'server.key');
  const tlsCrt = path.join(tlsDir, 'server.crt');
  const tlsRequested = process.env.WEB_TLS === '1';
  const tlsReady = fs.existsSync(tlsKey) && fs.existsSync(tlsCrt);
  if (tlsRequested && !tlsReady) {
    console.warn('[tutor] WEB_TLS=1 但缺少 data/tls/server.crt|server.key，本次仍以 HTTP 启动');
  }
  const https =
    tlsRequested && tlsReady
      ? { key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCrt) }
      : undefined;

  // 开发（vite dev）和预览（vite preview）用同一套代理规则，避免两处不一致
  const proxy = {
    [proxyPrefix]: {
      target: proxyTarget,
      changeOrigin: true,
      xfwd: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${proxyPrefix}`), ''),
    },
    // Customer and migrated admin APIs run on Go; remaining admin routes stay on Java.
    [webApiProxyPrefix]: {
      target: webApiProxyTarget,
      changeOrigin: true,
      xfwd: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${webApiProxyPrefix}`), ''),
    },
    [adminApiProxyPrefix]: {
      target: adminApiProxyTarget,
      changeOrigin: true,
      xfwd: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${adminApiProxyPrefix}`), ''),
    },
  };

  return {
    plugins: [react(), securityHeaders()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
      /*
        对外映射到公网：
          host 从 127.0.0.1 改成 0.0.0.0（否则只监听回环，公网连不上）
          port 从 5173 改成 12500（云安全组只放行了 12500/12501）
          strictPort 改成 true —— 端口被占时必须直接失败，
          否则 Vite 会静默换一个端口，公网映射就指向空气了。
      */
      host: '0.0.0.0',
      port: 12500,
      strictPort: true,
      https,
      // 公网按 IP 访问，把这几个 Host 显式列出来（Vite 有 Host 头校验）
      allowedHosts: ['82.156.178.102', 'localhost', '127.0.0.1'],
      watch: {
        /*
          为什么需要这个：
          本机的文件写入方式是「先写临时目录、再改名」，会在 src 下短暂出现
          .button.tsx.<pid>.<uuid>.tmpdir/button.tsx.tmp 这类路径。
          chokidar 会去 watch 这些临时目录，等它被改名后 Node 直接抛
          EBUSY: resource busy or locked 并以退出码 1 杀掉整个 dev server
          （实测触发过两次）。把这类临时产物排除掉即可稳定运行。
        */
        ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/.~*', '**/*~'],
      },
      proxy,
    },
    /*
      preview 是给「打包分发」用的：直接伺服 dist 里的生产构建产物。
      相比 vite dev，它不监听文件（因此不会有上面那个 EBUSY 崩溃），
      启动更快，也不带 HMR 客户端，更接近真实部署。
      用 vite preview 需要生产环境变量，见 .env.production。
    */
    preview: {
      // 公网入口：HTTPS on 12500（bin-linux/4-web.sh 会显式传 --host 0.0.0.0 --port 12500）
      https,
      port: 4173,
      strictPort: true,
      proxy,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          /*
            分包策略（首屏速度的关键）：
              react  —— 框架本体，首屏就要，单独一格便于长缓存。
            recharts 特意**不**在这里手动分包：它只有后台「数据概览」用得到，
            手动指定会让它变成入口的静态依赖，index.html 里会被加一条
            modulepreload —— 结果就是每个访客（包括手机上的客户）都要先下 400KB
            用不上的图表库。交给按路由 lazy 的 Dashboard 自带即可。
          */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    define: {
      __API_BASE__: JSON.stringify(apiBase),
    },
  };
});
