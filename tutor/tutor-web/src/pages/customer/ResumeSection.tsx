import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Pencil, Plus } from 'lucide-react';
import type { Role, TeacherProfile } from '@/api/customer';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { ResumeReadonly } from '@/pages/customer/shared';
import { ResumeEditor } from '@/pages/customer/ResumeEditor';

export interface ResumeSectionProps {
  /** 当前简历（null = 没填过） */
  profile: TeacherProfile | null;
  /** 当前身份：只有 TEACHER 能编辑（后端也只允许老师写） */
  role: Role | null;
  /** 主页聚合数据加载中 */
  loading: boolean;
  /** 主页聚合数据的错误文案 */
  error: string | null;
  onRetry: () => void;
  /** 保存成功：把后端回传的简历交给页面刷新数据与公开主页预览 */
  onSaved: (saved: TeacherProfile) => void;
}

/**
 * 「我的资料」区块：简历只读态 ⇄ 编辑态。
 *
 * 编辑态放在组件内部（而不是页面上），因为这块是「一个自洽的小流程」：
 * 进入编辑 → 填 → 保存 / 取消。
 */
export function ResumeSection({
  profile,
  role,
  loading,
  error,
  onRetry,
  onSaved,
}: ResumeSectionProps) {
  const [editing, setEditing] = useState(false);
  const isTeacher = role === 'TEACHER';

  function handleSaved(saved: TeacherProfile) {
    setEditing(false);
    onSaved(saved);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            {editing ? '编辑个人简历' : '个人简历'}
          </CardTitle>
          <CardDescription>
            {isTeacher
              ? '简历会展示在你的公开主页上，学生和家长都能看到'
              : '简历只有老师身份可以填写'}
          </CardDescription>
        </div>
        {isTeacher && !editing && profile ? (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {!isTeacher ? (
          <Empty
            title="简历只有老师身份可以填写"
            description={
              role === 'STUDENT'
                ? '当前身份是学生，简历只有老师身份可以填写。'
                : '简历只有老师身份可以填写，先选择「老师」身份吧。'
            }
            icon={<FileText className="h-5 w-5" />}
            action={
              role ? null : (
                <Button size="sm" asChild>
                  <Link to="/choose-role">去选择身份</Link>
                </Button>
              )
            }
          />
        ) : loading && !profile ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : editing ? (
          <ResumeEditor
            profile={profile}
            onSaved={handleSaved}
            onCancel={() => setEditing(false)}
          />
        ) : profile ? (
          <ResumeReadonly profile={profile} />
        ) : (
          <Empty
            title="还没有填写简历"
            description="填写后老师主页会展示可授科目、教龄与自我介绍，学生和家长更容易找到你。"
            icon={<FileText className="h-5 w-5" />}
            action={
              <Button size="sm" onClick={() => setEditing(true)}>
                <Plus className="h-3.5 w-3.5" />
                去填写
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

export default ResumeSection;
