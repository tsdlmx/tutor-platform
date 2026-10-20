import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BadgeCheck, GraduationCap, Users } from 'lucide-react';
import type { Role } from '@/api/customer';
import { roleHomePath, useCustomerAuth } from '@/store/customerAuth';
import { Badge, Button, Card, toast } from '@/components/ui';
import { ROLE_LABEL } from '@/pages/customer/shared';

interface RoleOption {
  role: Role;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: string;
  points: string[];
  actionLabel: string;
}

const OPTIONS: RoleOption[] = [
  {
    role: 'TEACHER',
    title: '我是老师',
    subtitle: '查看学生发布的辅导需求，筛选合适的学员',
    icon: <Users className="h-6 w-6" />,
    tone: 'bg-primary/[0.1] text-primary',
    points: ['需求池汇总全部待接需求', '按关键词搜索需求', '打开卡片看完整需求描述'],
    actionLabel: '选择老师身份',
  },
  {
    role: 'STUDENT',
    title: '我是家长 / 学生',
    subtitle: '发布辅导需求，等待老师主动对接',
    icon: <GraduationCap className="h-6 w-6" />,
    tone: 'bg-success/[0.12] text-success',
    points: ['发布需求：科目、预算、上课方式', '管理自己的需求（修改 / 取消 / 删除）', '需求状态一目了然'],
    actionLabel: '选择家长 / 学生身份',
  },
];

/**
 * 选择身份 —— 只在注册后 role 为 null 时进入，**一次性确定，之后不可切换**。
 *
 * 已选过身份的用户访问这里会直接被送回自己的首页（身份决定可用功能，
 * 允许来回切会让「老师看到的需求」「家长发布的需求」两套视角混在一起）。
 * 需要换身份只能换账号：用另一个邮箱重新注册。
 */
export default function ChooseRole() {
  const { account, authenticated, loading, setRole } = useCustomerAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Role | null>(null);
  const current = account?.role ?? null;

  /* 身份已定：不再提供切换入口，直接回首页（校验中先不跳，避免闪一下） */
  if (!loading && authenticated && current) {
    return <Navigate to={roleHomePath(current)} replace />;
  }

  async function choose(role: Role) {
    if (pending) return;
    setPending(role);
    try {
      await setRole(role);
      toast.success(`身份已确定为${ROLE_LABEL[role]}`, {
        description: '身份确定后不支持切换，需要另一种身份请用其他邮箱注册',
      });
      navigate(roleHomePath(role), { replace: true });
    } catch (e) {
      toast.error('身份设置失败', { description: e instanceof Error ? e.message : '请稍后重试' });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">选择你的身份</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            身份决定你能使用哪些功能，确定后不可切换
          </p>
        </div>
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span>{account?.email}</span>
          <Badge tone="warning" dot>
            尚未选择身份
          </Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((opt) => {
          const busy = pending === opt.role;
          return (
            <Card key={opt.role} className="flex h-full flex-col p-5 transition-shadow hover:shadow-soft">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${opt.tone}`}>
                {opt.icon}
              </span>

              <p className="mt-4 text-base font-semibold tracking-tight">{opt.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.subtitle}</p>

              <ul className="mt-4 flex flex-col gap-2 text-2xs text-muted-foreground">
                {opt.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <BadgeCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-5">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={Boolean(pending) && !busy}
                  loading={busy}
                  onClick={() => void choose(opt.role)}
                >
                  {busy ? '正在设置…' : opt.actionLabel}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-2xs text-muted-foreground">
        提示：身份确定后不能自行切换；如果确实需要另一种身份，请用另一个邮箱重新注册。
      </p>
    </div>
  );
}
