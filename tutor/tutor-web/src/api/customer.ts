import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { CUSTOMER_API_PREFIX, CUSTOMER_TOKEN_KEY } from '@/lib/constants';
import type { ApiResult } from '@/types/api';

/* ------------------------------------------------------------------ *
 * 客户侧接口（邮箱账号 + 需求单）
 *
 * 为什么要单独一个 axios 实例：
 *   客户账号存在 t_customer_account，token 只对 /customer/** 有效；
 *   管理后台的实例（@/api/request）会把 admin token 塞进所有请求头，
 *   两者共用必然互相污染。所以这里自带实例 + 自带 token + 自带拦截器。
 *
 * 后端契约见 docs/CUSTOMER-API.md：
 *   成功 → 200 { code:200, msg, data }      业务失败 → 200 { code:400, msg }
 *   未登录 → 401 { code:401, msg }          越权  → 403 { code:403, msg }
 * ------------------------------------------------------------------ */

/** 客户身份：老师 / 学生；注册后为 null（还没选身份） */
export type Role = 'TEACHER' | 'STUDENT';

/** 预算单位 */
export type BudgetUnit = 'hour' | 'lesson' | 'month';
/** 上课方式 */
export type ClassMode = 'online' | 'offline' | 'both';
/** 需求状态 0待接单 1已接单 2已完成 3已取消 */
export type DemandStatus = '0' | '1' | '2' | '3';

export interface CustomerAccount {
  accountId?: number;
  email: string;
  nickname?: string | null;
  role?: Role | null;
  createTime?: string;
}

export interface Demand {
  demandId: number;
  studentId?: number;
  /** 老师视角可见；学生视角就是自己 */
  studentName?: string;
  title: string;
  /** 逗号分隔字符串（存库形态） */
  subjects?: string;
  /** 后端已切好的数组形态，优先使用 */
  subjectList?: string[];
  grade?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetUnit?: BudgetUnit | string;
  classMode?: ClassMode | string;
  city?: string;
  description?: string;
  status?: DemandStatus | string;
  statusText?: string;
  createTime?: string;
  updateTime?: string;
}

export interface SubjectStat {
  name: string;
  count: number;
}

export interface DemandStats {
  total: number;
  open: number;
  avgBudget: number;
  bySubject: SubjectStat[];
}

/** 登录 / 注册成功返回体 */
export interface AuthPayload {
  token: string;
  account: CustomerAccount;
}

export interface RegisterBody {
  email: string;
  password: string;
  nickname?: string;
  /** 邮箱验证码 —— 注册必须先收到并填写它 */
  code: string;
  /** 必须为 true：未勾选同意隐私政策与用户协议时后端会拒绝注册 */
  consent: boolean;
}

/** POST /customer/auth/send-code 的返回 */
export interface SendCodeResult {
  sent: boolean;
  /** 验证码有效期（秒） */
  expiresIn: number;
  /** 多少秒后才能重发 */
  resendAfter: number;
  /** 发信方式描述（未配 SMTP 时会是「开发模式…」） */
  transport?: string;
  /** 仅开发模式（未配置 SMTP）才会返回：把验证码回显给前端，方便本地联调 */
  devCode?: string;
  devNotice?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

/** 需求列表查询条件（GET /customer/demands） */
export interface DemandQuery {
  subject?: string;
  grade?: string;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}

/** 需求单提交体（新增 / 修改） */
export interface DemandBody {
  title: string;
  subjectList: string[];
  grade?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetUnit?: BudgetUnit;
  classMode?: ClassMode;
  city?: string;
  description: string;
}

export interface PageResult<T> {
  total: number;
  rows: T[];
}

/* ------------------------------------------------------------------ *
 * token 存储 —— 独立 key，绝不与后台 token 混用
 * ------------------------------------------------------------------ */

export const customerTokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(CUSTOMER_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------ *
 * 401 回调 —— 由 CustomerAuthProvider 注册，用于清态 + 跳 /login
 * ------------------------------------------------------------------ */

let onUnauthorized: (() => void) | null = null;

export function setCustomerUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class CustomerApiError extends Error {
  code: number;
  constructor(code: number, msg: string) {
    super(msg);
    this.name = 'CustomerApiError';
    this.code = code;
  }
}

function handleUnauthorized(msg?: string): CustomerApiError {
  customerTokenStore.clear();
  onUnauthorized?.();
  return new CustomerApiError(401, msg || '登录状态已过期，请重新登录');
}

/* ------------------------------------------------------------------ *
 * 独立 axios 实例
 * ------------------------------------------------------------------ */

const customerHttp: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_CUSTOMER_API_BASE_URL || '/web-api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json;charset=utf-8' },
});

