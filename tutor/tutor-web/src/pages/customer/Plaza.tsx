import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { PostQuery, UserPost } from '@/api/customer';
import {
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
import { PageHeader } from '@/components/common';
import { PostCard, sortPostsDesc } from '@/pages/customer/shared';

const PAGE_SIZES = [10, 20, 50];

/**
 * 广场 —— 所有客户（老师 + 学生）发布的帖子。
 *
 * 只显示**审核通过**的帖子：管理后台「帖子审核」通过之后才会出现在这里，
 * 待审核 / 被拒绝的帖子只有在作者本人的「我的」里能看到。
 */
export default function Plaza() {
  const [query, setQuery] = useState<PostQuery>({ pageNum: 1, pageSize: 10 });
  const [rows, setRows] = useState<UserPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 供「重试」使用：自增即重新拉取 */
  const [signal, setSignal] = useState(0);

  const pageNum = query.pageNum ?? 1;
  const pageSize = query.pageSize ?? 10;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { total: t, rows: list } = await customerApi.listPlazaPosts(query);
      setRows(sortPostsDesc(list));
      setTotal(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : '广场加载失败');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, signal]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="广场" description="老师与学生发布的公开帖子，内容经审核后展示" />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <MessagesSquare className="h-3.5 w-3.5" />
              全部帖子
            </CardTitle>
            <CardDescription>按发布时间倒序</CardDescription>
          </div>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {loading ? '加载中…' : `共 ${total} 条`}
          </span>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-3/4" />
                </Card>
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => setSignal((n) => n + 1)} />
          ) : rows.length === 0 ? (
            <Empty
              title="广场还没有帖子"
              description="在「我的」里发布一条帖子，审核通过后就会出现在这里。"
              icon={<MessagesSquare className="h-5 w-5" />}
            />
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((post, i) => (
                  <PostCard key={post.postId} post={post} index={i} showAuthor authorLink />
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
