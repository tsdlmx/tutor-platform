import { useEffect, useState } from 'react';
import { KeyRound, Save, ShieldCheck, UserCog } from 'lucide-react';
import * as authApi from '@/api/auth';
import { useAuth } from '@/store/auth';
import { emptyText, formatDateTime, genderLabel, resolveAssetUrl } from '@/lib/constants';
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select, toast } from '@/components/ui';
import { PageHeader } from '@/components/common';

const SEX_OPTIONS = [
  { label: '男', value: '0' },
  { label: '女', value: '1' },
  { label: '未知', value: '2' },
];

export default function Profile() {
  const { user, roles, permissions, refresh } = useAuth();

  const [profile, setProfile] = useState({ nickName: '', phonenumber: '', email: '', sex: '2' });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});

  const [roleGroup, setRoleGroup] = useState('');
  const [postGroup, setPostGroup] = useState('');

  /* 优先用 /system/user/profile 取最新资料，失败则退回 auth store 里的用户 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await authApi.getProfile();
        if (!alive || !res?.user) return;
        const u = res.user;
        setRoleGroup(res.roleGroup ?? '');
        setPostGroup(res.postGroup ?? '');
        setProfile({
          nickName: u.nickName ?? '',
          phonenumber: u.phonenumber ?? '',
          email: u.email ?? '',
          sex: u.sex ?? '2',
        });
      } catch {
        /* 静默降级：沿用 auth store 中的用户信息 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfile((p) => ({
      nickName: p.nickName || user.nickName || '',
      phonenumber: p.phonenumber || user.phonenumber || '',
      email: p.email || user.email || '',
      sex: p.sex === '2' && user.sex ? user.sex : p.sex,
    }));
  }, [user]);

  async function saveProfile() {
    if (!profile.nickName.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    setSavingProfile(true);
    try {
      const msg = await authApi.updateProfile(profile);
      toast.success('资料已更新', { description: msg });
      await refresh();
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePwd() {
    const next: Record<string, string> = {};
    if (!pwd.oldPassword) next.oldPassword = '请输入原密码';
    if (pwd.newPassword.length < 6) next.newPassword = '新密码至少 6 位';
    if (pwd.newPassword !== pwd.confirm) next.confirm = '两次输入的新密码不一致';
    setPwdErrors(next);
    if (Object.keys(next).length > 0) return;

    setSavingPwd(true);
    try {
      const msg = await authApi.updateUserPwd(pwd.oldPassword, pwd.newPassword);
      toast.success('密码修改成功', { description: msg });
      setPwd({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      toast.error('密码修改失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="个人中心"
        description="当前登录账号的资料、密码与权限信息"
        className="[&_h1]:text-base"
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-border/60 bg-muted/30 p-5">
          <Avatar size="xl" src={resolveAssetUrl(user?.avatar)} name={user?.nickName ?? user?.userName} rounded="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">{emptyText(user?.nickName || user?.userName)}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {emptyText(user?.dept?.deptName, '未分配部门')} · 上次登录 {formatDateTime(user?.loginDate)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(roles.length ? roles : (user?.roles ?? []).map((r) => r.roleKey ?? '')).filter(Boolean).map((r) => (
                <Badge key={r} tone="outline">
                  <ShieldCheck className="h-3 w-3" />
                  {r}
                </Badge>
              ))}
              <Badge tone="muted">{permissions.length} 项权限</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-2xs text-muted-foreground">
            <span>登录 IP：{emptyText(user?.loginIp)}</span>
            <span>创建时间：{formatDateTime(user?.createTime)}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-3.5 w-3.5" />
              基本资料
            </CardTitle>
            <CardDescription>修改后立即生效，昵称与联系方式会展示在后台顶部</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="登录账号">
              <Input value={emptyText(user?.userName)} disabled />
            </Field>
            <Field label="用户昵称" required>
              <Input
                value={profile.nickName}
                placeholder="请输入昵称"
                onChange={(e) => setProfile((p) => ({ ...p, nickName: e.target.value }))}
              />
            </Field>
            <Field label="手机号码" hint="用于接收系统通知">
              <Input
                value={profile.phonenumber}
                placeholder="请输入手机号"
                onChange={(e) => setProfile((p) => ({ ...p, phonenumber: e.target.value }))}
              />
            </Field>
            <Field label="邮箱">
              <Input
                type="email"
                value={profile.email}
                placeholder="请输入邮箱"
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
            </Field>
            <Field label="性别">
              <Select
                value={profile.sex}
                options={SEX_OPTIONS}
                onChange={(e) => setProfile((p) => ({ ...p, sex: e.target.value }))}
              />
            </Field>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-2xs text-muted-foreground">
                所属角色：{roleGroup || (user?.roles ?? []).map((r) => r.roleName).join('、') || '—'}
              </span>
              <Button size="sm" loading={savingProfile} onClick={() => void saveProfile()}>
                <Save className="h-3.5 w-3.5" />
                保存资料
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" />
              修改密码
            </CardTitle>
            <CardDescription>新密码至少 6 位，修改成功后请使用新密码重新登录</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="原密码" required error={pwdErrors.oldPassword}>
              <Input
                type="password"
                autoComplete="current-password"
                value={pwd.oldPassword}
                invalid={Boolean(pwdErrors.oldPassword)}
                onChange={(e) => setPwd((p) => ({ ...p, oldPassword: e.target.value }))}
              />
            </Field>
            <Field label="新密码" required error={pwdErrors.newPassword}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd.newPassword}
                invalid={Boolean(pwdErrors.newPassword)}
                onChange={(e) => setPwd((p) => ({ ...p, newPassword: e.target.value }))}
              />
            </Field>
            <Field label="确认新密码" required error={pwdErrors.confirm}>
              <Input
                type="password"
                autoComplete="new-password"
                value={pwd.confirm}
                invalid={Boolean(pwdErrors.confirm)}
                onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
              />
            </Field>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-2xs text-muted-foreground">岗位：{postGroup || '—'}</span>
              <Button size="sm" variant="outline" loading={savingPwd} onClick={() => void savePwd()}>
                <KeyRound className="h-3.5 w-3.5" />
                确认修改
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
          <CardDescription>只读字段，取自登录态与个人资料接口</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: '用户编号', value: user?.userId },
            { label: '登录账号', value: user?.userName },
            { label: '用户昵称', value: user?.nickName },
            { label: '性别', value: genderLabel(user?.sex) },
            { label: '手机号码', value: user?.phonenumber },
            { label: '邮箱', value: user?.email },
            { label: '部门', value: user?.dept?.deptName },
            { label: '角色', value: (user?.roles ?? []).map((r) => r.roleName).join('、') || roles.join('、') },
            { label: '创建时间', value: formatDateTime(user?.createTime) },
          ].map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 border-b border-border/40 py-2 text-xs">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="truncate">{emptyText(f.value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
