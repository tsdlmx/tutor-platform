import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Coins, MapPin, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDateTime, resolveAssetUrl, stripHtml } from '@/lib/constants';
import type { Demand, TeacherProfile, UserPost } from '@/api/customer';
import { Avatar, Badge, Card } from '@/components/ui';

/* 字典与展示工具都在 labels.ts；这里 re-export 一份，老的 import 路径继续可用 */
export * from './labels';

import {
  ROLE_LABEL,
  ROLE_TONE,
  classModeLabel,
  demandStatusMeta,
  demandSubjects,
  formatBudget,
  formatHourlyRate,
  postImages,
  profileGenderLabel,
  profileGrades,
  profileSubjects,
} from './labels';

export function DemandStatusBadge({ demand, className }: { demand: Demand; className?: string }) {
  const meta = demandStatusMeta(demand);
  return (
    <Badge tone={meta.tone} dot className={cn('shrink-0', className)}>
      {meta.label}
    </Badge>
  );
}

export function SubjectTags({ subjects, max = 6 }: { subjects: string[]; max?: number }) {
  if (subjects.length === 0) return <span className="text-2xs text-muted-foreground">科目未填写</span>;
  return (
    <>
      {subjects.slice(0, max).map((s) => (
        <Badge key={s} tone="outline">
          {s}
        </Badge>
      ))}
      {subjects.length > max ? <Badge tone="muted">+{subjects.length - max}</Badge> : null}
    </>
  );
}

export interface DemandCardProps {
  demand: Demand;
  /** 卡片整体点击（老师端打开详情抽屉） */
  onClick?: () => void;
  /** 卡片底部操作区（学生端的编辑 / 取消 / 删除） */
  footer?: ReactNode;
  /** 是否展示学生姓名（老师视角） */
  showStudent?: boolean;
  /** 底部展示哪个时间：老师看发布时间，学生看更新时间 */
  timeField?: 'createTime' | 'updateTime';
  index?: number;
}

/**
 * 需求单卡片 —— 老师端与学生端共用。
 * 列表页不用表格：卡片在手机上更好读，也能把「科目 / 预算 / 上课方式」一次讲清楚。
 */
