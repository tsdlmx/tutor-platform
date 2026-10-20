/** 后端统一响应包装 */
export interface ApiResult<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

/** RuoYi TableDataInfo 分页响应 */
export interface TableDataInfo<T> {
  code: number;
  msg: string;
  total: number;
  rows: T[];
}

/** GET /captchaImage */
export interface CaptchaImage {
  code: number;
  msg?: string;
  img: string;
  uuid: string;
  captchaEnabled: boolean;
}

/** GET /getInfo 返回的登录用户 */
export interface SysUser {
  userId?: number;
  userName?: string;
  nickName?: string;
  email?: string;
  phonenumber?: string;
  sex?: string;
  avatar?: string;
  status?: string;
  deptId?: number;
  dept?: { deptId: number; deptName: string; leader?: string };
  roles?: SysRole[];
  roleIds?: number[];
  postIds?: number[];
  createTime?: string;
  loginIp?: string;
  loginDate?: string;
  remark?: string;
  pwdUpdateDate?: string;
}

export interface LoginInfo {
  user: SysUser;
  roles: string[];
  permissions: string[];
  isDefaultModifyPwd?: boolean;
  isPasswordExpired?: boolean;
}

export interface SysRole {
  roleId?: number;
  roleName?: string;
  roleKey?: string;
  roleSort?: number;
  dataScope?: string;
  menuCheckStrictly?: boolean;
  deptCheckStrictly?: boolean;
  status?: string;
  createTime?: string;
  remark?: string;
  flag?: boolean;
  admin?: boolean;
}

export interface SysMenu {
  menuId?: number;
  menuName?: string;
  parentName?: string;
  parentId?: number;
  orderNum?: number;
  path?: string;
  component?: string;
  query?: string;
  isFrame?: string;
  isCache?: string;
  menuType?: string;
  visible?: string;
  status?: string;
  perms?: string;
  icon?: string;
  createTime?: string;
  children?: SysMenu[];
}

export interface SysDept {
  deptId?: number;
  parentId?: number;
  ancestors?: string;
  deptName?: string;
  orderNum?: number;
  leader?: string;
  phone?: string;
  email?: string;
  status?: string;
  createTime?: string;
  children?: SysDept[];
}

export interface SysPost {
  postId?: number;
  postCode?: string;
  postName?: string;
  postSort?: number;
  status?: string;
  createTime?: string;
  remark?: string;
}

export interface SysDictType {
  dictId?: number;
  dictName?: string;
  dictType?: string;
  status?: string;
  createTime?: string;
  remark?: string;
}

export interface SysDictData {
  dictCode?: number;
  dictSort?: number;
  dictLabel?: string;
  dictValue?: string;
  dictType?: string;
  cssClass?: string;
  listClass?: string;
  isDefault?: string;
  status?: string;
  createTime?: string;
  remark?: string;
}

export interface SysConfig {
  configId?: number;
  configName?: string;
  configKey?: string;
  configValue?: string;
  configType?: string;
  createTime?: string;
  remark?: string;
}

export interface SysNotice {
  noticeId?: number;
  noticeTitle?: string;
  noticeType?: string;
  noticeContent?: string;
  status?: string;
  createBy?: string;
  createTime?: string;
  remark?: string;
}

