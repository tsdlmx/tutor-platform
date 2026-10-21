/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选：不配置时每个请求必须显式带 baseURL，避免静默回落到退役后端 */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CUSTOMER_API_BASE_URL?: string;
  readonly VITE_WEB_API_PROXY_PREFIX?: string;
  readonly VITE_WEB_API_PROXY_TARGET?: string;
  readonly VITE_ADMIN_API_PROXY_PREFIX?: string;
  readonly VITE_ADMIN_API_PROXY_TARGET?: string;
  readonly VITE_ASSET_BASE_URL?: string;
  /** 隐私政策与用户协议的公开地址，供注册页链接；未配置时页面只显示文字 */
  readonly VITE_PRIVACY_POLICY_URL?: string;
  /** 登录态与主题在 localStorage 里的 key，可按部署覆盖 */
  readonly VITE_TOKEN_KEY?: string;
  readonly VITE_CUSTOMER_TOKEN_KEY?: string;
  readonly VITE_THEME_KEY?: string;
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __API_BASE__: string;