/* ---------------------------- 请求拦截 ---------------------------- */
customerHttp.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = customerTokenStore.get();
    if (config.headers) {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // 显式删掉，防止任何来源的 admin token 被带到客户接口上
        delete config.headers.Authorization;
      }
    }
    // GET 去掉 undefined / null / ''，避免后端收到空串把条件当成有效值
    if (config.params) {
      const cleaned: Record<string, unknown> = {};
      Object.entries(config.params as Record<string, unknown>).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
      });
      config.params = cleaned;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

/* ---------------------------- 响应拦截 ---------------------------- */
customerHttp.interceptors.response.use(
  (response: AxiosResponse) => {
    const payload = response.data as ApiResult | undefined;
    // 非 JSON 包装（下载流等）直接放行
    if (!payload || typeof payload.code !== 'number') return response;

    // 有的部署把 401 也包在 200 里返回，这里一并处理
    if (payload.code === 401) {
      return Promise.reject(handleUnauthorized(payload.msg));
    }
    if (payload.code !== 200) {
      return Promise.reject(new CustomerApiError(payload.code, payload.msg || '请求失败'));
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      return Promise.reject(handleUnauthorized());
    }
    const data = error.response?.data as ApiResult | undefined;
    const msg =
      data?.msg ||
      (error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : error.message) ||
      '网络异常，请稍后重试';
    return Promise.reject(new CustomerApiError(status ?? -1, msg));
  },
);

/** 取回 {code,msg,data} 里的 data */
async function reqData<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await customerHttp.request<ApiResult<T>>(config);
  return res.data.data as T;
}

/**
 * 认证类接口专用：契约规定返回 { code,msg,data }，这里额外兼容「字段平铺」的
 * 实现（把除 code/msg 外的字段整体当 payload），后端轻微偏差时不至于直接登录失败。
 */
async function reqAuthData<T extends object>(config: AxiosRequestConfig): Promise<T> {
  const res = await customerHttp.request<ApiResult<T> & Record<string, unknown>>(config);
  const body = res.data;
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    return body.data;
  }
  const { code: _code, msg: _msg, ...flat } = (body ?? {}) as Record<string, unknown>;
  return flat as unknown as T;
}

/** 取回 {code,total,rows} 整个分页体 */
async function reqPage<T>(config: AxiosRequestConfig): Promise<PageResult<T>> {
  const res = await customerHttp.request<{ code: number; total?: number; rows?: T[] }>(config);
  return { total: res.data.total ?? 0, rows: res.data.rows ?? [] };
}

/** 只关心成功/失败（增删改） */
async function reqOk(config: AxiosRequestConfig): Promise<string> {
  const res = await customerHttp.request<ApiResult>(config);
  return res.data.msg || '操作成功';
}

/** 统一的业务请求 URL（带 /customer 前缀） */
function url(path: string) {
  return `${CUSTOMER_API_PREFIX}${path}`;
}

/* ------------------------------------------------------------------ *
 * 3.1 账号
 * ------------------------------------------------------------------ */

/**
 * POST /customer/auth/send-code —— 发送邮箱验证码
 * 限流：同邮箱 60 秒一次、每小时 10 次。
 */
export function sendCode(email: string) {
  return reqData<SendCodeResult>({ url: url('/auth/send-code'), method: 'post', data: { email } });
}

/** 老师对需求的「申请联系」 */
export interface DemandApply {
  applyId?: number;
  demandId: number;
  teacherId?: number;
  message?: string | null;
  /** 0待处理 1已同意 2已拒绝 */
  status?: string;
  createTime?: string;
  updateTime?: string;
  /** 学生视角：需求标题 / 科目 / 年级 */
  demandTitle?: string;
  demandSubjects?: string;
  demandGrade?: string;
  /** 学生视角：申请的老师昵称 */
  teacherName?: string;
  teacherRole?: string;
}

