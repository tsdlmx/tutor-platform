import { useCallback, useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { ProfileBody, TeacherProfile } from '@/api/customer';
import { cn } from '@/lib/cn';
import { SUBJECT_NAMES } from '@/lib/constants';
import { Button, Field, Input, Select, Textarea, toast } from '@/components/ui';
import { SubjectPicker } from '@/components/common';
import { EDUCATION_OPTIONS, GENDER_OPTIONS, profileSubjects } from '@/pages/customer/shared';

/** 自我介绍上限（与后端契约一致） */
const INTRO_MAX = 1000;

/**
 * 简历表单内部一律用字符串，提交时再转数字 —— 受控输入框里放 number
 * 会让人删到只剩空串时冒出 NaN。
 */
export interface ResumeFormState {
  realName: string;
  gender: string;
  age: string;
  city: string;
  education: string;
  school: string;
  major: string;
  subjectList: string[];
  grades: string;
  hourlyRate: string;
  experienceYears: string;
  availableTime: string;
  intro: string;
  certificates: string;
  contact: string;
}

export const EMPTY_RESUME: ResumeFormState = {
  realName: '',
  gender: '1',
  age: '',
  city: '',
  education: '',
  school: '',
  major: '',
  subjectList: [],
  grades: '',
  hourlyRate: '',
  experienceYears: '',
  availableTime: '',
  intro: '',
  certificates: '',
  contact: '',
};

/** 已有简历 → 表单初值 */
export function resumeFormFrom(profile: TeacherProfile | null): ResumeFormState {
  if (!profile) return EMPTY_RESUME;
  return {
    realName: profile.realName ?? '',
    gender:
      profile.gender !== null && profile.gender !== undefined && String(profile.gender) !== ''
        ? String(profile.gender)
        : '1',
    age: profile.age !== null && profile.age !== undefined ? String(profile.age) : '',
    city: profile.city ?? '',
    education: profile.education ?? '',
    school: profile.school ?? '',
    major: profile.major ?? '',
    subjectList: profileSubjects(profile),
    grades: profile.grades ?? '',
    hourlyRate:
      profile.hourlyRate !== null && profile.hourlyRate !== undefined ? String(profile.hourlyRate) : '',
    experienceYears:
      profile.experienceYears !== null && profile.experienceYears !== undefined
        ? String(profile.experienceYears)
        : '',
    availableTime: profile.availableTime ?? '',
    intro: profile.intro ?? '',
    certificates: profile.certificates ?? '',
    contact: profile.contact ?? '',
  };
}

export interface ResumeEditorProps {
  /** 进入编辑态时的现有简历（null = 首次填写） */
  profile: TeacherProfile | null;
  /** 保存成功：把后端回传（或兜底）的简历交给上层刷新只读态 */
  onSaved: (saved: TeacherProfile) => void;
  /** 取消编辑 */
  onCancel: () => void;
}

/**
 * 简历编辑表单（PUT /customer/profile，只有老师身份可写）。
 *
 * 从 Profile.tsx 里整块搬出来的：表单很长、校验规则也只有这里用，
 * 混在工作台页面里会把「页面布局」和「表单逻辑」搅在一起。
 * 科目字典在这里自己拉（接口挂了就用本地常量兜底），上层不用关心。
 */
export function ResumeEditor({ profile, onSaved, onCancel }: ResumeEditorProps) {
  const [form, setForm] = useState<ResumeFormState>(() => resumeFormFrom(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /* 科目字典（可授科目多选） */
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsFallback, setSubjectsFallback] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await customerApi.listSubjects();
        if (!alive) return;
        if (list.length > 0) setSubjectOptions(list);
        else {
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

  const patch = useCallback((next: Partial<ResumeFormState>) => {
    setForm((f) => ({ ...f, ...next }));
  }, []);

  function clearError(key: string) {
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    const realName = form.realName.trim();
    if (!realName) next.realName = '请填写真实姓名';
    else if (realName.length > 20) next.realName = '姓名不能超过 20 个字';

    const age = form.age.trim() === '' ? null : Number(form.age);
    if (age !== null && (!Number.isInteger(age) || age <= 0 || age > 120)) {
      next.age = '年龄需为 1-120 之间的整数';
    }

    const rate = form.hourlyRate.trim() === '' ? null : Number(form.hourlyRate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      next.hourlyRate = '期望时薪需为不小于 0 的数字';
    }

    const years = form.experienceYears.trim() === '' ? null : Number(form.experienceYears);
    if (years !== null && (!Number.isFinite(years) || years < 0 || years > 60)) {
      next.experienceYears = '教龄需为 0-60 之间的数字';
    }

    if (form.intro.length > INTRO_MAX) next.intro = `自我介绍不能超过 ${INTRO_MAX} 字`;

    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error('请检查简历内容', { description: Object.values(next)[0] });
      return false;
    }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !validate()) return;

    const body: ProfileBody = {
      realName: form.realName.trim(),
      gender: form.gender || undefined,
      age: form.age.trim() === '' ? undefined : Number(form.age),
      city: form.city.trim() || undefined,
      education: form.education || undefined,
      school: form.school.trim() || undefined,
      major: form.major.trim() || undefined,
      subjectList: form.subjectList,
      grades: form.grades.trim() || undefined,
      hourlyRate: form.hourlyRate.trim() === '' ? undefined : Number(form.hourlyRate),
      experienceYears: form.experienceYears.trim() === '' ? undefined : Number(form.experienceYears),
      availableTime: form.availableTime.trim() || undefined,
      intro: form.intro.trim() || undefined,
      certificates: form.certificates.trim() || undefined,
      contact: form.contact.trim() || undefined,
    };

    setSaving(true);
    try {
      const saved = await customerApi.saveMyProfile(body);
      toast.success('简历已保存', { description: '你的公开主页已经同步更新' });
      // 后端正常会回传保存后的简历；万一 data 为空，就用提交体兜底，
      // 保证页面立刻能回到只读态而不是空白。
      onSaved(
        saved ?? { ...body, subjects: form.subjectList.join(','), subjectList: form.subjectList },
      );
    } catch (err) {
      toast.error('保存失败', { description: err instanceof Error ? err.message : '请稍后重试' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {/* 基本信息 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="真实姓名" htmlFor="realName" error={errors.realName} required>
          <Input
            id="realName"
            value={form.realName}
            maxLength={30}
            placeholder="用于展示在主页上的称呼"
            invalid={Boolean(errors.realName)}
            onChange={(e) => {
              clearError('realName');
              patch({ realName: e.target.value });
            }}
          />
        </Field>
        <Field label="性别" htmlFor="gender">
          <Select
            id="gender"
            value={form.gender}
            options={GENDER_OPTIONS}
            onChange={(e) => patch({ gender: e.target.value })}
          />
        </Field>
        <Field label="年龄" htmlFor="age" error={errors.age}>
          <Input
            id="age"
            type="number"
            min={1}
            max={120}
            inputMode="numeric"
            value={form.age}
            invalid={Boolean(errors.age)}
            onChange={(e) => {
              clearError('age');
              patch({ age: e.target.value });
            }}
          />
        </Field>
        <Field label="所在城市" htmlFor="city">
          <Input id="city" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
        </Field>
        <Field label="学历" htmlFor="education">
          <Select
            id="education"
            value={form.education}
            placeholder="请选择学历"
            options={EDUCATION_OPTIONS}
            onChange={(e) => patch({ education: e.target.value })}
          />
        </Field>
        <Field label="毕业院校" htmlFor="school">
          <Input id="school" value={form.school} onChange={(e) => patch({ school: e.target.value })} />
        </Field>
        <Field label="专业" htmlFor="major">
          <Input id="major" value={form.major} onChange={(e) => patch({ major: e.target.value })} />
        </Field>
        <Field label="期望时薪（元 / 小时）" htmlFor="hourlyRate" error={errors.hourlyRate}>
          <Input
            id="hourlyRate"
            type="number"
            min={0}
            inputMode="decimal"
            value={form.hourlyRate}
            invalid={Boolean(errors.hourlyRate)}
            onChange={(e) => {
              clearError('hourlyRate');
              patch({ hourlyRate: e.target.value });
            }}
          />
        </Field>
        <Field label="教龄（年）" htmlFor="experienceYears" error={errors.experienceYears}>
          <Input
            id="experienceYears"
            type="number"
            min={0}
            max={60}
            inputMode="numeric"
            value={form.experienceYears}
            invalid={Boolean(errors.experienceYears)}
            onChange={(e) => {
              clearError('experienceYears');
              patch({ experienceYears: e.target.value });
            }}
          />
        </Field>
      </div>

      {/* 可授科目（多选） */}
      <Field
        label={`可授科目（可多选）${form.subjectList.length > 0 ? ` · 已选 ${form.subjectList.length} 个` : ''}`}
        hint={subjectsFallback ? '科目字典接口暂不可用，已使用本地内置科目' : '可以同时选择多个科目'}
      >
        <SubjectPicker
          value={form.subjectList}
          options={subjectOptions}
          loading={subjectsLoading}
          onChange={(subjectList) => patch({ subjectList })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="可授年级" htmlFor="grades" hint="多个年级用逗号分隔">
          <Input
            id="grades"
            value={form.grades}
            placeholder="初一,初二,初三"
            onChange={(e) => patch({ grades: e.target.value })}
          />
        </Field>
        <Field label="可授课时间" htmlFor="availableTime">
          <Input
            id="availableTime"
            value={form.availableTime}
            onChange={(e) => patch({ availableTime: e.target.value })}
          />
        </Field>
      </div>

      <Field label="自我介绍" htmlFor="intro" error={errors.intro}>
        <Textarea
          id="intro"
          value={form.intro}
          className="min-h-[120px]"
          placeholder="教学风格、擅长的模块、带过的学生情况…"
          invalid={Boolean(errors.intro)}
          onChange={(e) => {
            clearError('intro');
            patch({ intro: e.target.value });
          }}
        />
      </Field>
      <div className="-mt-2 flex items-center justify-end text-2xs text-muted-foreground">
        <span className={cn('tabular', form.intro.length > INTRO_MAX && 'text-destructive')}>
          {form.intro.length}/{INTRO_MAX}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="证书荣誉" htmlFor="certificates">
          <Input
            id="certificates"
            value={form.certificates}
            onChange={(e) => patch({ certificates: e.target.value })}
          />
        </Field>
        <Field label="联系方式" htmlFor="contact" hint="会公开展示">
          <Input
            id="contact"
            value={form.contact}
            onChange={(e) => patch({ contact: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
        <span className="text-2xs text-muted-foreground">真实姓名为必填，其余可以稍后再补</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5" />
            取消
          </Button>
          <Button type="submit" loading={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中…' : '保存简历'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export default ResumeEditor;
