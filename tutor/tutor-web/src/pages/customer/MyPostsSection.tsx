import { useCallback, useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { PostQuery, UserPost } from '@/api/customer';
import { cn } from '@/lib/cn';
import {
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
  Textarea,
  toast,
} from '@/components/ui';
import { DeleteButton } from '@/components/rare';
import { PostCard, sortPostsDesc } from '@/pages/customer/shared';

const PAGE_SIZES = [10, 20, 50];

/** 审核状态（后端 t_user_post.audit_status）：0 待审核 / 1 已通过 / 2 未通过 */
const AUDIT_TONE: Record<string, 'warning' | 'success' | 'danger'> = {
  '0': 'warning',
  '1': 'success',
  '2': 'danger',
};
const AUDIT_LABEL: Record<string, string> = {
  '0': '待审核',
  '1': '已通过',
  '2': '未通过',
};

/** 帖子正文上限（与后端契约一致） */
const POST_MAX = 1000;

export interface MyPostsSectionProps {
  /** 帖子总数变化时通知上层（身份头上的「N 条动态」用） */
  onTotalChange?: (total: number) => void;
  /** 外层「刷新」按钮：自增即重新拉取 */
  refreshSignal?: number;
}

/**
 * 我的帖子：发帖 + 列表 + 分页 + 删帖（GET/POST/DELETE /customer/posts）。
 *
 * 数据自己拉、状态自己管 ——「我的主页」只负责把它放进「我的帖子」区块，
 * 也就不必再让页面顶层维护一大堆和简历无关的帖子状态。
 */
export function MyPostsSection({ onTotalChange, refreshSignal = 0 }: MyPostsSectionProps) {
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [query, setQuery] = useState<PostQuery>({ pageNum: 1, pageSize: 10 });
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const pageNum = query.pageNum ?? 1;
  const pageSize = query.pageSize ?? 10;

  /* ---------------------------- 加载我的帖子 ---------------------------- */
  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const { total, rows } = await customerApi.listMyPosts(query);
      setPosts(sortPostsDesc(rows));
      setPostTotal(total);
    } catch (e) {
      setPostsError(e instanceof Error ? e.message : '我的帖子加载失败');
      setPosts([]);
      setPostTotal(0);
    } finally {
      setPostsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts, refreshSignal]);

  /* 总数同步给上层（onTotalChange 通常是 useState 的 setter，引用稳定）。
     加载中先不汇报，免得左栏闪一下「0 条」再跳成真实值。 */
  useEffect(() => {
    if (!postsLoading) onTotalChange?.(postTotal);
  }, [onTotalChange, postTotal, postsLoading]);

  /* ---------------------------- 帖子：发布 / 删除 ---------------------------- */
  const trimmed = content.trim();
  const tooLong = content.length > POST_MAX;
  const canPublish = trimmed.length > 0 && !tooLong && !publishing;

  async function publishPost() {
    if (!canPublish) return;
    setPublishing(true);
    try {
      const created = await customerApi.createPost({ content: trimmed, imageList: [] });
      toast.success('已提交审核', { description: '审核通过后会展示在广场和你的公开主页上' });
      setContent('');

      if (!created) {
        // 后端没回传帖子体（异常情况）：不插假数据，直接重新拉列表
        if (pageNum !== 1) setQuery((q) => ({ ...q, pageNum: 1 }));
        else await loadPosts();
        return;
      }

      if (pageNum !== 1) {
        // 新帖只会出现在第一页，回到第一页重新拉取
        setQuery((q) => ({ ...q, pageNum: 1 }));
      } else {
        // 新帖插到列表最前（后端返回的是时间倒序，新帖必在第一页首位）
        setPosts((list) => [created, ...list]);
        setPostTotal((t) => t + 1);
      }
    } catch (e) {
      toast.error('发布失败', { description: e instanceof Error ? e.message : '请稍后重试' });
    } finally {
      setPublishing(false);
    }
  }

  /** 删除帖子；删掉当前页最后一条时自动回退一页 */
  async function removePost(post: UserPost) {
    if (deletingId !== null) return;
    setDeletingId(post.postId);
    try {
      const msg = await customerApi.deletePost(post.postId);
      toast.success('帖子已删除', { description: msg });
      if (posts.length === 1 && pageNum > 1) {
        setQuery((q) => ({ ...q, pageNum: pageNum - 1 }));
      } else {
        setPosts((list) => list.filter((p) => p.postId !== post.postId));
        setPostTotal((t) => Math.max(0, t - 1));
      }
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '请稍后重试' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            我的帖子
          </CardTitle>
          <CardDescription>
            所有客户都可以发帖子：教学心得、学习进展、找同学的招呼都行
          </CardDescription>
        </div>
        <Badge tone="muted" className="shrink-0">
          {postsLoading ? '加载中…' : `共 ${postTotal} 条`}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* 发布框 */}
        <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
          <Textarea
            value={content}
            className="min-h-[96px] bg-background"
            placeholder="说点什么吧…"
            invalid={tooLong}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">
              发布后先进入审核，通过后展示在广场与公开主页，最多 {POST_MAX} 字
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'tabular text-2xs',
                  tooLong ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {content.length}/{POST_MAX}
              </span>
              <Button
                size="sm"
                loading={publishing}
                disabled={!canPublish}
                onClick={() => void publishPost()}
              >
                <Send className="h-3.5 w-3.5" />
                发布
              </Button>
            </div>
          </div>
        </div>

        {/* 帖子列表 */}
        {postsLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="flex flex-col gap-3 p-4">
                <Skeleton className="h-3.5 w-24" />
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
            description="在上面的输入框里写点什么，发布后会出现在你的主页上。"
            icon={<Sparkles className="h-5 w-5" />}
          />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {posts.map((p, i) => {
                const status = p.auditStatus ?? '1';
                return (
                  <PostCard
                    key={p.postId}
                    post={p}
                    index={i}
                    statusSlot={
                      <Badge tone={AUDIT_TONE[status] ?? 'muted'}>
                        {AUDIT_LABEL[status] ?? '已通过'}
                      </Badge>
                    }
                    footer={
                      <>
                        {status === '2' && p.auditRemark ? (
                          <p className="w-full text-2xs leading-5 text-destructive">
                            未通过原因：{p.auditRemark}
                          </p>
                        ) : null}
                        <DeleteButton
                          size="sm"
                          variant="outline"
                          label="删除"
                          confirmLabel="确认删除"
                          disabled={deletingId === p.postId}
                          onConfirm={() => removePost(p)}
                        />
                      </>
                    }
                  />
                );
              })}
            </div>

            {postTotal > pageSize ? (
              <div className="rounded-lg border border-border/60">
                <Pagination
                  pageNum={pageNum}
                  pageSize={pageSize}
                  total={postTotal}
                  pageSizes={PAGE_SIZES}
                  onPageChange={(page) => setQuery((q) => ({ ...q, pageNum: page }))}
                  onPageSizeChange={(size) =>
                    setQuery((q) => ({ ...q, pageSize: size, pageNum: 1 }))
                  }
                />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default MyPostsSection;
