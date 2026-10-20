import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, BookOpen, GraduationCap, MapPin, Phone, Star, Wallet } from 'lucide-react';
import * as miniappApi from '@/api/miniapp';
import { cn } from '@/lib/cn';
import {
  auditLabel,
  auditTone,
  firstImage,
  genderLabel,
  splitList,
  stripHtml,
  teacherTypeLabel,
  teachingModeLabel,
  tutorDisplayName,
  tutorLocation,
} from '@/lib/constants';
import type { TutorInfo } from '@/types/api';
import { Avatar, Badge, Button, Card, Empty, ErrorState, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/common';

/** 键值行 —— 卡内信息统一用「左标签 / 右值」两列 */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 text-xs last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{value ?? '—'}</span>
    </div>
  );
}

/** 区块卡片 —— 统一标题字号与内边距 */
function Section({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        {title}
      </h2>
      {children}
    </Card>
  );
}

/** 正文段落 —— 简介 / 教学经历 / 其他优势共用 */
function Prose({ text, fallback }: { text: string; fallback?: string }) {
  return (
    <p className="whitespace-pre-line break-words text-sm leading-6 text-foreground/90">
      {text || fallback || '—'}
    </p>
  );
}

/**
 * 家教详情 —— 左信息、右联系卡片。
 * 联系入口只在卡内，不做悬浮条（避免与外壳的移动端底部导航重叠）。
 */
export default function TutorDetail() {
  const { id } = useParams<{ id: string }>();
  const [tutor, setTutor] = useState<TutorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tutorId = Number(id);
    if (!id || Number.isNaN(tutorId)) {
      setError('家教 ID 不合法');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await miniappApi.getPublicTutorDetail(tutorId);
      setTutor(data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '家教详情加载失败');
      setTutor(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const subjects = splitList(tutor?.subjectNames);
  const grades = splitList(tutor?.tutorableGradeNames);
  const profile = stripHtml(tutor?.personalProfile, 600);
  const experience = stripHtml(tutor?.qualification?.teachingExperience, 400);
  const advantage = stripHtml(tutor?.qualification?.otherAdvantage, 400);

  const name = tutor ? tutorDisplayName(tutor) : '家教详情';
  const summary = tutor
    ? [genderLabel(tutor.gender), tutor.age ? `${tutor.age} 岁` : '', teacherTypeLabel(tutor.teacherType)]
        .filter(Boolean)
        .join(' · ')
    : loading
      ? '正在加载…'
      : '公开家教档案';

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/tutors"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回老师列表
      </Link>

      <PageHeader title={name} description={summary}>
        {tutor ? (
          <Badge tone={auditTone(tutor.auditStatus)} className="rounded-md">
            {auditLabel(tutor.auditStatus)}
          </Badge>
        ) : null}
      </PageHeader>

      {loading ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </Card>
          </div>
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </Card>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : !tutor ? (
        <Card>
          <Empty
            title="未找到该家教"
            description="这份家教档案可能已被移除，返回列表看看其他老师。"
            icon={<GraduationCap className="h-5 w-5" />}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/tutors">返回老师列表</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* 左：详细信息 */}
          <div className="order-2 flex flex-col gap-4 lg:order-1">
            <Section title="基本信息" icon={<GraduationCap className="h-4 w-4" />}>
              <Row label="姓名" value={tutor.tutorName} />
              <Row label="性别" value={genderLabel(tutor.gender)} />
              <Row label="年龄" value={tutor.age ? `${tutor.age} 岁` : undefined} />
              <Row label="院校" value={tutor.university} />
              <Row label="专业" value={tutor.major} />
              <Row label="教师类型" value={teacherTypeLabel(tutor.teacherType)} />
              <Row label="所在地" value={tutorLocation(tutor)} />
              <Row label="押金状态" value={tutor.depositStatus === '1' ? '已缴纳' : '未缴纳'} />
            </Section>

            <Section title="教学信息" icon={<BookOpen className="h-4 w-4" />}>
              <Row label="可授科目" value={subjects.length ? subjects.join(' / ') : undefined} />
              <Row label="可授年级" value={grades.length ? grades.join(' / ') : tutor.gradeName} />
              <Row label="授课方式" value={teachingModeLabel(tutor.teachingMode)} />
              <Row label="可授课时间" value={tutor.availableTime} />
              <Row
                label="期望薪资"
                value={
                  tutor.expectedSalary ? (
                    <span className="inline-flex items-center gap-1 tabular">
                      <Wallet className="h-3 w-3" />¥{tutor.expectedSalary} / 时
                    </span>
                  ) : undefined
                }
              />
              <Row label="试课时长" value={tutor.trialTime} />
              <Row
                label="成绩"
                value={
                  tutor.middleScore || tutor.highScore
                    ? `中考 ${tutor.middleScore ?? '—'} / 高考 ${tutor.highScore ?? '—'}`
                    : undefined
                }
              />
            </Section>

            <Section title="个人简介">
              <Prose text={profile} fallback="这位老师还没有填写个人简介。" />
            </Section>

            {experience ? (
              <Section title="教学经历">
                <Prose text={experience} />
              </Section>
            ) : null}

            {advantage ? (
              <Section title="其他优势">
                <Prose text={advantage} />
              </Section>
            ) : null}
          </div>

          {/* 右：联系卡片（移动端排到正文前面） */}
          <aside className="order-1 flex flex-col gap-4 lg:order-2 lg:sticky lg:top-20">
            <Card className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Avatar
                  size="lg"
                  src={firstImage(tutor.avatarImages)}
                  name={tutorDisplayName(tutor)}
                  rounded="lg"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-sm font-semibold tracking-tight">{tutorDisplayName(tutor)}</p>
                    {tutor.auditStatus === '1' ? (
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label="认证通过" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{tutorLocation(tutor)}</span>
                  </p>
                </div>
              </div>

              {subjects.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {subjects.slice(0, 6).map((s) => (
                    <Badge key={s} tone="outline" className="rounded-md">
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="border-t border-border/60 pt-4">
                <p className="text-2xs text-muted-foreground">期望时薪</p>
                <p className="mt-1 tabular text-2xl font-semibold tracking-tight">
                  {tutor.expectedSalary ? (
                    <>
                      ¥{tutor.expectedSalary}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">/ 时</span>
                    </>
                  ) : (
                    '面议'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
                <div>
                  <p className="text-2xs text-muted-foreground">服务次数</p>
                  <p className="mt-0.5 tabular text-sm font-medium">{tutor.serviceCount ?? 0} 次</p>
                </div>
                <div>
                  <p className="text-2xs text-muted-foreground">评分</p>
                  <p className="mt-0.5 flex items-center gap-1 tabular text-sm font-medium text-warning">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {typeof tutor.avgScore === 'number' ? tutor.avgScore.toFixed(1) : '暂无'}
                  </p>
                </div>
              </div>

              {tutor.phone ? (
                <Button size="h5" className="w-full" asChild>
                  <a href={`tel:${tutor.phone}`}>
                    <Phone className="h-4 w-4" />
                    电话咨询
                  </a>
                </Button>
              ) : (
                <Button size="h5" className="w-full" disabled>
                  暂无联系方式
                </Button>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