export function DemandCard({
  demand,
  onClick,
  footer,
  showStudent = false,
  timeField = 'createTime',
  index = 0,
}: DemandCardProps) {
  const subjects = demandSubjects(demand);
  const excerpt = stripHtml(demand.description, 90);
  const clickable = Boolean(onClick);

  // 入场动画交给 CSS（.rare-rise + animationDelay）：这里是列表卡片，
  // 为它背一个 120KB 的动画库不划算；prefers-reduced-motion 下自动关闭。
  return (
    <div className="rare-rise h-full" style={{ animationDelay: `${Math.min(index * 35, 250)}ms` }}>
      <Card
        interactive={clickable}
        onClick={onClick}
        className={cn('flex h-full flex-col p-4', clickable && 'cursor-pointer active:scale-[0.995]')}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-sm font-semibold leading-5 tracking-tight line-clamp-2">
            {demand.title || `需求 #${demand.demandId}`}
          </h3>
          <DemandStatusBadge demand={demand} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SubjectTags subjects={subjects} max={5} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          {demand.grade ? <span className="rounded-full bg-muted px-2 py-0.5">{demand.grade}</span> : null}
          <span>{classModeLabel(demand.classMode)}</span>
          {demand.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {demand.city}
            </span>
          ) : null}
        </div>

        <p className="mt-2.5 flex items-center gap-1 text-sm font-semibold text-primary">
          <Coins className="h-3.5 w-3.5 shrink-0" />
          {formatBudget(demand.budgetMin, demand.budgetMax, demand.budgetUnit)}
        </p>

        {excerpt ? (
          <p className="mt-2 min-h-[2rem] text-2xs leading-4 text-muted-foreground line-clamp-2">{excerpt}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-2xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            {showStudent ? (
              <span className="flex min-w-0 items-center gap-1">
                <UserRound className="h-3 w-3 shrink-0" />
                <span className="truncate">{demand.studentName || '匿名学生'}</span>
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3 w-3 shrink-0" />
              {formatDateTime(demand[timeField])}
            </span>
          </span>
          {clickable && !footer ? <span className="text-primary">查看详情 →</span> : null}
        </div>

        {footer ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{footer}</div> : null}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 个人主页（老师简历 + 帖子）共用字典与展示组件
 *
 * /me 的「我的资料」（可编辑）与「公开主页」（只读预览）用同一份，避免两处样式漂移。
 * ------------------------------------------------------------------ */

/** 身份徽章色调 */

/** 只读简历里的一个分组（标签在左、值在右，窄屏一行一条） */
function ResumeGroup({ title, items }: { title: string; items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5 text-xs"
          >
            <span className="shrink-0 text-muted-foreground">{it.label}</span>
            <span className="min-w-0 break-words text-right">{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 老师简历（只读）—— /me 的「我的资料」只读态与「公开主页」预览共用。
 * 分三块：基本信息 / 教学信息 / 自我介绍。
 */

export function ResumeReadonly({ profile }: { profile: TeacherProfile }) {
  const subjects = profileSubjects(profile);
  const grades = profileGrades(profile);

  return (
    <div className="flex flex-col gap-5">
      <ResumeGroup
        title="基本信息"
        items={[
          { label: '真实姓名', value: profile.realName || '未填写' },
          { label: '性别', value: profileGenderLabel(profile.gender) },
          { label: '年龄', value: profile.age != null ? `${profile.age} 岁` : '未填写' },
          { label: '所在城市', value: profile.city || '未填写' },
          { label: '联系方式', value: profile.contact || '未填写' },
        ]}
      />

      <ResumeGroup
        title="教学信息"
        items={[
          { label: '学历', value: profile.education || '未填写' },
          { label: '毕业院校', value: profile.school || '未填写' },
          { label: '专业', value: profile.major || '未填写' },
          { label: '可授科目', value: subjects.length > 0 ? subjects.join('、') : '未填写' },
          { label: '可授年级', value: grades.length > 0 ? grades.join('、') : '未填写' },
          { label: '期望时薪', value: formatHourlyRate(profile.hourlyRate) },
          { label: '教龄', value: profile.experienceYears != null ? `${profile.experienceYears} 年` : '未填写' },
          { label: '可授课时间', value: profile.availableTime || '未填写' },
          { label: '证书荣誉', value: profile.certificates || '未填写' },
        ]}
      />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-medium text-muted-foreground">自我介绍</p>
        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
          {profile.intro?.trim() || '还没有写自我介绍'}
        </p>
      </div>
    </div>
  );
}

/** 超过这个字数就先折叠，点「展开全文」再看 */
const POST_CLAMP_LENGTH = 240;

export interface PostCardProps {
  post: UserPost;
  index?: number;
  /** 是否展示作者（多作者场景用；某人的主页里作者就是页主，可关掉） */
  showAuthor?: boolean;
  /** 卡片底部操作区（我的主页里放删除按钮） */
  footer?: ReactNode;
  /** 标题右侧的状态标（「我的帖子」里显示待审核 / 已通过 / 未通过） */
  statusSlot?: ReactNode;
  /** 作者名可点进公开主页（广场里用；自己的主页里不传） */
  authorLink?: boolean;
}

/** 帖子卡片 —— 我的主页与公开主页共用 */
export function PostCard({
  post,
  index = 0,
  showAuthor = false,
  footer,
  statusSlot,
  authorLink = false,
}: PostCardProps) {
  const [expanded, setExpanded] = useState(false);

  const content = post.content ?? '';
  const images = postImages(post);
  const long = content.length > POST_CLAMP_LENGTH;
  const shown = long && !expanded ? `${content.slice(0, POST_CLAMP_LENGTH)}…` : content;
  const authorName = post.authorName || '匿名用户';

  // 入场动画交给 CSS（.rare-rise + animationDelay）：这里是列表卡片，
  // 为它背一个 120KB 的动画库不划算；prefers-reduced-motion 下自动关闭。
  return (
    <div className="rare-rise h-full" style={{ animationDelay: `${Math.min(index * 35, 250)}ms` }}>
      <Card className="flex h-full flex-col p-4">
        <div className="flex items-center gap-2.5">
          {showAuthor ? <Avatar size="sm" name={authorName} /> : null}
          <div className="min-w-0 flex-1">
            {showAuthor ? (
              <p className="flex items-center gap-1.5 text-xs font-medium">
                {authorLink && post.accountId ? (
                  <Link
                    to={`/public/${post.accountId}`}
                    className="truncate transition-colors hover:text-primary hover:underline"
                  >
                    {authorName}
                  </Link>
                ) : (
                  <span className="truncate">{authorName}</span>
                )}
                {post.authorRole ? <Badge tone={ROLE_TONE[post.authorRole]}>{ROLE_LABEL[post.authorRole]}</Badge> : null}
              </p>
            ) : null}
            <p className="flex items-center gap-1 text-2xs text-muted-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              {formatDateTime(post.createTime)}
            </p>
          </div>
          {statusSlot ? <span className="shrink-0">{statusSlot}</span> : null}
          <span className="shrink-0 text-2xs text-muted-foreground">#{post.postId}</span>
        </div>

        {content ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">{shown}</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">（这条帖子没有文字内容）</p>
        )}

        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 self-start text-2xs text-primary transition-colors hover:underline"
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        ) : null}

        {images.length > 0 ? (
          <div className={cn('mt-3 grid gap-1.5', images.length === 1 ? 'grid-cols-1' : 'grid-cols-3')}>
            {images.map((src, i) => {
              const imageUrl = resolveAssetUrl(src);
              if (!imageUrl) return null;
              return (
                <a
                  key={`${src}-${i}`}
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-border/60"
                >
                  <img
                    src={imageUrl}
                    alt={`帖子图片 ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    /* 高度由 CSS 定死（多图 h-24 / 单图 max-h-64），所以不写 width/height：
                       硬写宽高比会让长图、全景图被裁成固定的方块。 */
                    className={cn('w-full object-cover', images.length === 1 ? 'max-h-64' : 'h-24')}
                  />
                </a>
              );
            })}
          </div>
        ) : null}

        {footer ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">{footer}</div>
        ) : null}
      </Card>
    </div>
  );
}
