import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { ProfilePayload, TeacherProfile } from '@/api/customer';
import { formatDateTime } from '@/lib/constants';
import { useCustomerAuth } from '@/store/customerAuth';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/common';
import { ROLE_LABEL, ROLE_TONE } from '@/pages/customer/shared';
import { ResumeSection } from '@/pages/customer/ResumeSection';
import { MyApplications } from '@/pages/customer/MyApplications';
import { MyPostsSection } from '@/pages/customer/MyPostsSection';

/**
 * 「我的主页」（/me）= 你对外主页的**作者视角**。
 *
 * 一页三块，从上到下就是访客看到的顺序，不再用标签页切换：
 *   1. 身份头：头像 / 昵称 / 身份 / 注册时间 / 帖子数（= 公开主页顶部那条，只是多了「在新页面打开」）；
 *   2. 老师 → 我的资料（简历只读态 ⇄ 编辑态）；学生 → 老师申请；
 *   3. 我的帖子：发帖框 + 我的帖子列表（公开主页里也是同一批数据）。
 *
 * 身份差异：「我的资料（简历）」只对老师；学生/家长看到的是「老师申请」模块
 * （自己发布的需求收到了哪些老师的申请），不再有简历。
 *
 * 为什么不再单列「公开主页」一整块：它的内容是「身份头 + 简历 + 帖子」，
 * 而这三样在同一页上已经有了——再渲染一遍只是把同样的内容抄第二遍。
 * 想看真实访客视角，用身份头右侧的「在新页面打开」（/u/{accountId} 仍可用，会回到本页）。
 */
export default function CustomerProfile() {
  const { account: authAccount } = useCustomerAuth();

  /* 主页聚合数据（账号 + 简历 + 帖子总数） */
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* 身份头上的帖子数：先用聚合接口给的值，帖子区自己拉到数后再接管 */
  const [postCount, setPostCount] = useState<number | null>(null);

  /* 帖子区的刷新信号（页头「刷新」一处触发） */
  const [postsSignal, setPostsSignal] = useState(0);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await customerApi.getMyProfile();
      setPayload(data ?? null);
      if (typeof data?.postCount === 'number') setPostCount(data.postCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : '个人主页加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /* payload.account 是权威数据（含邮箱）；引导期先用登录态里的账号兜底 */
  const account = payload?.account ?? authAccount ?? null;
  const role = account?.role ?? null;
  const displayName = account?.nickname || account?.email?.split('@')[0] || '未命名用户';

  function refreshAll() {
    void loadProfile();
    setPostsSignal((n) => n + 1);
  }

  /** 简历保存成功：更新本地数据（身份头不展示简历，只更新资料块） */
  function handleSaved(saved: TeacherProfile) {
    setPayload((p) => (p ? { ...p, profile: saved } : p));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="我的主页" description="这就是别人看到的主页，只是你多了编辑权">
        <Button variant="outline" size="sm" disabled={loading} onClick={refreshAll}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          刷新
        </Button>
      </PageHeader>

      {/* ---------------- 1. 身份头（= 公开主页顶部，多一个「在新页面打开」） ---------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-5">
          <Avatar size="xl" name={displayName} rounded="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{displayName}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {role ? (
                <Badge tone={ROLE_TONE[role]}>
                  <ShieldCheck className="h-3 w-3" />
                  {ROLE_LABEL[role]}
                </Badge>
              ) : (
                <Badge tone="muted" dot>
                  尚未选择身份
                </Badge>
              )}
              <Badge tone="outline">
                <CalendarClock className="h-3 w-3" />
                注册于 {formatDateTime(account?.createTime)}
              </Badge>
              <Badge tone="outline">
                <Sparkles className="h-3 w-3" />
                {postCount === null ? '帖子统计中' : `${postCount} 条动态`}
              </Badge>
            </div>
          </div>

        </div>
      </Card>

      {/* ---------------- 2. 老师：我的资料（简历） / 学生：老师申请 ---------------- */}
      {role === 'TEACHER' ? (
        <ResumeSection
          profile={payload?.profile ?? null}
          role={role}
          loading={loading}
          error={error}
          onRetry={() => void loadProfile()}
          onSaved={handleSaved}
        />
      ) : (
        /*
          学生（含未选身份）：不发简历，改成「我发布的需求有哪些老师来申请」。
          未选身份时接口返回空数组，这里会显示「还没有老师申请」+ 去发布需求，
          等选了身份（学生）再看就有内容了。
        */
        <MyApplications refreshSignal={postsSignal} />
      )}

      {/* ---------------- 3. 我的帖子（发帖 + 列表） ---------------- */}
      <MyPostsSection refreshSignal={postsSignal} onTotalChange={setPostCount} />
    </div>
  );
}
