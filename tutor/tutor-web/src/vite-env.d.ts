/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：不配置时每个请求必须显式带 baseURL，避免静默回落到退役后端 */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CUSTOMER_API_BASE_URL?: string;
  readonly VITE_PROXY_PREFIX?: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_WEB_API_PROXY_PREFIX?: string;
  readonly VITE_WEB_API_PROXY_TARGET?: string;
  readonly VITE_ADMIN_API_PROXY_PREFIX?: string;
  readonly VITE_ADMIN_API_PROXY_TARGET?: string;
  readonly VITE_ASSET_BASE_URL?: string;
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __API_BASE__: string;
