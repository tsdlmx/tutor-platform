import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/store/auth';
import { CustomerAuthProvider } from '@/store/customerAuth';
import { ToastProvider } from '@/components/ui';
import { AppRoutes } from '@/router';

/**
 * 应用根：BrowserRouter
 *   -> AuthProvider（管理后台登录态，需要 useNavigate 做 401 跳转）
 *   -> CustomerAuthProvider（客户登录态，独立 token / 独立 401 跳转）
 *   -> ToastProvider（全局提示视口）
 *   -> 路由表
 *
 * 两个 store 互不影响：后台 token 与客户 token 存在不同的 localStorage key。
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CustomerAuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </CustomerAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