/** 家教信息 t_tutor_info —— 后端 TTutorInfo */
export interface TutorInfo {
  tutorId?: number;
  tutorNo?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  nativePlace?: string;
  tutorName?: string;
  /** male=男 female=女 */
  gender?: string;
  age?: number;
  phone?: string;
  /** 多张头像，逗号分隔 */
  avatarImages?: string;
  /** retired退休 working在职 student在校生 */
  teacherType?: string;
  crimeRecordCert?: string;
  idCard?: string;
  openid?: string;
  likeCount?: number;
  gradeId?: number;
  gradeName?: string;
  university?: string;
  major?: string;
  subjectIds?: string;
  subjectNames?: string;
  tutorableGradeIds?: string;
  tutorableGradeNames?: string;
  studentRequire?: string;
  /** offline线下 online线上，多个逗号分隔 */
  teachingMode?: string;
  availableTime?: string;
  expectedSalary?: number;
  trialTime?: string;
  middleScore?: number;
  highScore?: number;
  constellation?: string;
  serviceCount?: number;
  avgScore?: number;
  points?: number;
  labHours?: number;
  diyHours?: number;
  acceptMinimalist?: string;
  otherInfo?: string;
  personalProfile?: string;
  status?: string;
  /** 0待审核 1审核通过 2审核拒绝 */
  auditStatus?: string;
  auditTime?: string;
  auditRemark?: string;
  delFlag?: string;
  depositAmount?: number;
  depositTransactionId?: string;
  /** 0未支付 1已支付 2已退款 */
  depositStatus?: string;
  qualification?: TutorQualification;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

export interface TutorQualification {
  qualificationId?: number;
  tutorId?: number;
  teacherCertificate?: string;
  teachingExperience?: string;
  characterIntro?: string;
  honorImages?: string;
  otherAdvantage?: string;
  resumeUrl?: string;
  createTime?: string;
  updateTime?: string;
}

/** 家长信息 t_parent_info */
export interface ParentInfo {
  parentId?: number;
  parentNo?: string;
  parentName?: string;
  avatar?: string;
  gender?: string;
  phone?: string;
  idCard?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  avgScore?: number;
  openid?: string;
  status?: string;
  delFlag?: string;
  depositAmount?: number;
  depositTransactionId?: string;
  depositStatus?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

/** 学员信息 t_student_info */
export interface StudentInfo {
  studentId?: number;
  studentNo?: string;
  parentId?: number;
  parentName?: string;
  studentName?: string;
  gender?: string;
  age?: number;
  gradeId?: number;
  gradeName?: string;
  school?: string;
  academicPerformance?: string;
  constellation?: string;
  otherInfo?: string;
  interestInK12Lab?: string;
  acceptEduInnovation?: string;
  status?: string;
  delFlag?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
  remark?: string;
}

/** 微信用户 t_wx_user */
export interface WxUser {
  userId?: number;
  openid?: string;
  unionid?: string;
  inviterId?: number;
  nickname?: string;
  avatar?: string;
  gender?: number;
  phone?: string;
  userType?: string;
  parentId?: number;
  tutorId?: number;
  parentNo?: string;
  tutorNo?: string;
  status?: string;
  delFlag?: string;
  lastLoginTime?: string;
  points?: number;
  avgRating?: number;
  totalEvaluations?: number;
  createTime?: string;
  updateTime?: string;
  remark?: string;
}

export interface OnlineUser {
  tokenId: string;
  userName: string;
  deptName?: string;
  ipaddr?: string;
  loginLocation?: string;
  browser?: string;
  os?: string;
  loginTime?: number;
}

export interface LoginInfor {
  infoId?: number;
  userName?: string;
  ipaddr?: string;
  loginLocation?: string;
  browser?: string;
  os?: string;
  status?: string;
  msg?: string;
  loginTime?: string;
}

export interface OperLog {
  operId?: number;
  title?: string;
  businessType?: number;
  method?: string;
  requestMethod?: string;
  operatorType?: number;
  operName?: string;
  deptName?: string;
  operUrl?: string;
  operIp?: string;
  operLocation?: string;
  operParam?: string;
  jsonResult?: string;
  status?: number;
  errorMsg?: string;
  operTime?: string;
  costTime?: number;
}

export interface ServerInfo {
  cpu?: { cpuNum: number; total: number; sys: number; used: number; wait: number; free: number };
  mem?: { total: number; used: number; free: number; usage: number };
  jvm?: {
    total: number;
    max: number;
    free: number;
    version: string;
    home: string;
    name: string;
    startTime: string;
    runTime: string;
    usage: number;
    inputArgs: string;
  };
  sys?: {
    computerName: string;
    computerIp: string;
    userDir: string;
    osName: string;
    osArch: string;
  };
  sysFiles?: { dirName: string; sysTypeName: string; typeName: string; total: string; free: string; used: string; usage: number }[];
}

/** 小程序端家教列表（公开接口，注意是 data 而不是 rows） */
export interface MiniappTutorListQuery {
  gradeId?: number | string;
  subject?: string;
  constellation?: string;
  sortBy?: 'distance' | 'score' | '';
  latitude?: number;
  longitude?: number;
}

export interface MiniappLoginState {
  isLogin: boolean;
  userId?: number | null;
}

/** 列表查询通用参数 */
export interface PageQuery {
  pageNum?: number;
  pageSize?: number;
  orderByColumn?: string;
  isAsc?: 'asc' | 'desc' | '';
}

export type TutorQuery = PageQuery &
  Partial<
    Pick<
      TutorInfo,
      'tutorName' | 'tutorNo' | 'phone' | 'city' | 'province' | 'auditStatus' | 'status' | 'subjectNames' | 'gender' | 'teacherType'
    >
  >;

export type ParentQuery = PageQuery &
  Partial<Pick<ParentInfo, 'parentName' | 'parentNo' | 'phone' | 'city' | 'status'>>;

export type StudentQuery = PageQuery &
  Partial<Pick<StudentInfo, 'studentName' | 'studentNo' | 'school' | 'gradeName' | 'status'>>;

export type WxUserQuery = PageQuery &
  Partial<Pick<WxUser, 'nickname' | 'phone' | 'userType' | 'status' | 'openid'>>;

/* ---------------- 客户账号（邮箱注册的老师 / 学生） ---------------- */

/** 客户账号身份 */
export type CustomerRole = 'TEACHER' | 'STUDENT';

/** GET /system/customerAccount/list 的一行 */
export interface CustomerAccountRow {
  accountId?: number;
  email?: string;
  nickname?: string | null;
  role?: CustomerRole | null;
  /** 0 正常，1 停用 */
  status?: string;
  lastLoginTime?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface CustomerAccountQuery {
  role?: CustomerRole;
  email?: string;
  nickname?: string;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}
