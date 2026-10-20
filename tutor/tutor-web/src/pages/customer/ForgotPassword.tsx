import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import * as customerApi from '@/api/customer';
import { APP_NAME } from '@/lib/constants';
import { Badge, Button, Field, Input, toast } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 找回密码 —— 两步：① 发重置验证码到邮箱；② 邮箱 + 验证码 + 新密码。
 *
 * 与「注册」的区别：
 *   * 验证码走独立用途（reset），注册码不能拿来改密码；
 *   * 账号不存在时接口也返回成功（防枚举），文案统一为「如果该邮箱已注册」；
 *   * 改完密码后端会把这个账号的所有旧会话踢掉，必须用新密码重新登录。
 */
export default function ForgotPassword() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', code: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** 重发倒计时（秒） */
  const [countdown, setCountdown] = useState(0);
  /** 未配置 SMTP 时后端会把验证码回显出来；真实发信时这里为空 */
  const [devNotice, setDevNotice] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function onSendCode() {
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) {
      setErrors((e) => ({ ...e, email: '请先填写正确的邮箱' }));
      return;
    }
    setSending(true);
    try {
      const res = await customerApi.sendResetCode(email);
      setCountdown(res.resendAfter || 60);
      setDevNotice(res.devCode ? `开发模式验证码：${res.devCode}（未配置 SMTP，仅本地联调可见）` : '');
      toast.success('如果该邮箱已注册，验证码已发送', {
        description: `请查收邮件，${Math.round((res.expiresIn || 300) / 60)} 分钟内有效`,
      });
    } catch (err) {
      toast.error('发送失败', { description: err instanceof Error ? err.message : '请稍后重试' });
    } finally {
      setSending(false);
    }
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!form.email.trim()) next.email = '请输入邮箱';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = '邮箱格式不正确';
    if (!form.code.trim()) next.code = '请填写邮箱验证码';
    else if (!/^\d{6}$/.test(form.code.trim())) next.code = '验证码是 6 位数字';
    if (!form.password) next.password = '请输入新密码';
    else if (form.password.length < 6 || form.password.length > 32) next.password = '密码长度需在 6-32 位之间';
    if (!form.confirm) next.confirm = '请再次输入新密码';
    else if (form.confirm !== form.password) next.confirm = '两次输入的密码不一致';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      await customerApi.resetPassword({
        email: form.email.trim(),
        code: form.code.trim(),
        password: form.password,
      });
      toast.success('密码已重置', { description: '所有设备上的登录状态都已失效，请用新密码重新登录' });
      navigate('/login', { replace: true, state: { email: form.email.trim() } });
    } catch (err) {
      toast.error('重置失败', { description: err instanceof Error ? err.message : '请检查验证码是否过期' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute right-3 top-3 z-10">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回登录
          </Link>
        </Button>
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft md:grid-cols-[1.05fr_1fr]">
        {/* 品牌区（桌面端） */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary/[0.04] p-8 md:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
            </div>
            <h1 className="mt-10 text-2xl font-semibold leading-snug tracking-tight">
              找回密码
              <br />
              用注册邮箱验证身份
            </h1>
            <ul className="mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                验证码 5 分钟内有效，一次性使用
              </li>
              <li className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                改完密码后，其他设备上的登录会立即失效
              </li>
            </ul>
          </div>
          <p className="text-2xs text-muted-foreground">
            收不到邮件？先看看垃圾箱，或确认这个邮箱就是注册时用的那个。
          </p>
        </div>

        {/* 表单区 */}
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight">重置密码</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">邮箱验证码 + 新密码</p>
            </div>
            <Badge tone="muted" className="md:hidden">
              找回密码
            </Badge>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="注册邮箱" htmlFor="email" error={errors.email} required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="请输入注册时用的邮箱"
                icon={<Mail />}
                value={form.email}
                invalid={Boolean(errors.email)}
                onChange={(e) => setField('email', e.target.value)}
              />
            </Field>

            <Field label="邮箱验证码" htmlFor="code" error={errors.code} required>
              <div className="flex items-center gap-2">
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6 位数字"
                  icon={<KeyRound />}
                  value={form.code}
                  invalid={Boolean(errors.code)}
                  onChange={(e) => setField('code', e.target.value.replace(/\D/g, ''))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  loading={sending}
                  disabled={countdown > 0 || sending}
                  onClick={() => void onSendCode()}
                >
                  {countdown > 0 ? `${countdown} 秒后重发` : '发送验证码'}
                </Button>
              </div>
            </Field>

            {devNotice ? (
              <p className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2 text-2xs text-warning">
                {devNotice}
              </p>
            ) : null}

            <Field label="新密码" htmlFor="password" error={errors.password} required>
              <Input
                id="password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="6-32 位，建议字母加数字"
                icon={<Lock />}
                value={form.password}
                invalid={Boolean(errors.password)}
                onChange={(e) => setField('password', e.target.value)}
              />
            </Field>

            <Field label="确认新密码" htmlFor="confirm" error={errors.confirm} required>
              <Input
                id="confirm"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="再输入一次新密码"
                icon={<Lock />}
                value={form.confirm}
                invalid={Boolean(errors.confirm)}
                onChange={(e) => setField('confirm', e.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
              {submitting ? '提交中…' : '重置密码'}
            </Button>
          </form>

          <p className="mt-6 text-center text-2xs text-muted-foreground">
            想起来了？
            <Link to="/login" className="ml-1 font-medium text-primary hover:underline">
              直接登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
