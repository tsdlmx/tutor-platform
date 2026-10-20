import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, FileText, ShieldCheck, Sparkles, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import * as customerApi from '@/api/customer';
import { CustomerApiError } from '@/api/customer';
import type { PostQuery, ProfilePayload, UserPost } from '@/api/customer';
import { formatDateTime } from '@/lib/constants';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  ErrorState,
  Pagination,
  Skeleton,
} from '@/components/ui';
import { ROLE_LABEL, ROLE_TONE, PostCard, ResumeReadonly, sortPostsDesc } from '@/pages/customer/shared';

const PAGE_SIZES = [10, 20];

/**
 * 公开主页（别人看到的那一版，只读）。
 *
 * 现在只以「内嵌形态」出现在 `/me` 的「公开主页」标签页里（`embedded`，
 * 标题/刷新由工作台给）。原来的独立页面 `/u/:accountId` 已并进来，
 * 老地址（含 ?tab= 参数）都会重定向到 `/me`。
 *
 * 放进组件里而不是各写一遍，是为了「预览」和「真实看到的样子」永远不会跑偏：
 * 数据、排版、空态都是同一套代码。
 *
 * 数据：GET /customer/profile/{accountId}（**不含邮箱**）+ /profile/{accountId}/posts。
 */
export function PublicProfileView({
  accountId,
  embedded = false,
  refreshSignal = 0,
}: {
  accountId: number | null;
  /** true：不带页头/刷新，交给外层容器（/me 的标签页） */
  embedded?: boolean;
  /** 外层刷新时 +1，用来触发重新拉取 */
  refreshSignal?: number;
}) {
  const validId =
    accountId !== null && Number.isFinite(accountId) && accountId > 0;

  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [posts, setPosts] = useState<UserPost[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<PostQuery>({ pageNum: 1, pageSize: 10 });
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);

  const pageNum = query.pageNum ?? 1;
  const pageSize = query.pageSize ?? 10;

  /* ---------------------------- 主页数据（含简历） ---------------------------- */
  const loadProfile = useCallback(async () => {
    if (!validId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const payload = await customerApi.getUserProfile(accountId);
      setData(payload ?? null);
    } catch (e) {
      // 契约：账号不存在 → { code:400, msg:'账号不存在' }
      if (e instanceof CustomerApiError && (e.code === 400 || e.code === 404)) {
        setNotFound(true);
        setData(null);
      } else {
        setError(e instanceof Error ? e.message : '公开主页加载失败');
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, validId]);

  /* ---------------------------- 该用户的帖子（分页） ---------------------------- */
  const loadPosts = useCallback(async () => {
    if (!validId) {
      setPostsLoading(false);
      setPosts([]);
      setTotal(0);
      return;
    }
    setPostsLoading(true);
    setPostsError(null);
    try {
      const { total: t, rows } = await customerApi.listUserPosts(accountId, query);
      setPosts(sortPostsDesc(rows));
      setTotal(t);
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : '帖子加载失败');
      setPosts([]);
      setTotal(0);
    } finally {
      setPostsLoading(false);
    }
  }, [accountId, query, validId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, refreshSignal]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts, refreshSignal]);

  const profileAccount = data?.account ?? null;
  const nickname = profileAccount?.nickname || (validId ? `用户 #${accountId}` : '未知用户');
  const role = profileAccount?.role ?? null;
  const profile = data?.profile ?? null;
  const postCount = postsLoading ? (data?.postCount ?? 0) : total;

  /* 账号不存在 / 地址非法 */
  if (notFound) {
    return (
      <Card>
        <Empty
          title={validId ? '找不到这个账号' : '主页地址不正确'}
          description={
            validId
              ? '对方可能已经注销了账号，或者链接里的账号编号不对。'
              : '地址里的账号编号不是有效数字，请从帖子或主页入口重新进入。'
          }
          icon={<UserX className="h-5 w-5" />}
          action={
            <Button size="sm" asChild>
              <Link to="/">返回首页</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={() => void loadProfile()} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部：昵称 / 身份 / 注册时间（公开主页不展示邮箱） */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-5">
          <Avatar size="xl" name={nickname} rounded="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{nickname}</p>
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
                注册于 {formatDateTime(profileAccount?.createTime)}
              </Badge>
              <Badge tone="outline">{postCount} 条动态</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* 简历（只读） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />
            个人简历
          </CardTitle>
          <CardDescription>
            {profile ? '公开的教学信息，可用于了解老师的背景' : '这位用户还没有公开简历'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <ResumeReadonly profile={profile} />
          ) : (
            <Empty
              title={role === 'TEACHER' ? '这位老师还没有填写简历' : '暂无简历'}
              description={
                role === 'TEACHER'
                  ? '老师可以在「我的主页」里填写简历，之后会展示在这里。'
                  : '简历只有老师身份可以填写。'
              }
              icon={<FileText className="h-5 w-5" />}
            />
          )}
        </CardContent>
      </Card>

      {/* 该用户的帖子（分页） */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {embedded ? '公开动态' : 'TA 的动态'}
            </CardTitle>
            <CardDescription>公开的帖子，按发布时间倒序展示</CardDescription>
          </div>
          <Badge tone="muted">{postsLoading ? '加载中…' : `共 ${total} 条`}</Badge>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {postsLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-3/4" />
                </Card>
              ))}
            </div>
          ) : postsError ? (
            <ErrorState message={postsError} onRetry={() => void loadPosts()} />
          ) : posts.length === 0 ? (
            <Empty
              title="还没有发过帖子"
              description={embedded ? '在「我的帖子」标签页里发布第一条帖子吧。' : '这位用户还没有发布任何帖子。'}
              icon={<Sparkles className="h-5 w-5" />}
            />
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {posts.map((p, i) => (
                  <PostCard key={p.postId} post={p} index={i} showAuthor />
                ))}
              </div>

              {total > pageSize ? (
                <div className="rounded-xl border border-border/60">
                  <Pagination
                    pageNum={pageNum}
                    pageSize={pageSize}
                    total={total}
                    pageSizes={PAGE_SIZES}
                    onPageChange={(page) => setQuery((q) => ({ ...q, pageNum: page }))}
                    onPageSizeChange={(size) => setQuery((q) => ({ ...q, pageSize: size, pageNum: 1 }))}
                  />
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PublicProfileView;
