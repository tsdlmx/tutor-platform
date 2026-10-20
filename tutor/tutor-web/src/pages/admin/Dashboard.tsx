import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  CheckCheck,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import * as tutorApi from '@/api/tutor';
import * as customerAccountApi from '@/api/customerAccount';
import { auditLabel, auditTone, formatDateTime, splitList, tutorDisplayName } from '@/lib/constants';
import type { TutorInfo } from '@/types/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { DataTable, PageHeader, StatCard, type DataColumn } from '@/components/common';

/* 与 Badge 的语气色保持一致，直接复用设计令牌 */
const AUDIT_COLORS: Record<string, string> = {
  '0': 'hsl(var(--warning))',
  '1': 'hsl(var(--success))',
  '2': 'hsl(var(--destructive))',
};

const QUICK_LINKS = [
  { to: '/admin/tutor?auditStatus=0', label: '家教审核' },
  { to: '/admin/teacher', label: '入驻老师' },
  { to: '/admin/student', label: '入驻学生' },
  { to: '/admin/online', label: '在线用户' },
  { to: '/admin/operlog', label: '操作日志' },
  { to: '/admin/server', label: '服务监控' },
];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : '未知错误';
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 入驻老师 / 入驻学生来自客户侧邮箱注册的账号：role = TEACHER / STUDENT
  const [stats, setStats] = useState({ tutor: 0, teacher: 0, student: 0, pending: 0 });
  const [sample, setSample] = useState<TutorInfo[]>([]);
  const [pendingRows, setPendingRows] = useState<TutorInfo[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      tutorApi.listTutor({ pageNum: 1, pageSize: 1 }),
      customerAccountApi.listAccounts({ role: 'TEACHER', pageNum: 1, pageSize: 1 }),
      customerAccountApi.listAccounts({ role: 'STUDENT', pageNum: 1, pageSize: 1 }),
      tutorApi.listTutor({ auditStatus: '0', pageNum: 1, pageSize: 6 }),
      tutorApi.listTutor({ pageNum: 1, pageSize: 100, orderByColumn: 'createTime', isAsc: 'desc' }),
    ]);

    const [t, tea, stu, pending, all] = results;
    const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    setStats({
      tutor: t.status === 'fulfilled' ? t.value.total : 0,
      teacher: tea.status === 'fulfilled' ? tea.value.total : 0,
      student: stu.status === 'fulfilled' ? stu.value.total : 0,
      pending: pending.status === 'fulfilled' ? pending.value.total : 0,
    });
    setPendingRows(pending.status === 'fulfilled' ? pending.value.rows : []);
    setSample(all.status === 'fulfilled' ? all.value.rows : []);

    if (failures.length === results.length) {
      setError(errMsg(failures[0].reason));
    } else if (failures.length > 0) {
      setError(`部分接口不可用（${failures.length}/${results.length}）：${errMsg(failures[0].reason)}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* 科目分布（按最近 100 条家教样本统计） */
  const subjectData = useMemo(() => {
    const counter = new Map<string, number>();
    sample.forEach((t) => {
      splitList(t.subjectNames).forEach((s) => counter.set(s, (counter.get(s) ?? 0) + 1));
    });
    return [...counter.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [sample]);

  /* 审核状态分布 */
  const auditData = useMemo(() => {
    const counter = new Map<string, number>();
    sample.forEach((t) => {
      const k = t.auditStatus ?? '0';
      counter.set(k, (counter.get(k) ?? 0) + 1);
    });
    return ['0', '1', '2']
      .map((k) => ({ key: k, name: auditLabel(k), value: counter.get(k) ?? 0, color: AUDIT_COLORS[k] }))
      .filter((d) => d.value > 0);
  }, [sample]);

  const latest = useMemo(
    () =>
      [...sample]
        .sort((a, b) => String(b.createTime ?? '').localeCompare(String(a.createTime ?? '')))
        .slice(0, 5),
    [sample],
  );

  async function review(t: TutorInfo, status: '1' | '2') {
    if (!t.tutorId) {
      toast.error('该记录缺少 tutorId，无法审核');
      return;
    }
    setBusyId(t.tutorId);
    try {
      const msg = await tutorApi.auditTutor({
        tutorId: t.tutorId,
        auditStatus: status,
        auditRemark: status === '1' ? '后台概览页快速审核通过' : '后台概览页快速审核拒绝',
      });
      toast.success(status === '1' ? '已审核通过' : '已审核拒绝', { description: msg });
      void load();
    } catch (e) {
      toast.error('审核失败', { description: errMsg(e) });
    } finally {
      setBusyId(null);
    }
  }

  const pendingColumns: DataColumn<TutorInfo>[] = [
    {
      key: 'tutorName',
      title: '家教',
      width: '260px',
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{tutorDisplayName(t)}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {[t.tutorNo ?? '—', t.city, t.university].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'subjectNames',
      title: '可授科目',
      width: '220px',
      render: (t) => {
        const subjects = splitList(t.subjectNames);
        if (subjects.length === 0) return <span className="text-2xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {subjects.slice(0, 2).map((s) => (
              <Badge key={s} tone="outline">
                {s}
              </Badge>
            ))}
            {subjects.length > 2 ? <Badge tone="muted">+{subjects.length - 2}</Badge> : null}
          </div>
        );
      },
    },
    {
      key: 'createTime',
      title: '提交时间',
      width: '150px',
      render: (t) => (
        <span className="tabular text-2xs text-muted-foreground">{formatDateTime(t.createTime)}</span>
      ),
    },
    {
      key: 'auditStatus',
      title: '状态',
      width: '96px',
      render: (t) => (
        <Badge tone={auditTone(t.auditStatus)} dot>
          {auditLabel(t.auditStatus)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: '220px',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="success"
            disabled={busyId === t.tutorId}
            loading={busyId === t.tutorId}
            onClick={() => void review(t, '1')}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            通过
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === t.tutorId}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void review(t, '2')}
          >
            <XCircle className="h-3.5 w-3.5" />
            拒绝
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/admin/tutor?tutorId=${t.tutorId ?? ''}`}>详情</Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="数据概览"
        description="家教、入驻老师、入驻学生的规模与待审核队列，统计值取自各列表接口的 total 字段"
        className="[&_h1]:text-base"
      >
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </Button>
      </PageHeader>

      {error ? (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              重试
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="家教总数" value={stats.tutor} loading={loading} tone="default" icon={<GraduationCap />} hint="家教档案总量" />
        <StatCard label="入驻老师" value={stats.teacher} loading={loading} tone="info" icon={<Users />} hint="客户侧邮箱注册账号" />
        <StatCard label="入驻学生" value={stats.student} loading={loading} tone="success" icon={<Baby />} hint="客户侧邮箱注册账号" />
        <StatCard
          label="待审核"
          value={stats.pending}
          loading={loading}
          tone={stats.pending > 0 ? 'warning' : 'success'}
          icon={<ShieldCheck />}
          hint={stats.pending > 0 ? '资质待处理' : '暂无积压'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>科目分布</CardTitle>
              <CardDescription>按最近 {sample.length} 条家教记录统计可授科目</CardDescription>
            </div>
            <Badge tone="muted">样本统计</Badge>
          </CardHeader>
          <CardContent className="h-[272px] pl-0">
            {loading ? (
              <div className="flex h-full items-center px-5">
                <Skeleton className="h-[220px] w-full" />
              </div>
            ) : subjectData.length === 0 ? (
              <Empty title="暂无科目数据" description="后端尚未返回家教记录" className="h-full py-0" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 6, right: 16, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--popover))',
                      fontSize: 12,
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    formatter={(v: number | string) => [`${v} 位家教`, '数量']}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审核状态占比</CardTitle>
            <CardDescription>基于同一批样本数据</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {loading ? (
              <Skeleton className="h-[190px] w-full" />
            ) : auditData.length === 0 ? (
              <Empty title="暂无审核数据" className="h-[190px] w-full py-0" />
            ) : (
              <>
                <div className="h-[190px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={auditData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {auditData.map((d) => (
                          <Cell key={d.key} fill={d.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--popover))',
                          fontSize: 12,
                        }}
                        formatter={(v: number | string, n: string) => [`${v} 条`, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex w-full flex-col gap-1.5">
                  {auditData.map((d) => (
                    <li key={d.key} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      <span className="flex-1 text-muted-foreground">{d.name}</span>
                      <span className="tabular font-medium">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DataTable
            columns={pendingColumns}
            rows={pendingRows}
            rowKey={(t, i) => t.tutorId ?? `row-${i}`}
            loading={loading}
            headerTitle="待审核队列"
            emptyTitle="暂无待审核家教"
            emptyDescription="新的家教档案提交后会出现在这里"
            skeletonRows={4}
            toolbar={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/tutor?auditStatus=0">
                  查看全部
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
            className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4"
          />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>最新入驻</CardTitle>
              <CardDescription>按创建时间倒序</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {loading ? (
                <div className="flex flex-col gap-2 py-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : latest.length === 0 ? (
                <Empty title="暂无记录" className="py-6" />
              ) : (
                latest.map((t) => (
                  <Link
                    key={t.tutorId}
                    to={`/admin/tutor?tutorId=${t.tutorId ?? ''}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{tutorDisplayName(t)}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {t.city || '未知城市'} · {formatDateTime(t.createTime)}
                      </span>
                    </span>
                    <Badge tone={auditTone(t.auditStatus)}>{auditLabel(t.auditStatus)}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>快捷入口</CardTitle>
              <CardDescription>常用管理页</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-muted"
                >
                  {l.label}
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
