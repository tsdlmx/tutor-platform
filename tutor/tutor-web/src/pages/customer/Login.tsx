import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Lock, Mail, Sparkles } from 'lucide-react';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { accountHomePath, useCustomerAuth } from '@/store/customerAuth';
import { Badge, Button, Field, Input, toast } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 客户登录 —— 邮箱 + 密码（无验证码，与后台账号体系完全隔离） */
export default function CustomerLogin() {
  const { login, account, authenticated, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /* 已登录时直接进身份首页（引导期不闪登录表单） */
  if (!loading && authenticated) return <Navigate to={from || accountHomePath(account)} replace />;

  function validate() {
    const next: Record<string, string> = {};
    if (!form.email.trim()) next.email = '请输入邮箱';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = '邮箱格式不正确';
    if (!form.password) next.password = '请输入密码';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** 一边输入一边清掉该字段的旧报错：改对了红字立刻消失，不用再点一次登录才知道 */
  function setField(key: 'email' | 'password', value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const info = await login({ email: form.email.trim(), password: form.password });
      toast.success('登录成功', { description: `欢迎回来，${info.nickname || info.email}` });
      // 未选身份 → /choose-role；已选身份 → 对应首页
      navigate(from || accountHomePath(info), { replace: true });
    } catch (err) {
      toast.error('登录失败', { description: err instanceof Error ? err.message : '请检查邮箱或密码' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">

      <div className="absolute right-3 top-3 z-10">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
        </Button>
      </div>

      <div
        className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft md:grid-cols-[1.05fr_1fr]"
      >
        {/* 品牌区（桌面端） */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary/[0.04] p-8 md:flex">

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">{APP_NAME}</p>
                <p className="text-2xs text-muted-foreground">{APP_SUBTITLE}</p>
              </div>
            </div>

            <h1 className="mt-10 text-2xl font-semibold leading-snug tracking-tight">
              学生发布需求
              <br />
              老师筛选学员
            </h1>
            <p className="mt-3 max-w-xs text-xs leading-5 text-muted-foreground">
              用邮箱注册即可使用，登录后按身份进入老师端或学生端。
            </p>
          </div>

          <ul className="relative mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-warning" />
              老师端汇总全部待接需求
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-warning" />
              学生端管理自己的全部需求
            </li>
          </ul>
        </div>

        {/* 表单区 */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">登录</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">使用邮箱与密码登录</p>
            </div>
            <Badge tone="muted" className="md:hidden">
              客户登录
            </Badge>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="邮箱" htmlFor="email" error={errors.email} required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="请输入邮箱"
                icon={<Mail />}
                value={form.email}
                invalid={Boolean(errors.email)}
                onChange={(e) => setField('email', e.target.value)}
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
                onChange={(e) => setField('password', e.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? '登录中…' : '登 录'}
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span>
              还没有账号？
              <Link to="/register" className="ml-1 font-medium text-primary hover:underline">
                立即注册
              </Link>
            </span>
            <Link to="/forgot-password" className="transition-colors hover:text-foreground">
              忘记密码？
            </Link>
            <Link to="/tutors" className="transition-colors hover:text-foreground">
              先逛逛公开家教 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
