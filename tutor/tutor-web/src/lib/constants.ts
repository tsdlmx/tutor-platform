import type { TutorInfo } from '@/types/api';

export const APP_NAME = '家教中介平台';
export const APP_SUBTITLE = '最后一公里家教预约平台';

/**
 * 页脚备案号（ICP）：拿到备案号后填这里，页脚会自动显示；留空则不显示。
 * 例：'京ICP备00000000号-1'
 */
export const ICP_BEIAN = '';

export const TOKEN_KEY = 'tutor-admin-token';
export const THEME_KEY = 'tutor-theme';

/**
 * 客户侧（老师 / 学生）登录态 key —— 必须与后台 token 完全隔离。
 * 客户账号存在 t_customer_account，与若依 sys_user 是两套体系，
 * 混用 key 会让「登录了客户账号」把管理后台的会话顶掉。
 */
export const CUSTOMER_TOKEN_KEY = 'tutor_customer_token';

/** 客户侧接口统一前缀（前端经 /dev-api 代理访问 /customer/**） */
export const CUSTOMER_API_PREFIX = '/customer';

/** 登录后默认跳转 */
export const HOME_PATH = '/admin/dashboard';

/* ------------------------------------------------------------------ *
 * 枚举 / 字典（与后端注释保持一致）
 * ------------------------------------------------------------------ */

/** 审核状态 0待审核 1审核通过 2审核拒绝 */
export const AUDIT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  '0': { label: '待审核', tone: 'warning' },
  '1': { label: '审核通过', tone: 'success' },
  '2': { label: '审核拒绝', tone: 'danger' },
};

/** 通用状态 0正常 1停用 */
export const COMMON_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  '0': { label: '正常', tone: 'success' },
  '1': { label: '停用', tone: 'danger' },
};

export const GENDER: Record<string, string> = {
  male: '男',
  female: '女',
  '0': '男',
  '1': '女',
  '2': '未知',
};

export const TEACHER_TYPE: Record<string, string> = {
  retired: '退休教师',
  working: '在职教师',
  student: '在校生',
};

export const TEACHING_MODE: Record<string, string> = {
  offline: '线下',
  online: '线上',
};

export const DEPOSIT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  '0': { label: '未支付', tone: 'muted' },
  '1': { label: '已支付', tone: 'success' },
  '2': { label: '已退款', tone: 'info' },
};

export const WX_USER_TYPE: Record<string, string> = {
  parent: '家长',
  teacher: '家教',
  tutor: '家教',
  admin: '管理员',
};

/** 操作日志业务类型（RuoYi BusinessType） */
export const BUSINESS_TYPE: Record<number, string> = {
  0: '其它',
  1: '新增',
  2: '修改',
  3: '删除',
  4: '授权',
  5: '导出',
  6: '导入',
  7: '强退',
  8: '生成代码',
  9: '清空数据',
};

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'outline';

/* ------------------------------------------------------------------ *
 * H5 筛选选项
 * 说明：后端公开接口只有 /miniapp/tutor/list，其 subject 参数按“科目名称”做
 * 模糊匹配（t.subjectNames.contains(subject)），gradeId 按数字 ID 匹配
 * tutorable_grade_ids。后端白名单里的 /miniapp/parent/grades 没有实现（会 404），
 * 因此这里使用与 tutor-uniapp 一致的本地常量，而不是依赖接口。
 * ------------------------------------------------------------------ */

export const SUBJECTS: { id: number; name: string; emoji: string }[] = [
  { id: 1, name: '语文', emoji: '📖' },
  { id: 2, name: '数学', emoji: '🧮' },
  { id: 3, name: '英语', emoji: '🔤' },
  { id: 4, name: '物理', emoji: '🧲' },
  { id: 5, name: '化学', emoji: '⚗️' },
  { id: 6, name: '生物', emoji: '🧬' },
  { id: 7, name: '政治', emoji: '🏛️' },
  { id: 8, name: '历史', emoji: '📜' },
  { id: 9, name: '地理', emoji: '🌏' },
  { id: 10, name: '编程', emoji: '💻' },
];

