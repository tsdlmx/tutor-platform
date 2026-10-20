import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  CheckCheck,
  CircleSlash,
  Eye,
  GraduationCap,
  Phone,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import * as tutorApi from '@/api/tutor';
import {
  AUDIT_STATUS,
  GENDER,
  SUBJECTS,
  TEACHER_TYPE,
  auditLabel,
  auditTone,
  emptyText,
  firstImage,
  formatDateTime,
  genderLabel,
  maskIdCard,
  splitList,
  stripHtml,
  teacherTypeLabel,
  teachingModeLabel,
  tutorDisplayName,
  tutorLocation,
} from '@/lib/constants';
import type { TutorInfo } from '@/types/api';
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@/components/ui';
import { DataTable, DetailDrawer, FilterBar, PageHeader, type DataColumn } from '@/components/common';
import { DeleteButton } from '@/components/rare';
import { usePagedList } from '@/hooks/usePagedList';

const AUDIT_TABS = [
  { value: 'all', label: '全部' },
  { value: '0', label: '待审核' },
  { value: '1', label: '已通过' },
  { value: '2', label: '已拒绝' },
];

interface FilterState {
  tutorName: string;
  phone: string;
  city: string;
  subjectNames: string;
  teacherType: string;
}

const EMPTY_FILTERS: FilterState = { tutorName: '', phone: '', city: '', subjectNames: '', teacherType: '' };

