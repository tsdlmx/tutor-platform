import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Info, Plus, RotateCcw, Save, X } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { BudgetUnit, ClassMode, DemandBody } from '@/api/customer';
import { cn } from '@/lib/cn';
import { SUBJECT_NAMES } from '@/lib/constants';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  toast,
} from '@/components/ui';
import { PageHeader, SubjectPicker } from '@/components/common';
import { BUDGET_UNIT_OPTIONS, GRADE_OPTIONS } from '@/pages/customer/shared';

/** 表单内部一律用字符串保存，提交时再转数字，避免受控组件出现 NaN */
interface FormState {
  title: string;
  subjectList: string[];
  grade: string;
  budgetMin: string;
  budgetMax: string;
  budgetUnit: BudgetUnit;
  classMode: ClassMode;
  city: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  subjectList: [],
  grade: '',
  budgetMin: '',
  budgetMax: '',
  budgetUnit: 'hour',
  classMode: 'both',
  city: '',
  description: '',
};

const CLASS_MODE_CARDS: { value: ClassMode; label: string; desc: string }[] = [
  { value: 'online', label: '线上', desc: '视频 / 在线授课' },
  { value: 'offline', label: '线下', desc: '上门或到老师处' },
  { value: 'both', label: '都可以', desc: '两种方式都能接受' },
];

/** 表单里的一个区块：卡片 + 标题 + 说明 */
function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/**
 * 发布 / 编辑需求 —— /demands/new 与 /demands/:id/edit 共用。
 * 学生在这里把需求描述清楚：科目（可多选）、年级、预算区间与单位、上课方式、城市、详细描述。
 * 桌面端限宽到 max-w-3xl，避免输入框被拉成整屏宽。
 */