export const SUBJECT_NAMES = SUBJECTS.map((s) => s.name);

export const GRADES: { id: number; name: string }[] = [
  { id: 1, name: '小学一年级' },
  { id: 2, name: '小学二年级' },
  { id: 3, name: '小学三年级' },
  { id: 4, name: '小学四年级' },
  { id: 5, name: '小学五年级' },
  { id: 6, name: '小学六年级' },
  { id: 7, name: '初中一年级' },
  { id: 8, name: '初中二年级' },
  { id: 9, name: '初中三年级' },
  { id: 10, name: '高中一年级' },
  { id: 11, name: '高中二年级' },
  { id: 12, name: '高中三年级' },
];

export const CONSTELLATIONS = [
  '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座',
];

/** 家教列表排序方式 */
export const SORT_OPTIONS: { value: '' | 'distance' | 'score'; label: string }[] = [
  { value: '', label: '综合推荐' },
  { value: 'distance', label: '距离最近' },
  { value: 'score', label: '评分最高' },
];

/** 默认坐标（无锡市中心）—— 距离排序需要经纬度 */
export const DEFAULT_COORDS = { latitude: 31.4912, longitude: 120.3119 };

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

export function auditLabel(v?: string) {
  return AUDIT_STATUS[v ?? '']?.label ?? '未知';
}

export function auditTone(v?: string): BadgeTone {
  return AUDIT_STATUS[v ?? '']?.tone ?? 'muted';
}

export function genderLabel(v?: string) {
  return GENDER[v ?? ''] ?? '未知';
}

export function teacherTypeLabel(v?: string) {
  return TEACHER_TYPE[v ?? ''] ?? v ?? '—';
}

/** "offline,online" -> "线下 / 线上" */
export function teachingModeLabel(v?: string) {
  if (!v) return '—';
  return v
    .split(',')
    .map((x) => TEACHING_MODE[x.trim()] ?? x.trim())
    .filter(Boolean)
    .join(' / ');
}

export function splitList(v?: string | null): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 头像字段是多张逗号分隔的图，取第一张 */
export function firstImage(v?: string | null): string | undefined {
  return splitList(v)[0];
}

/** 后端返回 /profile/upload/... 这种相对路径，经 vite 代理无法访问，做兜底占位 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (!u) return undefined;
  if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return u;
  if (u.startsWith('/src/') || u.startsWith('/assets/')) return u;
  // 后端静态资源（/profile/**）已经 permitAll，但不在 /dev-api 代理下，直连 8080
  const base = (import.meta.env.VITE_ASSET_BASE_URL as string | undefined) ?? '';
  return `${base}${u}`;
}

export function maskIdCard(v?: string | null) {
  if (!v) return '—';
  if (v.length <= 8) return v;
  return `${v.slice(0, 4)}**********${v.slice(-4)}`;
}

export function maskPhone(v?: string | null) {
  if (!v) return '—';
  if (v.length !== 11) return v;
  return `${v.slice(0, 3)}****${v.slice(-4)}`;
}

export function emptyText(v: unknown, fallback = '—') {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

/** 去掉富文本标签，用于列表摘要 */
export function stripHtml(html?: string | null, max = 80) {
  if (!html) return '';
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function formatDateTime(v?: string | number | null) {
  if (!v) return '—';
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : toLocal(d);
  }
  const text = String(v).trim();
  // Go 侧返回 RFC3339（带 T、小数秒与 Z/时区），统一转成本地时间并去掉小数秒；
  // 已经是 "YYYY-MM-DD HH:mm:ss" 的字符串原样返回。
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return toLocal(parsed);
  }
  return text.replace('T', ' ');
}

function toLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 从 tutor 记录里推断所在地文本 */
export function tutorLocation(t: TutorInfo) {
  const parts = [t.province, t.city, t.district].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/** 家教展示名 */
export function tutorDisplayName(t: TutorInfo) {
  return t.tutorName || t.tutorNo || `家教 #${t.tutorId ?? '—'}`;
}
