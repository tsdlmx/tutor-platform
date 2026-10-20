import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';

export interface SubjectPickerProps {
  /** 已选科目（受控） */
  value: string[];
  /** 选中集合变化：返回**新的数组**，不修改原数组 */
  onChange: (next: string[]) => void;
  /** 全部备选科目（后端字典，或本地兜底常量） */
  options: string[];
  /** 字典加载中：先渲染骨架，避免按钮先空后闪 */
  loading?: boolean;
  /**
   * 把 value 里 options 没有的科目也渲染出来。
   * 简历场景需要：字典改过之后，历史科目仍要能看见、能取消；
   * 需求单场景用不到（选项就是字典本身），保持默认 true 也无副作用。
   */
  mergeSelected?: boolean;
  disabled?: boolean;
  /** 清空按钮文案；传 null 则不显示清空入口 */
  clearLabel?: string | null;
  className?: string;
}

/**
 * 科目多选 chip —— 「我的简历」与「发布需求」共用的一份 UI。
 *
 * 两个页面原来各自手写了一遍 chip + 「清空选择」，样式与交互（aria-pressed、
 * 最小点按高度）容易各自漂移；抽成一个受控组件后，多选逻辑只有一份。
 */
export function SubjectPicker({
  value,
  onChange,
  options,
  loading = false,
  mergeSelected = true,
  disabled = false,
  clearLabel = '清空选择',
  className,
}: SubjectPickerProps) {
  const choices = useMemo(
    () => (mergeSelected ? Array.from(new Set([...options, ...value])) : options),
    [mergeSelected, options, value],
  );

  if (loading) {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
    );
  }

  function toggle(name: string) {
    if (disabled) return;
    onChange(value.includes(name) ? value.filter((s) => s !== name) : [...value, name]);
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {choices.map((s) => {
        const active = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => toggle(s)}
            className={cn(
              'min-h-[36px] rounded-full border px-3.5 text-xs transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-primary bg-primary/[0.1] font-medium text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-ring/50 hover:text-foreground',
            )}
          >
            {s}
          </button>
        );
      })}

      {value.length > 0 && clearLabel ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="min-h-[36px] rounded-full px-3 text-2xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

export default SubjectPicker;
