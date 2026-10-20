import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, KeyRound, Lock, RefreshCw, ShieldCheck, Smartphone, User } from 'lucide-react';
import * as authApi from '@/api/auth';
import { getCompat } from '@/lib/httpCompat';
import { APP_NAME, APP_SUBTITLE, HOME_PATH, resolveAssetUrl } from '@/lib/constants';
import type { CaptchaImage } from '@/types/api';
import { useAuth } from '@/store/auth';
import { Badge, Button, Field, Input, Spinner, toast } from '@/components/ui';
import { ThemeToggle } from '@/components/common';

export default function Login() {
  const { login, authenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [form, setForm] = useState({ username: '', password: '', code: '' });
  const [uuid, setUuid] = useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState(true);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError(null);
    try {
      let res = await authApi.getCaptchaImage();
      // 兜底：RuoYi 原生 /captchaImage 平铺返回 { code, img, uuid, captchaEnabled }
      if (!res || (!res.img && !res.uuid)) {
        res = await getCompat<CaptchaImage>('/captchaImage');
      }
      setCaptchaEnabled(res?.captchaEnabled !== false);
      setUuid(res?.uuid ?? '');
      setCaptchaImg(res?.img ?? '');
      if (res?.captchaEnabled === false) setForm((f) => ({ ...f, code: '' }));
    } catch (e) {
      setCaptchaError(e instanceof Error ? e.message : '验证码加载失败');
      setCaptchaEnabled(false);
      setCaptchaImg('');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  if (authenticated) return <Navigate to={from || HOME_PATH} replace />;

  function validate() {
    const next: Record<string, string> = {};
    if (!form.username.trim()) next.username = '请输入账号';
    if (!form.password) next.password = '请输入密码';
    if (captchaEnabled && !form.code.trim()) next.code = '请输入验证码';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      await login({
        username: form.username.trim(),
        password: form.password,
        code: captchaEnabled ? form.code.trim() : '',
        uuid: captchaEnabled ? uuid : '',
      });
      toast.success('登录成功', { description: '欢迎回到 ' + APP_NAME });
      navigate(from || HOME_PATH, { replace: true });
    } catch (err) {
      toast.error('登录失败', { description: err instanceof Error ? err.message : '请检查账号或密码' });
      setForm((f) => ({ ...f, code: '' }));
      void loadCaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  const logoSrc = resolveAssetUrl('/logo.png');

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/tutors">
            <Smartphone className="h-3.5 w-3.5" />
            移动端
          </a>
        </Button>
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-hairline md:grid-cols-[1.05fr_1fr]">
        {/* 品牌区 */}
        <div className="relative hidden flex-col justify-between border-r border-border/60 bg-muted/30 p-8 md:flex">
          <div className="relative">
            <div className="flex items-center gap-2.5">
              {logoSrc && !dark ? (
                <img src={logoSrc} alt={APP_NAME} className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="h-5 w-5" />
                </span>
              )}
              <div>
                <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
                <p className="text-2xs text-muted-foreground">{APP_SUBTITLE}</p>
              </div>
            </div>

            <h1 className="mt-10 text-2xl font-semibold leading-snug tracking-tight">
              家教档案审核
              <br />
              与运营管理后台
            </h1>
            <p className="mt-3 max-w-xs text-xs leading-5 text-muted-foreground">
              家教资质审核、入驻老师与学生账号、日志与系统监控 —— 一个后台完成全部运营动作。
            </p>
          </div>

          <ul className="relative mt-8 flex flex-col gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              家教资质一键审核（通过 / 拒绝并留痕）
            </li>
            <li className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-success" />
              RuoYi 权限体系，菜单按角色可见
            </li>
          </ul>
        </div>

        {/* 表单区 */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">账号登录</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">请使用管理后台账号登录</p>
            </div>
            <Badge tone="muted" className="md:hidden">
              管理端
            </Badge>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="账号" htmlFor="username" error={errors.username} required>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="请输入登录账号"
                icon={<User />}
                value={form.username}
                invalid={Boolean(errors.username)}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </Field>

            <Field label="密码" htmlFor="password" error={errors.password} required>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                icon={<Lock />}
                value={form.password}
                invalid={Boolean(errors.password)}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Field>

            {captchaEnabled ? (
              <Field
                label="验证码"
                htmlFor="code"
                error={errors.code}
                hint={captchaError ? `验证码接口异常：${captchaError}` : undefined}
                required
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="code"
                    name="code"
                    autoComplete="off"
                    placeholder="请输入验证码"
                    className="flex-1"
                    value={form.code}
                    invalid={Boolean(errors.code)}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    title="点击刷新验证码"
                    aria-label="刷新验证码"
                    className="relative flex h-9 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input bg-muted/40 transition-colors hover:border-ring/50"
                  >
                    {captchaLoading ? (
                      <Spinner size="sm" />
                    ) : captchaImg ? (
                      <img
                        src={captchaImg.startsWith('data:') ? captchaImg : `data:image/gif;base64,${captchaImg}`}
                        alt="验证码"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3" />
                        点击刷新
                      </span>
                    )}
                  </button>
                </div>
              </Field>
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-2xs text-muted-foreground">
                后端已关闭验证码（captchaEnabled=false），直接使用账号密码登录。
              </p>
            )}

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? '登录中…' : '登 录'}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-2xs text-muted-foreground">
            <span>仅限授权运营人员访问</span>
            <a href="/tutors" className="transition-colors hover:text-foreground">
              前往 H5 端 →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
