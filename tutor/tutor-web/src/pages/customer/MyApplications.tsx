import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Handshake, Mail, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as customerApi from '@/api/customer';
import type { DemandApply } from '@/api/customer';
import { formatDateTime } from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  ErrorState,
  Skeleton,
} from '@/components/ui';

export interface MyApplicationsProps {
  /** 外层「刷新」按钮：自增即重新拉取 */
  refreshSignal?: number;
}

/** 申请状态 */
const STATUS_META: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  '0': { label: '待你处理', tone: 'warning' },
  '1': { label: '已同意', tone: 'success' },
  '2': { label: '已拒绝', tone: 'danger' },
};

/** 科目字符串 "数学,物理" → 标签数组 */
function subjectsOf(apply: DemandApply): string[] {
  const raw = apply.demandSubjects ?? '';
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 学生「我的」页面的「老师申请」模块。
 *
 * 老师在自己的需求池里点「申请联系」后，申请会落到这里：
 * 每条显示「哪条需求 / 哪位老师 / 留言 / 时间 / 状态」，
 * 学生据此决定联系谁（联系方式在老师公开主页里）。
 */
export function MyApplications({ refreshSignal = 0 }: MyApplicationsProps) {
  const [rows, setRows] = useState<DemandApply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await customerApi.listReceivedApplications());
    } catch (e) {
      setError(e instanceof Error ? e.message : '申请列表加载失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [refreshSignal]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = rows.filter((r) => (r.status ?? '0') === '0').length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-3.5 w-3.5" />
            老师申请
          </CardTitle>
          <CardDescription>
            老师对你发布的需求点了「申请联系」，会出现在这里
          </CardDescription>
        </div>
        <Badge tone="muted" className="shrink-0">
          {loading ? '加载中…' : `共 ${rows.length} 条${pending ? ` · ${pending} 条待处理` : ''}`}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-4">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <Empty
            title="还没有老师申请"
            description="发布需求后，老师在需求池里点「申请联系」，这里就会出现他们的申请。"
            icon={<Megaphone className="h-5 w-5" />}
            action={
              <Button size="sm" asChild>
                <Link to="/demands/new">发布需求</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/50">
            {rows.map((apply) => {
              const meta = STATUS_META[apply.status ?? '0'] ?? STATUS_META['0'];
              const subjects = subjectsOf(apply);
              return (
                <li key={apply.applyId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium">
                      {apply.teacherName || '老师'}
                    </span>
                    <Badge tone="info" className="shrink-0">
                      <BadgeCheck className="h-3 w-3" />
                      老师
                    </Badge>
                    <Badge tone={meta.tone} dot className="shrink-0">
                      {meta.label}
                    </Badge>
                    <span className="tabular ml-auto shrink-0 text-2xs text-muted-foreground">
                      {formatDateTime(apply.createTime)}
                    </span>
                  </div>

                  <p className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="text-foreground/80">申请需求：</span>
                    <span className="truncate">{apply.demandTitle || `需求 #${apply.demandId}`}</span>
                    {subjects.map((s) => (
                      <Badge key={s} tone="outline">
                        {s}
                      </Badge>
                    ))}
                    {apply.demandGrade ? <Badge tone="muted">{apply.demandGrade}</Badge> : null}
                  </p>

                  {apply.message ? (
                    <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/90">
                      {apply.message}
                    </p>
                  ) : (
                    <p className="text-2xs text-muted-foreground">（老师没有留言）</p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/u/${apply.teacherId}`}>
                        <Mail className="h-3.5 w-3.5" />
                        查看老师主页
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default MyApplications;
