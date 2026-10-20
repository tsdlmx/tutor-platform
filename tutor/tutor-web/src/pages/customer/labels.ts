import type { BadgeTone } from '@/lib/constants';
import type { ClassMode, Demand, Role, TeacherProfile, UserPost } from '@/api/customer';
import type { SelectOption } from '@/components/ui';

/**
 * 客户侧共用的字典 / 展示工具（**纯数据 + 纯函数**，不含任何 React 组件）。
 *
 * 为什么要单独拆出来：外壳（CustomerLayout）只需要一个 ROLE_LABEL，
 * 却原来要从 shared.tsx 里拿——那会把 DemandCard/PostCard（含 framer-motion）
 * 一起拽进首屏依赖。纯字典放这里，外壳就不会连带拉动画库。
 * shared.tsx 仍然 `export * from './labels'`，老引用不受影响。
 */

export const ROLE_LABEL: Record<Role, string> = {
  TEACHER: '老师',
  STUDENT: '学生',
};

export const ROLE_DESC: Record<Role, string> = {
  TEACHER: '查看学生的辅导需求，找到合适的学员',
  STUDENT: '发布辅导需求，让老师主动联系你',
};

/** 上课方式 */
export const CLASS_MODE_LABEL: Record<string, string> = {
  online: '线上',
  offline: '线下',
  both: '线上线下均可',
};

/** 预算单位 */
export const BUDGET_UNIT_LABEL: Record<string, string> = {
  hour: '小时',
  lesson: '次课',
  month: '月',
};

export const BUDGET_UNIT_OPTIONS: SelectOption[] = [
  { label: '元 / 小时', value: 'hour' },
  { label: '元 / 次课', value: 'lesson' },
  { label: '元 / 月', value: 'month' },
];

/** 需求状态 0待接单 1已接单 2已完成 3已取消 */
export const DEMAND_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  '0': { label: '待接单', tone: 'warning' },
  '1': { label: '已接单', tone: 'info' },
  '2': { label: '已完成', tone: 'success' },
  '3': { label: '已取消', tone: 'muted' },
};

/** 年级选项（与需求单里存的文本一致，后端按文本模糊匹配） */
export const DEMAND_GRADES = [
  '小学一年级',
  '小学二年级',
  '小学三年级',
  '小学四年级',
  '小学五年级',
  '小学六年级',
  '初一',
  '初二',
  '初三',
  '高一',
  '高二',
  '高三',
];

export const GRADE_OPTIONS: SelectOption[] = DEMAND_GRADES.map((g) => ({ label: g, value: g }));

/** 状态文案 + 色调（后端 statusText 优先） */
export function demandStatusMeta(demand: Pick<Demand, 'status' | 'statusText'>) {
  const key = String(demand.status ?? '');
  const preset = DEMAND_STATUS[key];
  return {
    label: demand.statusText || preset?.label || '未知状态',
    tone: (preset?.tone ?? 'muted') as BadgeTone,
  };
}

/** 科目：优先用后端切好的 subjectList，兜底自己按逗号切 subjects */
export function demandSubjects(demand: Pick<Demand, 'subjectList' | 'subjects'>): string[] {
  if (Array.isArray(demand.subjectList) && demand.subjectList.length > 0) {
    return demand.subjectList.filter((s) => Boolean(s));
  }
  if (!demand.subjects) return [];
  return demand.subjects
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimNumber(n: number) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** 预算展示：¥150–250/小时、¥200/小时、¥150 起/小时、预算面议 */
export function formatBudget(min?: number | null, max?: number | null, unit?: string | null): string {
  const unitLabel = BUDGET_UNIT_LABEL[String(unit ?? '')] ?? '';
  const suffix = unitLabel ? `/${unitLabel}` : '';
  const hasMin = typeof min === 'number' && Number.isFinite(min) && min > 0;
  const hasMax = typeof max === 'number' && Number.isFinite(max) && max > 0;

  if (!hasMin && !hasMax) return '预算面议';
  if (hasMin && hasMax) {
    const a = trimNumber(min as number);
    const b = trimNumber(max as number);
    return a === b ? `¥${a}${suffix}` : `¥${a}–${b}${suffix}`;
  }
  if (hasMin) return `¥${trimNumber(min as number)} 起${suffix}`;
  return `¥${trimNumber(max as number)} 以内${suffix}`;
}

export function classModeLabel(mode?: ClassMode | string | null): string {
  if (!mode) return '方式待沟通';
  return CLASS_MODE_LABEL[String(mode)] ?? String(mode);
}

/* ------------------------------------------------------------------ *
 * 展示型小组件
 * ------------------------------------------------------------------ */


export const ROLE_TONE: Record<Role, BadgeTone> = {
  TEACHER: 'info',
  STUDENT: 'success',
};

/** 简历性别："0"未知 "1"男 "2"女 */
export const PROFILE_GENDER_LABEL: Record<string, string> = {
  '0': '未知',
  '1': '男',
  '2': '女',
};

export const GENDER_OPTIONS: SelectOption[] = [
  { label: '男', value: '1' },
  { label: '女', value: '2' },
  { label: '保密', value: '0' },
];

/** 学历（与后端注释里的取值一致：专科/本科/硕士/博士/在读） */
export const EDUCATION_OPTIONS: SelectOption[] = ['专科', '本科', '硕士', '博士', '在读'].map((v) => ({
  label: v,
  value: v,
}));

export function profileGenderLabel(gender?: string | null): string {
  if (gender === undefined || gender === null || gender === '') return '未填写';
  return PROFILE_GENDER_LABEL[String(gender)] ?? String(gender);
}

/** 简历可授科目：优先用后端切好的 subjectList，兜底自己按逗号切 subjects */
export function profileSubjects(profile: Pick<TeacherProfile, 'subjectList' | 'subjects'>): string[] {
  if (Array.isArray(profile.subjectList) && profile.subjectList.length > 0) {
    return profile.subjectList.filter((s) => Boolean(s));
  }
  if (!profile.subjects) return [];
  return profile.subjects
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 简历可授年级：逗号分隔字符串 → 数组 */
export function profileGrades(profile: Pick<TeacherProfile, 'grades'>): string[] {
  if (!profile.grades) return [];
  return profile.grades
    .split(/[,，、]/)
    .map((g) => g.trim())
    .filter(Boolean);
}

/** 期望时薪展示：¥200 / 小时；没填就是「面议」 */
export function formatHourlyRate(rate?: number | null): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return '面议';
  return `¥${Number.isInteger(rate) ? rate : Number(rate.toFixed(2))} / 小时`;
}

/** 帖子图片：优先用后端切好的 imageList，兜底自己按逗号切 images */
export function postImages(post: Pick<UserPost, 'imageList' | 'images'>): string[] {
  if (Array.isArray(post.imageList) && post.imageList.length > 0) {
    return post.imageList.filter((u) => Boolean(u));
  }
  if (!post.images) return [];
  return post.images
    .split(/[,，]/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** "2026-10-16 12:00:00" → 时间戳；解析不出来按 0 处理 */
function postTimestamp(v?: string | null): number {
  if (!v) return 0;
  const t = new Date(String(v).replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 帖子按时间倒序（契约要求最新的在最前）。
 * 后端本身就倒序返回，这里再兜一层：实现有偏差时至少不会把最早的帖子摆在最上面。
 */
export function sortPostsDesc(posts: UserPost[]): UserPost[] {
  return [...posts].sort((a, b) => postTimestamp(b.createTime) - postTimestamp(a.createTime));
}
