import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  GraduationCap,
  Megaphone,
  MessagesSquare,
  Search,
  Users,
} from 'lucide-react';
import * as customerApi from '@/api/customer';
import { APP_NAME, SUBJECTS } from '@/lib/constants';
import { accountHomePath, useCustomerAuth } from '@/store/customerAuth';
import { Button, Card, FullPageSpinner } from '@/components/ui';

/**
 * 首页的三条主要路径 —— 只保留标题，不配解释性小字
 */
const STEPS = [
  { icon: <Megaphone className="h-4 w-4" />, title: '学生发布需求' },
  { icon: <Search className="h-4 w-4" />, title: '老师筛选学员' },
  { icon: <MessagesSquare className="h-4 w-4" />, title: '双方直接对接' },
];

/**
 * 客户首页 —— 站点根路径 /。
 *
 * 版式约定（之前明确要求过）：首页只放「标题 + 操作 + 入口」，
 * 不放副标题、说明段落、特性清单这类小号灰字。
 *
 * 视觉约定：克制。没有模糊光斑、没有入场动画（这一页在首屏关键路径上，
 * 装饰性动画会让首屏 JS 多背一个动画库）。
 */
export default function Landing() {
  const { account, authenticated, loading } = useCustomerAuth();
  const [subjects, setSubjects] = useState<string[]>([]);

  /* 科目快捷入口：优先用后端字典，失败退回本地常量（已登录会被重定向，无需拉取） */
  useEffect(() => {
    if (authenticated) return;
    let alive = true;
    (async () => {
      try {
        const list = await customerApi.listSubjects();
        if (alive && list.length > 0) setSubjects(list.slice(0, 10));
      } catch {
        if (alive) setSubjects(SUBJECTS.slice(0, 8).map((s) => s.name));
      }
    })();
    return () => {
      alive = false;
    };
  }, [authenticated]);

  /* 已登录直接进各自的身份首页；加载中先显示占位，避免闪一下首页又跳走 */
  if (loading) {
    // 与路由级 lazy 加载用同一个指示器，避免「这里一行灰字、那里一个转圈」
    return <FullPageSpinner text="正在校验登录状态…" />;
  }
  if (authenticated) return <Navigate to={accountHomePath(account)} replace />;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <section className="rounded-xl border border-border/70 bg-card px-5 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{APP_NAME}</h1>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <Button size="lg" asChild>
              <Link to="/register">
                免费注册
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">登录</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link to="/tutors">找家教</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 双身份入口 */}
      <section className="grid gap-3 sm:grid-cols-2">
        <RoleEntry
          icon={<Users className="h-5 w-5" />}
          tone="bg-primary/[0.08] text-primary"
          title="我是老师"
          action={
            <Button className="w-full sm:w-auto" asChild>
              <Link to="/register?role=TEACHER">注册老师账号</Link>
            </Button>
          }
        />
        <RoleEntry
          icon={<GraduationCap className="h-5 w-5" />}
          tone="bg-success/[0.1] text-success"
          title="我是学生 / 家长"
          action={
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link to="/register?role=STUDENT">注册学生账号</Link>
            </Button>
          }
        />
      </section>

      {/* 使用流程：CSS 逐条淡入，不用动画库 */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">三步完成对接</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card
              key={s.title}
              className="rare-rise flex h-full items-center gap-3 p-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                {s.icon}
              </span>
              <span className="text-sm font-medium">{s.title}</span>
            </Card>
          ))}
        </div>
      </section>

      {/* 科目快捷入口 */}
      {subjects.length > 0 ? (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">热门科目</h2>
            <Link
              to="/tutors"
              className="flex items-center gap-0.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              全部家教
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {subjects.map((s) => (
              <Link
                key={s}
                to={`/tutors?subject=${encodeURIComponent(s)}`}
                className="rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-2xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** 身份入口卡：只有图标、标题和按钮，不放说明文字 */
function RoleEntry({
  icon,
  tone,
  title,
  action,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <p className="mt-3 text-sm font-semibold tracking-tight">{title}</p>
      <div className="mt-auto pt-5">{action}</div>
    </Card>
  );
}