export default function StudentDemandForm() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const demandId = Number(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsFallback, setSubjectsFallback] = useState(false);

  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* 科目字典：接口挂了就用本地常量兜底，不阻断学生发布 */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await customerApi.listSubjects();
        if (!alive) return;
        if (list.length > 0) {
          setSubjectOptions(list);
        } else {
          setSubjectOptions(SUBJECT_NAMES);
          setSubjectsFallback(true);
        }
      } catch {
        if (!alive) return;
        setSubjectOptions(SUBJECT_NAMES);
        setSubjectsFallback(true);
      } finally {
        if (alive) setSubjectsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* 编辑模式：拉取原需求回填 */
  const loadDemand = useCallback(async () => {
    if (!editing) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await customerApi.getDemand(demandId);
      setForm({
        title: data.title ?? '',
        subjectList: Array.isArray(data.subjectList) && data.subjectList.length
          ? data.subjectList
          : (data.subjects ?? '')
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
        grade: data.grade ?? '',
        budgetMin: data.budgetMin != null ? String(data.budgetMin) : '',
        budgetMax: data.budgetMax != null ? String(data.budgetMax) : '',
        budgetUnit: (data.budgetUnit as BudgetUnit) || 'hour',
        classMode: (data.classMode as ClassMode) || 'both',
        city: data.city ?? '',
        description: data.description ?? '',
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '需求详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [demandId, editing]);

  useEffect(() => {
    void loadDemand();
  }, [loadDemand]);

  const selectedCount = form.subjectList.length;
  const canSubmit = useMemo(() => form.title.trim().length > 0 && selectedCount > 0, [form.title, selectedCount]);

  /**
   * 改字段时顺手清掉该字段的报错。
   * 与简历编辑（ResumeEditor）保持一致的即时反馈：改对了红字立刻消失，
   * 不用等下一次点「发布需求」才知道自己已经改好。
   */
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      const k = String(key);
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }

  /** 校验：错误文案尽量具体，别让学生猜哪里填错了 */
  function validate(): boolean {
    const next: Record<string, string> = {};
    const title = form.title.trim();
    if (!title) next.title = '请填写需求标题';
    else if (title.length > 50) next.title = '标题不能超过 50 个字';

    if (form.subjectList.length === 0) next.subjectList = '请至少选择一个科目';

    if (!form.grade) next.grade = '请选择年级';

    const min = form.budgetMin.trim() === '' ? null : Number(form.budgetMin);
    const max = form.budgetMax.trim() === '' ? null : Number(form.budgetMax);

    if (min !== null && (!Number.isFinite(min) || min < 0)) next.budgetMin = '预算下限需为不小于 0 的数字';
    if (max !== null && (!Number.isFinite(max) || max < 0)) next.budgetMax = '预算上限需为不小于 0 的数字';
    if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max < min) {
      next.budgetMax = '预算上限不能小于预算下限';
    }
    if (min === null && max === null) next.budgetMin = '请至少填写预算区间的一端';

    if (!form.description.trim()) next.description = '请填写需求详细描述';
    else if (form.description.trim().length < 5) next.description = '描述太短了，至少 5 个字，方便老师判断';

    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error('请检查表单', { description: Object.values(next)[0] });
      return false;
    }
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !validate()) return;

    const body: DemandBody = {
      title: form.title.trim(),
      subjectList: form.subjectList,
      grade: form.grade || undefined,
      budgetMin: form.budgetMin.trim() === '' ? undefined : Number(form.budgetMin),
      budgetMax: form.budgetMax.trim() === '' ? undefined : Number(form.budgetMax),
      budgetUnit: form.budgetUnit,
      classMode: form.classMode,
      city: form.city.trim() || undefined,
      description: form.description.trim(),
    };

    setSubmitting(true);
    try {
      if (editing) {
        await customerApi.updateDemand(demandId, body);
        toast.success('需求已保存', { description: '修改内容已同步到老师端' });
      } else {
        await customerApi.createDemand(body);
        toast.success('需求已发布', { description: '老师端现在可以看到你的需求了' });
      }
      navigate('/demands/mine', { replace: true });
    } catch (err) {
      toast.error(editing ? '保存失败' : '发布失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (editing && !Number.isFinite(demandId)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Card>
          <ErrorState message="需求编号不正确，请从列表页重新进入" />
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader title="编辑需求" description="正在加载需求详情…" back />
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-2/3" />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader title="编辑需求" description="加载失败" back />
        <Card>
          <ErrorState message={loadError} onRetry={() => void loadDemand()} />
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-4" noValidate>
      <PageHeader
        title={editing ? '编辑需求' : '发布需求'}
        description={editing ? '修改后会同步给老师端' : '把需求写清楚，老师更容易找到你'}
        back
      >
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/demands/mine">
            <X className="h-3.5 w-3.5" />
            取消返回
          </Link>
        </Button>
      </PageHeader>

      {/* 基本信息 */}
      <SectionCard
        title="基本信息"
        description="标题会直接展示在老师的需求列表里，越具体越容易被匹配"
      >
        <Field label="需求标题" htmlFor="title" error={errors.title} required>
          <Input
            id="title"
            value={form.title}
            maxLength={60}
            placeholder="例如：初二数学物理同步辅导，每周两次"
            invalid={Boolean(errors.title)}
            onChange={(e) => setField('title', e.target.value)}
          />
        </Field>

        <Field label="所在城市" htmlFor="city" hint="方便老师判断通勤距离，线上授课可留空">
          <Input
            id="city"
            value={form.city}
            placeholder="例如：杭州"
            onChange={(e) => setField('city', e.target.value)}
          />
        </Field>
      </SectionCard>

      {/* 科目与年级 */}
      <SectionCard title="科目与年级" description="科目可以多选，年级用于老师按学段查找">
        <Field
          label={`科目${selectedCount > 0 ? ` · 已选 ${selectedCount} 个` : ''}`}
          error={errors.subjectList}
          required
          hint={
            subjectsFallback
              ? '科目字典接口暂不可用，已使用本地内置科目'
              : '可以同时选择多个科目'
          }
        >
          <SubjectPicker
            value={form.subjectList}
            options={subjectOptions}
            loading={subjectsLoading}
            onChange={(subjectList) => setField('subjectList', subjectList)}
          />
        </Field>

        <Field label="年级" htmlFor="grade" error={errors.grade} required>
          <Select
            id="grade"
            value={form.grade}
            placeholder="请选择年级"
            options={GRADE_OPTIONS}
            onChange={(e) => setField('grade', e.target.value)}
          />
        </Field>
      </SectionCard>

      {/* 预算与上课方式 */}
      <SectionCard title="预算与上课方式" description="预算区间用于老师判断是否匹配，后续仍可修改">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="预算下限" htmlFor="budgetMin" error={errors.budgetMin}>
            <Input
              id="budgetMin"
              type="number"
              min={0}
              inputMode="decimal"
              value={form.budgetMin}
              invalid={Boolean(errors.budgetMin)}
              onChange={(e) => setField('budgetMin', e.target.value)}
            />
          </Field>
          <Field label="预算上限" htmlFor="budgetMax" error={errors.budgetMax}>
            <Input
              id="budgetMax"
              type="number"
              min={0}
              inputMode="decimal"
              value={form.budgetMax}
              invalid={Boolean(errors.budgetMax)}
              onChange={(e) => setField('budgetMax', e.target.value)}
            />
          </Field>
          <Field label="计价单位" htmlFor="budgetUnit">
            <Select
              id="budgetUnit"
              value={form.budgetUnit}
              options={BUDGET_UNIT_OPTIONS}
              onChange={(e) => setField('budgetUnit', e.target.value as BudgetUnit)}
            />
          </Field>
        </div>

        <Field label="上课方式" error={errors.classMode}>
          <div className="grid gap-2 sm:grid-cols-3">
            {CLASS_MODE_CARDS.map((c) => {
              const active = form.classMode === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setField('classMode', c.value)}
                  className={cn(
                    'flex min-h-[56px] flex-col items-start justify-center rounded-lg border px-3.5 py-2 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/[0.08] text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-ring/50',
                  )}
                >
                  <span className={cn('text-xs', active && 'font-medium text-primary')}>{c.label}</span>
                  <span className="text-2xs text-muted-foreground">{c.desc}</span>
                </button>
              );
            })}
          </div>
        </Field>
      </SectionCard>

      {/* 详细说明 */}
      <SectionCard
        title="详细说明"
        description="当前基础、期望的上课频率、时间安排、是否需要上门等"
      >
        <Field label="需求描述" htmlFor="description" error={errors.description} required>
          <Textarea
            id="description"
            value={form.description}
            className="min-h-[160px]"
            maxLength={1000}
            placeholder="例如：初二学生，数学物理基础较弱，希望每周两次课，周六下午和周日晚上可以，需要上门。"
            invalid={Boolean(errors.description)}
            onChange={(e) => setField('description', e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between gap-3 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            描述越具体，越容易被合适的老师接单
          </span>
          <span className="tabular">{form.description.length}/1000</span>
        </div>
      </SectionCard>

      {/* 提交栏：移动端要避开底部导航（64px + 安全区）再留一点余量 */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 md:bottom-3">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={canSubmit ? 'success' : 'muted'} dot>
              {canSubmit ? '信息已填写完整' : '标题与科目为必填'}
            </Badge>
            <span className="text-2xs text-muted-foreground">
              {editing ? '修改后立即同步到老师端' : '发布后可在「我的需求」里随时修改或取消'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setErrors({});
                if (editing) void loadDemand();
                else setForm(EMPTY_FORM);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </Button>
            <Button type="submit" loading={submitting}>
              {editing ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {submitting ? '提交中…' : editing ? '保存修改' : '发布需求'}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
