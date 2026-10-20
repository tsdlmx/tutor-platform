import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GraduationCap, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import * as miniappApi from '@/api/miniapp';
import { cn } from '@/lib/cn';
import {
  DEFAULT_COORDS,
  GRADES,
  SORT_OPTIONS,
  SUBJECTS,
  tutorDisplayName,
  tutorLocation,
} from '@/lib/constants';
import type { TutorInfo } from '@/types/api';
import { Button, Card, Drawer, Empty, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { TutorCard } from '@/pages/tutors/TutorCard';

type SortBy = '' | 'distance' | 'score';

const GRADE_OPTIONS = GRADES.map((g) => ({ label: g.name, value: String(g.id) }));
const SUBJECT_OPTIONS = SUBJECTS.map((s) => ({ label: s.name, value: s.name }));
const SORT_SELECT_OPTIONS = SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value }));

/**
 * 列表 key：优先用 tutorId；异常数据缺 id 时用「编号 + 姓名 + 院校」兜底，
 * 不要退化成数组下标 —— 后面做筛选/排序时下标会跟着变，卡片会被整片重建。
 * 列表接口不返回手机号（避免批量抓取联系方式），所以兜底不参与 key。
 */
function tutorKey(t: TutorInfo): string {
  if (t.tutorId != null) return `t-${t.tutorId}`;
  return `t-${t.tutorNo ?? ''}|${t.tutorName ?? ''}|${t.university ?? ''}`;
}

/** 筛选胶囊 —— 移动端抽屉里用，触控高度 44px */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-[44px] rounded-lg border px-3 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 找家教 —— 公开家教列表。
 * 桌面：一行工具栏（搜索 / 科目 / 年级 / 排序 / 计数）+ 三列卡片网格；
 * 移动：工具栏收成「搜索 + 筛选」，筛选项放进底部抽屉。
 */
export default function TutorList() {
  const [params, setParams] = useSearchParams();

  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [gradeId, setGradeId] = useState(params.get('gradeId') ?? '');
  const [sortBy, setSortBy] = useState<SortBy>((params.get('sortBy') as SortBy) ?? '');
  const [keyword, setKeyword] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [coords, setCoords] = useState(DEFAULT_COORDS);

  const [rows, setRows] = useState<TutorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* 距离排序需要经纬度：优先浏览器定位，失败回退到默认坐标（无锡市中心） */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setCoords(DEFAULT_COORDS),
      { timeout: 4000, maximumAge: 600_000 },
    );
  }, []);

  const query = useMemo(
    () => ({
      gradeId: gradeId || undefined,
      subject: subject || undefined,
      sortBy: sortBy || undefined,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }),
    [gradeId, subject, sortBy, coords],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await miniappApi.listPublicTutors(query);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '家教列表加载失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  /* 同步筛选到 URL，便于分享/返回。
     URL 已经是目标状态时直接返回：否则每次进页面（甚至每次无关的重渲染）
     都会多做一次 history.replace 与一轮导航。 */
  useEffect(() => {
    const same =
      (params.get('subject') ?? '') === subject &&
      (params.get('gradeId') ?? '') === gradeId &&
      (params.get('sortBy') ?? '') === sortBy;
    if (same) return;

    const next = new URLSearchParams();
    if (subject) next.set('subject', subject);
    if (gradeId) next.set('gradeId', gradeId);
    if (sortBy) next.set('sortBy', sortBy);
    setParams(next, { replace: true });
  }, [subject, gradeId, sortBy, setParams, params]);

  /* 公开家教接口只支持科目/年级/排序，关键词在已取回的列表里做本地过滤 */
  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((t) =>
      [tutorDisplayName(t), t.university, t.major, t.subjectNames, t.gradeName, tutorLocation(t)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(kw),
    );
  }, [rows, keyword]);

  const filterCount = (subject ? 1 : 0) + (gradeId ? 1 : 0) + (sortBy ? 1 : 0);
  const hasFilter = filterCount > 0 || keyword.trim() !== '';
  const count = loading ? '—' : visible.length;

  function resetFilters() {
    setSubject('');
    setGradeId('');
    setSortBy('');
    setKeyword('');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="找家教" description="公开家教档案，可按科目、年级与排序查看">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      {/* 工具栏 */}
      <Card className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索姓名 / 院校 / 科目"
            aria-label="搜索家教"
            icon={<Search />}
            className="h-11 flex-1 md:h-9 md:max-w-xs"
          />

          {/* 桌面端筛选项直接铺在工具栏里 */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="w-28">
              <Select
                aria-label="科目筛选"
                value={subject}
                placeholder="全部科目"
                options={SUBJECT_OPTIONS}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="w-36">
              <Select
                aria-label="年级筛选"
                value={gradeId}
                placeholder="全部年级"
                options={GRADE_OPTIONS}
                onChange={(e) => setGradeId(e.target.value)}
              />
            </div>
            <div className="w-32">
              <Select
                aria-label="排序方式"
                value={sortBy}
                options={SORT_SELECT_OPTIONS}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              />
            </div>
          </div>

          {/* 移动端：搜索 + 筛选按钮 */}
          <Button
            variant="outline"
            className="h-11 shrink-0 md:hidden"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            筛选
            {filterCount > 0 ? <span className="tabular">({filterCount})</span> : null}
          </Button>

          <span className="ml-auto hidden shrink-0 text-2xs text-muted-foreground md:inline">
            共 <span className="tabular text-foreground">{count}</span> 位老师
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 md:hidden">
          <span className="text-2xs text-muted-foreground">
            共 <span className="tabular text-foreground">{count}</span> 位老师
          </span>
          {hasFilter ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              清空筛选
            </Button>
          ) : null}
        </div>
      </Card>

      {/* 列表 */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-12 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-10 rounded-md" />
              </div>
              <Skeleton className="mt-auto h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <Empty
            title="没有符合条件的老师"
            description="换一个科目、年级或关键词试试，也可以清空筛选后查看全部家教。"
            icon={<GraduationCap className="h-5 w-5" />}
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                清空筛选
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((tutor) => (
            <TutorCard key={tutorKey(tutor)} tutor={tutor} />
          ))}
        </div>
      )}

      {/* 移动端筛选抽屉 */}
      <Drawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        side="bottom"
        title="筛选"
        description="按科目、年级与排序查看家教"
        footer={
          <>
            <Button variant="outline" className="h-11 flex-1" onClick={resetFilters}>
              重置
            </Button>
            <Button className="h-11 flex-1" onClick={() => setFilterOpen(false)}>
              查看 {visible.length} 位老师
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-2xs text-muted-foreground">科目</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {SUBJECTS.map((s) => (
                <Chip
                  key={s.id}
                  active={s.name === subject}
                  onClick={() => setSubject(s.name === subject ? '' : s.name)}
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-2xs text-muted-foreground">年级</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => {
                const value = String(g.id);
                return (
                  <Chip
                    key={g.id}
                    active={value === gradeId}
                    onClick={() => setGradeId(value === gradeId ? '' : value)}
                  >
                    {g.name}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-2xs text-muted-foreground">排序</p>
            <div className="grid grid-cols-3 gap-2">
              {SORT_OPTIONS.map((o) => (
                <Chip key={o.value || 'default'} active={o.value === sortBy} onClick={() => setSortBy(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
