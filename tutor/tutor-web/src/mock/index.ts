import type { AxiosAdapter } from 'axios';

/**
 * 占位 mock 适配器。
 *
 * 本项目默认直连真实后端（见 .env.development 里的 VITE_USE_MOCK=false），
 * 这个文件的存在只是为了满足 api/request.ts 里的类型引用。
 *
 * 如果有人把 VITE_USE_MOCK 打开，这里会明确抛错，而不是静默返回假数据 ——
 * 免得"看起来能跑"但其实是空壳。
 */
export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toUpperCase();
  throw new Error(
    `[tutor-web] VITE_USE_MOCK=true，但本项目未实现 mock 数据。` +
      `请把 .env 里的 VITE_USE_MOCK 改为 false 以直连后端。` +
      `（被拦截的请求：${method} ${config.url ?? ''}）`,
  );
};