/** POST /customer/auth/send-reset-code —— 找回密码第 1 步（未注册的邮箱也返回成功，防枚举） */
export function sendResetCode(email: string) {
  return reqData<SendCodeResult>({ url: url('/auth/send-reset-code'), method: 'post', data: { email } });
}

/** POST /customer/auth/reset-password —— 找回密码第 2 步；成功后所有旧会话失效 */
export function resetPassword(body: { email: string; code: string; password: string }) {
  return reqData<{ data?: unknown }>({ url: url('/auth/reset-password'), method: 'post', data: body });
}

/** POST /customer/auth/register —— 注册成功即拿到 token，role 为 null */
export function register(body: RegisterBody) {
  return reqAuthData<AuthPayload>({ url: url('/auth/register'), method: 'post', data: body });
}

/** POST /customer/auth/login */
export function login(body: LoginBody) {
  return reqAuthData<AuthPayload>({ url: url('/auth/login'), method: 'post', data: body });
}

/** POST /customer/auth/logout */
export function logout() {
  return reqOk({ url: url('/auth/logout'), method: 'post' });
}

/**
 * POST /customer/auth/delete-account —— 注销账号（行使删除权）
 *
 * 需要重新输入登录密码；后端会在一个事务里删除账号及其简历、帖子、需求与申请。
 * 安全审计记录保留（只含掩码标识）。
 */
export function deleteAccount(password: string) {
  return reqOk({ url: url('/auth/delete-account'), method: 'post', data: { password } });
}

/** 导出的数据包结构（与后端 identity.CustomerDataExport 对应） */
export interface CustomerDataExport {
  schemaVersion: string;
  exportedAt: string;
  account: CustomerAccount;
  consents: { consentType: string; policyVersion: string; consentedAt: string }[];
  teacherProfile?: TeacherProfile | null;
  posts: UserPost[];
  demands: Demand[];
  receivedApplications: { applyId: number; demandId: number; status: string; message?: string | null }[];
  sentApplications: { applyId: number; demandId: number; status: string; message?: string | null }[];
  truncated: boolean;
}

/**
 * GET /customer/auth/export —— 导出本人数据（行使查阅/可携带权）
 *
 * 只返回本人的账号、同意记录、简历、帖子、需求与申请；不含他人的个人信息。
 * 调用方负责把它变成文件下载。
 */
export function exportMyData() {
  return reqData<CustomerDataExport>({ url: url('/auth/export'), method: 'get' });
}

/**
 * GET /customer/auth/me —— 当前账号（用已有 token 换取）。
 * 返回 null 表示后端没给出可用账号信息，调用方按「未登录」处理。
 */
export async function me(): Promise<CustomerAccount | null> {
  const data = await reqAuthData<CustomerAccount>({ url: url('/auth/me'), method: 'get' });
  // 既没有邮箱也没有账号编号 → 不是有效账号（例如后端只回了 msg）
  if (data?.email === undefined && data?.accountId === undefined) return null;
  return data;
}

/** PUT /customer/auth/role —— 选择身份（一次性；后端会拒绝已确定身份的再次切换） */
export function setRole(role: Role) {
  return reqAuthData<CustomerAccount>({ url: url('/auth/role'), method: 'put', data: { role } });
}

/* ------------------------------------------------------------------ *
 * 3.2 科目字典
 * ------------------------------------------------------------------ */

/** GET /customer/subjects —— 返回科目名称数组 */
/*
 * 科目字典是「几乎不变 + 多页共用」的数据：首页、需求池筛选、发布表单都会拉一次。
 * 这里做一层进程内缓存（同一份 Promise 复用），避免同一会话里重复请求；
 * 失败不缓存，下次进页面还能重试。
 */
let subjectsPromise: Promise<string[]> | null = null;

export async function listSubjects(): Promise<string[]> {
  if (!subjectsPromise) {
    subjectsPromise = fetchSubjects().catch((e) => {
      subjectsPromise = null;
      throw e;
    });
  }
  return subjectsPromise;
}