export default function TutorList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAudit = searchParams.get('auditStatus') ?? 'all';
  const initialTutorId = searchParams.get('tutorId');

  const [auditTab, setAuditTab] = useState(initialAudit);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [detailId, setDetailId] = useState<number | null>(initialTutorId ? Number(initialTutorId) : null);
  const [detail, setDetail] = useState<TutorInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [remark, setRemark] = useState('');
  const [auditing, setAuditing] = useState(false);
  const openedOnce = useRef(false);

  const list = usePagedList<TutorInfo>(
    (query) => tutorApi.listTutor(query),
    { pageSize: 10, initialFilters: initialAudit !== 'all' ? { auditStatus: initialAudit } : {} },
  );

  /* 深链：?auditStatus=0 / ?tutorId=123 */
  useEffect(() => {
    if (initialTutorId && !openedOnce.current) {
      openedOnce.current = true;
      setDetailId(Number(initialTutorId));
    }
  }, [initialTutorId]);

  /* 详情抽屉数据（列表行数据先顶上，再拉全量详情） */
  useEffect(() => {
    if (detailId === null || Number.isNaN(detailId)) return;
    let alive = true;
    setDetailLoading(true);
    tutorApi
      .getTutor(detailId)
      .then((d) => {
        if (alive) setDetail(d ?? null);
      })
      .catch((e: unknown) => {
        if (alive) toast.error('详情加载失败', { description: e instanceof Error ? e.message : '' });
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [detailId]);

  const applyFilters = useCallback(
    (next: FilterState, audit = auditTab) => {
      const merged: Record<string, unknown> = { ...next };
      if (audit !== 'all') merged.auditStatus = audit;
      list.search(merged);
    },
    [auditTab, list],
  );

  function onSearch() {
    applyFilters(draft);
  }

  function onReset() {
    setDraft(EMPTY_FILTERS);
    list.search(auditTab === 'all' ? {} : { auditStatus: auditTab });
  }

  function onAuditTabChange(v: string) {
    setAuditTab(v);
    applyFilters(draft, v);
    const next = new URLSearchParams(searchParams);
    if (v === 'all') next.delete('auditStatus');
    else next.set('auditStatus', v);
    setSearchParams(next, { replace: true });
  }

  const current = useMemo(
    () => detail ?? list.rows.find((r) => r.tutorId === detailId) ?? null,
    [detail, detailId, list.rows],
  );

  async function doAudit(t: TutorInfo | null, status: '1' | '2', auditRemark?: string) {
    if (!t?.tutorId) {
      toast.error('缺少 tutorId，无法审核');
      return;
    }
    setAuditing(true);
    try {
      const msg = await tutorApi.auditTutor({
        tutorId: t.tutorId,
        auditStatus: status,
        auditRemark: auditRemark ?? (status === '1' ? '资质符合平台要求，审核通过' : '资质不符合平台要求'),
      });
      toast.success(status === '1' ? '已审核通过' : '已审核拒绝', { description: msg });
      setRejecting(false);
      setRemark('');
      list.reload();
      if (detailId === t.tutorId) {
        try {
          setDetail(await tutorApi.getTutor(t.tutorId));
        } catch {
          /* 详情刷新失败不阻塞主流程 */
        }
      }
    } catch (e) {
      toast.error('审核失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setAuditing(false);
    }
  }

  async function doDelete(t: TutorInfo) {
    if (!t.tutorId) return;
    try {
      const msg = await tutorApi.deleteTutor(t.tutorId);
      toast.success('已删除', { description: msg });
      list.reload();
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  }

  const columns: DataColumn<TutorInfo>[] = [
    {
      key: 'tutorName',
      title: '家教',
      width: '210px',
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <Avatar src={firstImage(t.avatarImages)} name={tutorDisplayName(t)} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{tutorDisplayName(t)}</p>
            <p className="truncate text-2xs text-muted-foreground">
              {t.tutorNo ?? '—'} · {genderLabel(t.gender)}
              {t.age ? ` · ${t.age}岁` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'university',
      title: '院校 / 专业',
      width: '180px',
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-xs">{emptyText(t.university)}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {emptyText(t.major)} · {teacherTypeLabel(t.teacherType)}
          </p>
        </div>
      ),
    },
    {
      key: 'subjectNames',
      title: '可授科目',
      width: '190px',
      render: (t) => {
        const list0 = splitList(t.subjectNames);
        return list0.length === 0 ? (
          <span className="text-2xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {list0.slice(0, 3).map((s) => (
              <Badge key={s} tone="outline">
                {s}
              </Badge>
            ))}
            {list0.length > 3 ? <Badge tone="muted">+{list0.length - 3}</Badge> : null}
          </div>
        );
      },
    },
    {
      key: 'city',
      title: '所在地',
      width: '150px',
      render: (t) => <span className="text-xs">{tutorLocation(t)}</span>,
    },
    {
      key: 'expectedSalary',
      title: '期望薪资',
      width: '100px',
      align: 'right',
      render: (t) =>
        t.expectedSalary ? (
          <span className="tabular text-xs">
            ¥{t.expectedSalary}
            <span className="text-2xs text-muted-foreground">/时</span>
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'avgScore',
      title: '评分',
      width: '86px',
      align: 'right',
      render: (t) =>
        typeof t.avgScore === 'number' ? (
          <span className="tabular text-xs">{t.avgScore.toFixed(1)}</span>
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'auditStatus',
      title: '审核状态',
      width: '110px',
      render: (t) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={auditTone(t.auditStatus)} dot>
            {auditLabel(t.auditStatus)}
          </Badge>
          {t.auditTime ? <span className="text-2xs text-muted-foreground">{String(t.auditTime).slice(5, 16)}</span> : null}
        </div>
      ),
    },
    {
      key: 'createTime',
      title: '创建时间',
      width: '140px',
      render: (t) => <span className="text-2xs text-muted-foreground">{formatDateTime(t.createTime)}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      width: '230px',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1">
          {t.auditStatus !== '1' ? (
            <Button size="sm" variant="success" disabled={auditing} onClick={() => void doAudit(t, '1')}>
              <CheckCheck className="h-3.5 w-3.5" />
              通过
            </Button>
          ) : null}
          {t.auditStatus !== '2' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={auditing}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              // 与抽屉里的「审核拒绝」走同一条路径：打开详情、填完拒绝原因再提交。
              // 原来这里直接带一句固定备注落库，列表上误点一次就把老师拒了，且没有确认。
              onClick={() => {
                setDetailId(t.tutorId ?? null);
                setRejecting(true);
              }}
            >
              <XCircle className="h-3.5 w-3.5" />
              拒绝
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setDetailId(t.tutorId ?? null)}>
            <Eye className="h-3.5 w-3.5" />
            详情
          </Button>
          <DeleteButton onConfirm={() => doDelete(t)} />
        </div>
      ),
    },
  ];

  const detailFooter = current ? (
    rejecting ? (
      <div className="flex w-full flex-col gap-2">
        <Field label="拒绝原因（会写入 auditRemark）" required>
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="例如：教师资格证明缺失，请补充后重新提交"
            className="min-h-[64px]"
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={auditing}>
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            loading={auditing}
            disabled={!remark.trim()}
            onClick={() => void doAudit(current, '2', remark.trim())}
          >
            <CircleSlash className="h-3.5 w-3.5" />
            确认拒绝
          </Button>
        </div>
      </div>
    ) : (
      <>
        <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
          关闭
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setRejecting(true)}
          disabled={auditing}
        >
          <XCircle className="h-3.5 w-3.5" />
          审核拒绝
        </Button>
        <Button variant="success" size="sm" loading={auditing} onClick={() => void doAudit(current, '1')}>
          <CheckCheck className="h-3.5 w-3.5" />
          审核通过
        </Button>
      </>
    )
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="家教档案与审核"
        description="家教档案查询与资质审核，通过 / 拒绝会写入审核备注并留痕"
        className="[&_h1]:text-base"
      >
        <Badge tone="muted" className="hidden sm:inline-flex">
          <GraduationCap className="h-3 w-3" />
          共 {list.total} 条
        </Badge>
        <Button variant="outline" size="sm" onClick={list.reload} disabled={list.loading}>
          <RefreshCw className={list.loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      <FilterBar onSubmit={onSearch} onReset={onReset} loading={list.loading}>
        <Field label="姓名 / 编号">
          <Input
            placeholder="支持模糊搜索"
            value={draft.tutorName}
            onChange={(e) => setDraft((d) => ({ ...d, tutorName: e.target.value }))}
          />
        </Field>
        <Field label="手机号">
          <Input
            placeholder="如 13800000000"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          />
        </Field>
        <Field label="城市">
          <Input placeholder="如 无锡" value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
        </Field>
        <Field label="可授科目">
          <Select
            value={draft.subjectNames}
            placeholder="全部科目"
            onChange={(e) => setDraft((d) => ({ ...d, subjectNames: e.target.value }))}
            options={SUBJECTS.map((s) => ({ label: s.name, value: s.name }))}
          />
        </Field>
        <Field label="教师类型">
          <Select
            value={draft.teacherType}
            placeholder="全部类型"
            onChange={(e) => setDraft((d) => ({ ...d, teacherType: e.target.value }))}
            options={Object.entries(TEACHER_TYPE).map(([value, label]) => ({ label, value }))}
          />
        </Field>
      </FilterBar>

      <Tabs value={auditTab} onValueChange={onAuditTabChange}>
        <TabsList>
          {AUDIT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {t.value !== 'all' && AUDIT_STATUS[t.value] ? (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={list.rows}
        rowKey={(t, i) => t.tutorId ?? `row-${i}`}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(t) => setDetailId(t.tutorId ?? null)}
        headerTitle={`家教档案（${list.total} 条）`}
        emptyTitle="没有符合条件的家教档案"
        emptyDescription="试试放宽筛选条件，或切换到「全部」标签"
        pageNum={list.pageNum}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPageNum}
        onPageSizeChange={list.setPageSize}
        className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4"
      />

      <DetailDrawer
        open={detailId !== null && !Number.isNaN(detailId)}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null);
            setRejecting(false);
            setRemark('');
          }
        }}
        title={current ? tutorDisplayName(current) : '家教详情'}
        description={current ? `${current.tutorNo ?? '—'} · ${auditLabel(current.auditStatus)}` : undefined}
        loading={detailLoading && !current}
        footer={detailFooter}
        sections={
          current
            ? [
                {
                  title: '基本信息',
                  fields: [
                    { label: '家教姓名', value: current.tutorName },
                    { label: '性别 / 年龄', value: `${genderLabel(current.gender)} · ${current.age ?? '—'}岁` },
                    { label: '手机号', value: current.phone, copyable: true },
                    { label: '身份证号', value: maskIdCard(current.idCard), copyable: Boolean(current.idCard) },
                    { label: '所在地', value: tutorLocation(current) },
                    { label: '详细地址', value: current.address },
                    { label: '籍贯', value: current.nativePlace },
                    { label: '星座', value: current.constellation },
                  ],
                },
                {
                  title: '教学信息',
                  fields: [
                    { label: '教师类型', value: teacherTypeLabel(current.teacherType) },
                    { label: '毕业/就读院校', value: current.university },
                    { label: '专业', value: current.major },
                    { label: '可授科目', value: splitList(current.subjectNames).join(' / ') },
                    { label: '可授年级', value: splitList(current.tutorableGradeNames).join(' / ') || current.gradeName },
                    { label: '授课方式', value: teachingModeLabel(current.teachingMode) },
                    { label: '可授课时间', value: current.availableTime },
                    { label: '期望薪资', value: current.expectedSalary ? `¥${current.expectedSalary}/时` : undefined },
                    { label: '试课时长', value: current.trialTime },
                    { label: '中考 / 高考成绩', value: `${current.middleScore ?? '—'} / ${current.highScore ?? '—'}` },
                  ],
                },
                {
                  title: '资质与自我描述',
                  fields: [
                    { label: '无犯罪记录证明', value: current.crimeRecordCert },
                    { label: '教师资格证', value: current.qualification?.teacherCertificate },
                    { label: '教学经历', value: stripHtml(current.qualification?.teachingExperience, 200) },
                    { label: '性格介绍', value: stripHtml(current.qualification?.characterIntro, 200) },
                    { label: '其他优势', value: stripHtml(current.qualification?.otherAdvantage, 200), span: 2 },
                    {
                      label: '个人简介',
                      value: stripHtml(current.personalProfile, 260),
                      span: 2,
                    },
                    { label: '学员要求', value: stripHtml(current.studentRequire, 200), span: 2 },
                    { label: '其他信息', value: stripHtml(current.otherInfo, 200), span: 2 },
                  ],
                },
                {
                  title: '审核与统计',
                  fields: [
                    {
                      label: '审核状态',
                      value: <Badge tone={auditTone(current.auditStatus)}>{auditLabel(current.auditStatus)}</Badge>,
                    },
                    { label: '审核时间', value: formatDateTime(current.auditTime) },
                    { label: '审核备注', value: current.auditRemark, span: 2 },
                    { label: '服务次数', value: current.serviceCount },
                    { label: '平均评分', value: typeof current.avgScore === 'number' ? current.avgScore.toFixed(1) : undefined },
                    { label: '积分', value: current.points },
                    { label: '点赞数', value: current.likeCount },
                    { label: '提交时间', value: formatDateTime(current.createTime) },
                    { label: '更新时间', value: formatDateTime(current.updateTime) },
                  ],
                },
              ]
            : []
        }
      >
        {current ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
            <Avatar size="xl" src={firstImage(current.avatarImages)} name={tutorDisplayName(current)} rounded="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{tutorDisplayName(current)}</p>
              <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                {[current.university, current.major, teacherTypeLabel(current.teacherType)].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={auditTone(current.auditStatus)} dot>
                  {auditLabel(current.auditStatus)}
                </Badge>
                {current.gender ? <Badge tone="muted">{GENDER[current.gender] ?? current.gender}</Badge> : null}
                {current.phone ? (
                  <a
                    href={`tel:${current.phone}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs transition-colors hover:bg-muted"
                  >
                    <Phone className="h-3 w-3" />
                    {current.phone}
                  </a>
                ) : null}
                {current.auditStatus === '1' ? (
                  <Badge tone="success">
                    <BadgeCheck className="h-3 w-3" />
                    已认证
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
