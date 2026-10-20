import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import * as customerApi from '@/api/customer';
import { cn } from '@/lib/cn';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';
import { accountHomePath, useCustomerAuth } from '@/store/customerAuth';
import { Badge, Button, Field, Input, toast } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 注册的三步：把原来一屏塞满的表单拆成翻页式
 *   1) 验证邮箱（邮箱 + 验证码）
 *   2) 设置密码（密码 + 确认密码）
 *   3) 完成注册（昵称选填）
 * 每步只显示自己的字段，校验通过才能「下一步」，最后一步才真正提交。
 */
const STEPS = [
  { title: '验证邮箱', desc: '用邮箱收一条验证码' },
  { title: '设置密码', desc: '6-32 位，建议字母加数字' },
  { title: '完成注册', desc: '起个昵称，然后开始使用' },
];

/** 每一步负责校验哪些字段 */
const STEP_FIELDS: string[][] = [['email', 'code'], ['password', 'confirm'], ['nickname']];

export default function CustomerRegister() {
  const { register, account, authenticated, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // 从 URL 读取预设角色
  const presetRole = (() => {
    const r = searchParams.get('role')?.toUpperCase();
    return r === 'TEACHER' || r === 'STUDENT' ? r : null;
  })();

  const [form, setForm] = useState({ email: '', code: '', password: '', confirm: '', nickname: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  /** 当前步骤（0 起） */
  const [step, setStep] = useState(0);
  /** 重发倒计时（秒） */
  const [countdown, setCountdown] = useState(0);
  /** 未配置 SMTP 时后端会把验证码回显出来，页面上给个提示，方便本地联调 */
  const [devNotice, setDevNotice] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  /** 发送验证码：先做前端校验，避免白跑一趟后端 */
  async function onSendCode() {
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) {
      setErrors((e) => ({ ...e, email: '请先填写正确的邮箱' }));
      return;
    }
    setSending(true);
    try {
      const res = await customerApi.sendCode(email);
      setCountdown(res.resendAfter || 60);
      setErrors((e) => ({ ...e, code: undefined as unknown as string }));
      if (res.devCode) {
        // 没有 SMTP：验证码不落邮箱，后端回显出来，这里提示一下（上线前关掉 dev-mode）
        setDevNotice(`开发模式验证码：${res.devCode}（未配置 SMTP，仅本地联调可见）`);
        toast.success('验证码已生成', { description: res.devNotice || '请查看提示中的验证码' });
      } else {
        setDevNotice('');
        toast.success('验证码已发送', {
          description: `请查收邮件，${Math.round((res.expiresIn || 300) / 60)} 分钟内有效`,
        });
      }
    } catch (err) {
      toast.error('发送失败', { description: err instanceof Error ? err.message : '请稍后重试' });
    } finally {
      setSending(false);
    }
  }

  if (!loading && authenticated) return <Navigate to={accountHomePath(account)} replace />;

  /** 全部字段的校验结果（一次算完，分步取用） */
  function computeErrors(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.email.trim()) next.email = '请输入邮箱';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = '邮箱格式不正确';
    if (!form.code.trim()) next.code = '请填写邮箱验证码';
    else if (!/^\d{6}$/.test(form.code.trim())) next.code = '验证码是 6 位数字';
    if (!form.password) next.password = '请输入密码';
    else if (form.password.length < 6 || form.password.length > 32) next.password = '密码长度需在 6-32 位之间';
    if (!form.confirm) next.confirm = '请再次输入密码';
    else if (form.confirm !== form.password) next.confirm = '两次输入的密码不一致';
    if (form.nickname.trim().length > 20) next.nickname = '昵称不能超过 20 个字';
    return next;
  }

  /** 只校验当前这一步 */
  function validateStep(target: number): boolean {
    const all = computeErrors();
    const next: Record<string, string> = {};
    STEP_FIELDS[target].forEach((k) => {
      if (all[k]) next[k] = all[k];
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setErrors({});
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goPrev() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 没到最后一步时，回车等于「下一步」
    if (step < STEPS.length - 1) {
      goNext();
      return;
    }
    if (submitting) return;
    // 提交前把三步的校验整体再跑一遍；有错就跳到出错的那一步
    const all = computeErrors();
    setErrors(all);
    if (Object.keys(all).length > 0) {
      const badStep = STEP_FIELDS.findIndex((keys) => keys.some((k) => all[k]));
      if (badStep >= 0) setStep(badStep);
      return;
    }

    setSubmitting(true);
    try {
      const nickname = form.nickname.trim();
      const info = await register({
        email: form.email.trim(),
        password: form.password,
        code: form.code.trim(),
        ...(nickname ? { nickname } : {}),
      });
      
      // 如果 URL 带了预设角色，自动设置并跳转到对应首页
      if (presetRole && !info.role) {
        try {
          await customerApi.setRole(presetRole);
          toast.success('注册成功', { description: `欢迎${presetRole === 'TEACHER' ? '老师' : '同学'}` });
          // 更新本地状态后跳转
          navigate(presetRole === 'TEACHER' ? '/teacher' : '/student', { replace: true });
          return;
        } catch (err) {
          // 设置角色失败，降级到选择身份页面
          console.warn('自动设置角色失败:', err);
        }
      }
      
      toast.success('注册成功', { description: '接下来选择你的身份，开始使用平台' });
      // 注册后 account.role 为 null，统一进「选择身份」
      navigate(info.role ? accountHomePath(info) : '/choose-role', { replace: true });
    } catch (err) {
      toast.error('注册失败', { description: err instanceof Error ? err.message : '请稍后重试' });
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
              {presetRole === 'TEACHER' ? '注册老师账号' : presetRole === 'STUDENT' ? '注册学生账号' : '邮箱注册'}
              <br />
              一分钟开始{presetRole === 'TEACHER' ? '接单' : '发布需求'}
            </h1>
            <p className="mt-3 max-w-xs text-xs leading-5 text-muted-foreground">
              注册只需邮箱与密码，不需要企业资质或手机验证码。
            </p>
          </div>

          <ul className="relative mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              客户账号与后台账号完全隔离
            </li>
            {!presetRole && (
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                注册后自由选择老师 / 学生身份
              </li>
            )}
          </ul>
        </div>

        {/* 表单区 */}
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">注册账号</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                第 {step + 1} / {STEPS.length} 步 · {STEPS[step].desc}
              </p>
            </div>
            <Badge tone="muted" className="md:hidden">
              客户注册
            </Badge>
          </div>

          {/* 步骤指示器 */}
          <ol className="mb-5 flex items-center gap-2">
            {STEPS.map((st, i) => (
              <li key={st.title} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-medium transition-colors',
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/40'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'truncate text-2xs',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {st.title}
                </span>
                {i < STEPS.length - 1 ? (
                  <span className={cn('h-px flex-1', i < step ? 'bg-primary/40' : 'bg-border')} />
                ) : null}
              </li>
            ))}
          </ol>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {/* 步骤内容：只渲染当前这一步，切换时带一点动效 */}
            <div className="min-h-[172px]">
              {step === 0 ? (
                <div
                  key="step-0"
                  className="flex flex-col gap-4"
                >
                  <Field label="邮箱" htmlFor="email" error={errors.email} required>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="用于登录的邮箱"
                      icon={<Mail />}
                      value={form.email}
                      invalid={Boolean(errors.email)}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </Field>

                  <Field
                    label="邮箱验证码"
                    htmlFor="code"
                    error={errors.code}
                    hint={devNotice || '点右侧按钮发送到你的邮箱，6 位数字，5 分钟内有效'}
                    required
                  >
                    <div className="flex items-start gap-2">
                      <Input
                        id="code"
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6 位验证码"
                        icon={<KeyRound />}
                        className="flex-1"
                        value={form.code}
                        invalid={Boolean(errors.code)}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '') }))}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        loading={sending}
                        disabled={countdown > 0}
                        onClick={() => void onSendCode()}
                      >
                        {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
                      </Button>
                    </div>
                  </Field>
                </div>
              ) : null}

              {step === 1 ? (
                <div
                  key="step-1"
                  className="flex flex-col gap-4"
                >
                  <Field
                    label="密码"
                    htmlFor="password"
                    error={errors.password}
                    hint="6-32 位，建议包含字母与数字"
                    required
                  >
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="请设置密码"
                      icon={<Lock />}
                      value={form.password}
                      invalid={Boolean(errors.password)}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </Field>

                  <Field label="确认密码" htmlFor="confirm" error={errors.confirm} required>
                    <Input
                      id="confirm"
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      placeholder="请再次输入密码"
                      icon={<Lock />}
                      value={form.confirm}
                      invalid={Boolean(errors.confirm)}
                      onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                    />
                  </Field>
                </div>
              ) : null}

              {step === 2 ? (
                <div
                  key="step-2"
                  className="flex flex-col gap-4"
                >
                  <Field label="昵称（选填）" htmlFor="nickname" error={errors.nickname} hint="会显示在需求单上">
                    <Input
                      id="nickname"
                      name="nickname"
                      autoComplete="nickname"
                      placeholder="不填则使用邮箱前缀"
                      icon={<UserRound />}
                      value={form.nickname}
                      invalid={Boolean(errors.nickname)}
                      onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                    />
                  </Field>

                  <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-2xs text-muted-foreground">
                    <p className="flex items-center justify-between gap-2">
                      <span>注册邮箱</span>
                      <span className="truncate font-medium text-foreground">{form.email.trim()}</span>
                    </p>
                    <p className="mt-1.5 flex items-center gap-1 text-2xs">
                      <ShieldCheck className="h-3 w-3 text-success" />
                      注册完成后会让你选择「老师」或「学生」身份
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 翻页操作 */}
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button type="button" variant="outline" className="flex-1" onClick={goPrev}>
                  上一步
                </Button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button type="button" className="flex-1" onClick={goNext}>
                  下一步
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" className="flex-1" loading={submitting}>
                  {submitting ? '注册中…' : '完成注册'}
                </Button>
              )}
            </div>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span>
              已有账号？
              <Link to="/login" className="ml-1 font-medium text-primary hover:underline">
                直接登录
              </Link>
            </span>
            <Link to="/tutors" className="transition-colors hover:text-foreground">
              先逛逛公开家教 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
