import { memo } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { firstImage, splitList, teacherTypeLabel, tutorDisplayName, tutorLocation } from '@/lib/constants';
import type { TutorInfo } from '@/types/api';
import { Avatar, Badge } from '@/components/ui';

export interface TutorCardProps {
  tutor: TutorInfo;
  /** 覆盖跳转地址（默认进详情页） */
  to?: string;
}

/**
 * 家教卡片 —— 公开列表页用：头像 / 姓名 / 认证 / 科目 / 地区 / 时薪 / 评分。
 * 整卡即链接，hover 只改变边框与底色，不做缩放或入场动画。
 */
export function TutorCardComponent({ tutor, to }: TutorCardProps) {
  const subjects = splitList(tutor.subjectNames);
  const target = to ?? `/tutors/${tutor.tutorId ?? ''}`;
  const meta = [tutor.university, teacherTypeLabel(tutor.teacherType)].filter(Boolean).join(' · ');
  const audited = tutor.auditStatus === '1';

  return (
    <Link
      to={target}
      className="flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-hairline transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <Avatar size="lg" src={firstImage(tutor.avatarImages)} name={tutorDisplayName(tutor)} rounded="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold tracking-tight">{tutorDisplayName(tutor)}</p>
            {audited ? (
              <Badge tone="success" className="shrink-0 rounded-md px-1.5 py-0">
                <BadgeCheck className="h-3 w-3" />
                认证
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">{meta || '暂无院校信息'}</p>
        </div>

        {typeof tutor.avgScore === 'number' ? (
          <span className="flex shrink-0 items-center gap-1 text-2xs font-medium tabular text-warning">
            <Star className="h-3 w-3 fill-current" />
            {tutor.avgScore.toFixed(1)}
          </span>
        ) : null}
      </div>

      {subjects.length ? (
        <div className="flex flex-wrap gap-1.5">
          {subjects.slice(0, 4).map((s) => (
            <Badge key={s} tone="outline" className="rounded-md">
              {s}
            </Badge>
          ))}
          {subjects.length > 4 ? (
            <Badge tone="muted" className="rounded-md">
              +{subjects.length - 4}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-2xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{tutorLocation(tutor)}</span>
        </span>
        <span className="shrink-0 font-medium tabular text-foreground">
          {tutor.expectedSalary ? (
            <>
              ¥{tutor.expectedSalary}
              <span className="font-normal text-muted-foreground">/时</span>
            </>
          ) : (
            '薪资面议'
          )}
        </span>
      </div>
    </Link>
  );
}

/**
 * 列表卡片的 props 只有 tutor 对象（来自接口，引用稳定）与可选的 to，
 * memo 之后「本地关键词过滤」留下的那些卡片不会被重新渲染。
 */
export const TutorCard = memo(TutorCardComponent);

export default TutorCard;