async function fetchSubjects(): Promise<string[]> {
  const data = await reqData<unknown>({ url: url('/subjects'), method: 'get' });
  if (Array.isArray(data)) return data.filter((s): s is string => typeof s === 'string');
  // 兜底：后端若返回 [{name:'数学'}] 这种对象数组也能用
  if (Array.isArray((data as { list?: unknown })?.list)) {
    const list = (data as { list: unknown[] }).list;
    return list
      .map((s) => (typeof s === 'string' ? s : ((s as { name?: string })?.name ?? '')))
      .filter(Boolean);
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * 3.3 需求单
 * ------------------------------------------------------------------ */

/** GET /customer/demands —— 老师=全部未取消需求；学生=自己的需求 */
export function listDemands(params: DemandQuery) {
  return reqPage<Demand>({ url: url('/demands'), method: 'get', params });
}

/** POST /customer/demands/{id}/apply —— 老师「申请联系」学生 */
export function applyToDemand(demandId: number | string, message?: string) {
  return reqAuthData<DemandApply>({
    url: url(`/demands/${demandId}/apply`),
    method: 'post',
    data: { message: message ?? null },
  });
}

/** GET /customer/demands/applied —— 我（老师）申请过的需求ID */
export async function listAppliedDemandIds(): Promise<number[]> {
  const data = await reqData<unknown>({ url: url('/demands/applied'), method: 'get' });
  if (!Array.isArray(data)) return [];
  return data.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

/** GET /customer/demands/applications —— 我（学生）收到的老师申请 */
export async function listReceivedApplications(): Promise<DemandApply[]> {
  const data = await reqData<unknown>({ url: url('/demands/applications'), method: 'get' });
  return Array.isArray(data) ? (data as DemandApply[]) : [];
}

/** GET /customer/demands/stats —— 老师首页统计 */
export async function demandStats(): Promise<DemandStats> {
  const data = await reqData<Partial<DemandStats> | null>({ url: url('/demands/stats'), method: 'get' });
  return {
    total: Number(data?.total ?? 0),
    open: Number(data?.open ?? 0),
    avgBudget: Number(data?.avgBudget ?? 0),
    bySubject: Array.isArray(data?.bySubject)
      ? data.bySubject
          .filter((s): s is SubjectStat => Boolean(s) && typeof s.name === 'string')
          .map((s) => ({ name: s.name, count: Number(s.count ?? 0) }))
      : [],
  };
}

/** GET /customer/demands/{id} */
export function getDemand(demandId: number | string) {
  return reqData<Demand>({ url: url(`/demands/${demandId}`), method: 'get' });
}

/** POST /customer/demands —— 学生发布需求 */
export function createDemand(body: DemandBody) {
  return reqData<Demand>({ url: url('/demands'), method: 'post', data: body });
}

/** PUT /customer/demands/{id} —— 学生修改自己的需求 */
export function updateDemand(demandId: number | string, body: DemandBody) {
  return reqData<Demand>({ url: url(`/demands/${demandId}`), method: 'put', data: body });
}

/** DELETE /customer/demands/{id} */
export function deleteDemand(demandId: number | string) {
  return reqOk({ url: url(`/demands/${demandId}`), method: 'delete' });
}

/** PUT /customer/demands/{id}/status —— 改状态（学生本人） */
export function updateDemandStatus(demandId: number | string, status: DemandStatus) {
  return reqOk({ url: url(`/demands/${demandId}/status`), method: 'put', data: { status } });
}

/* ------------------------------------------------------------------ *
 * 3.4 个人主页（老师简历 + 帖子）
 *
 * 「我的」页面 = 个人社交主页：老师放简历，所有客户都能发帖子。
 * 还有一个只读版本 GET /customer/profile/{accountId} 给别人看。
 * 注意：读别人的主页**不返回邮箱**（避免泄露联系方式）。
 * ------------------------------------------------------------------ */

/** 老师简历（与账号 1:1；只有 TEACHER 身份可写） */
export interface TeacherProfile {
  accountId?: number;
  realName?: string | null;
  /** "0"未知 "1"男 "2"女 */
  gender?: string | null;
  age?: number | null;
  city?: string | null;
  /** 专科 / 本科 / 硕士 / 博士 / 在读 */
  education?: string | null;
  school?: string | null;
  major?: string | null;
  /** 逗号分隔（存库形态） */
  subjects?: string | null;
  /** 后端切好的数组形态，优先使用 */
  subjectList?: string[] | null;
  /** 逗号分隔的可授年级，如 "初一,初二,初三" */
  grades?: string | null;
  hourlyRate?: number | null;
  experienceYears?: number | null;
  availableTime?: string | null;
  intro?: string | null;
  certificates?: string | null;
  contact?: string | null;
  createTime?: string;
  updateTime?: string;
}

/** 帖子（所有人可发） */
export interface UserPost {
  postId: number;
  accountId?: number;
  content?: string | null;
  /** 逗号分隔（存库形态） */
  images?: string | null;
  /** 后端切好的数组形态，优先使用 */
  imageList?: string[] | null;
  authorName?: string | null;
  authorRole?: Role | null;
  createTime?: string;
  /** 审核状态 0待审核 1通过 2拒绝 */
  auditStatus?: string;
  /** 审核备注（拒绝理由） */
  auditRemark?: string | null;
  /** 审核时间 */
  auditTime?: string | null;
}

/**
 * 主页聚合数据（GET /profile/me 与 GET /profile/{accountId} 同构）：
 *   account   —— 账号信息（只有 /me 含 email）
 *   profile   —— 老师简历，未填写为 null
 *   postCount —— 该账号的帖子总数
 */
export interface ProfilePayload {
  account: CustomerAccount;
  profile: TeacherProfile | null;
  postCount: number;
}

/** 保存简历的提交体（PUT /customer/profile）—— 只有老师身份可写 */
export interface ProfileBody {
  realName: string;
  gender?: string;
  age?: number;
  city?: string;
  education?: string;
  school?: string;
  major?: string;
  subjectList?: string[];
  grades?: string;
  hourlyRate?: number;
  experienceYears?: number;
  availableTime?: string;
  intro?: string;
  certificates?: string;
  contact?: string;
}

/** 发帖提交体（POST /customer/posts） */
export interface PostBody {
  content: string;
  /** 图片地址数组，后端存库时拼成逗号分隔串 */
  imageList?: string[];
}

/** 帖子分页查询条件 */
export interface PostQuery {
  pageNum?: number;
  pageSize?: number;
}

/** GET /customer/profile/me —— 我的主页数据（含邮箱，只有自己能拿） */
export function getMyProfile() {
  return reqData<ProfilePayload>({ url: url('/profile/me'), method: 'get' });
}

/**
 * PUT /customer/profile —— 保存我的简历（只有老师身份可写）。
 * 成功后返回保存后的 TeacherProfile。
 */
export function saveMyProfile(body: ProfileBody) {
  return reqData<TeacherProfile>({ url: url('/profile'), method: 'put', data: body });
}

/**
 * GET /customer/profile/{accountId} —— 别人的主页（不含邮箱）。
 * accountId 不存在时后端返回 { code:400, msg:'账号不存在' }，
 * 拦截器会抛 CustomerApiError（code 400），调用方据此展示「找不到该账号」。
 */
export function getUserProfile(accountId: number | string) {
  return reqData<ProfilePayload>({ url: url(`/profile/${accountId}`), method: 'get' });
}

/** GET /customer/profile/{accountId}/posts —— 某人发的帖子（分页，时间倒序） */
export function listUserPosts(accountId: number | string, params: PostQuery = {}) {
  return reqPage<UserPost>({ url: url(`/profile/${accountId}/posts`), method: 'get', params });
}

/** GET /customer/posts/mine —— 我发的帖子（分页，时间倒序） */
export function listMyPosts(params: PostQuery = {}) {
  return reqPage<UserPost>({ url: url('/posts/mine'), method: 'get', params });
}

/** GET /customer/posts/plaza —— 广场：所有人审核通过的帖子（分页） */
export function listPlazaPosts(params: PostQuery = {}) {
  return reqPage<UserPost>({ url: url('/posts/plaza'), method: 'get', params });
}

/** POST /customer/posts —— 发帖子 */
export function createPost(body: PostBody) {
  return reqData<UserPost>({ url: url('/posts'), method: 'post', data: body });
}

/** DELETE /customer/posts/{postId} —— 删自己的帖子（别人的帖子后端返回 404） */
export function deletePost(postId: number | string) {
  return reqOk({ url: url(`/posts/${postId}`), method: 'delete' });
}

export default customerHttp;
