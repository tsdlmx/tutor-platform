import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import * as customerApi from '@/api/customer';
import type { DemandStats } from '@/api/customer';
import { APP_NAME, ICP_BEIAN } from '@/lib/constants';
import { useCustomerAuth } from '@/store/customerAuth';

/**
 * 客户侧页脚 —— 「总览 / 备案信息」那一栏（footer）。
 *
 * 原来这里是空的，只有一句「公开家教浏览」；需求统计（总条数、待接单、平均预算、
 * 科目分布）则堆在老师首页最下面，看需求列表得先滚过一屏数据。
 * 现在把统计挪到页脚：
 *   * 页脚是全站客户侧共用的，任何页面抬头/低头都能看到同样的总览；
 *   * 页面主体就干净了，首页只管「需求列表」这一件事；
 *   * 页脚是布局层组件，进站只请求一次 stats，切换页面不会重复拉。
 *
 * 未登录时不请求、也不占位（没有 token 调用 /demands/stats 只会拿到 401）。
 */
export function CustomerFooter() {
  const { authenticated } = useCustomerAuth();
  const [stats, setStats] = useState<DemandStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      setStats(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    customerApi
      .demandStats()
      .then((data) => {
        if (alive) setStats(data);
      })
      // 统计只是锦上添花：拿不到就整块不显示，不要因此打扰用户
      .catch(() => {
        if (alive) setStats(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authenticated]);

  const topSubjects = (stats?.bySubject ?? []).slice(0, 3);
  const avgBudget = (stats?.avgBudget ?? 0).toFixed(1);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background/60 px-3 pb-3 pt-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2">
        {/* 总览：登录后才有数据（游客没有 token，接口会 401） */}
        {authenticated ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground/80">
              <BarChart3 className="h-3.5 w-3.5" />
              平台总览
            </span>

            {stats ? (
              <>
                <span>
                  需求总数 <b className="tabular font-semibold text-foreground">{stats.total}</b> 条
                </span>
                <span>
                  待接单 <b className="tabular font-semibold text-foreground">{stats.open}</b> 条
                </span>
                <span>
                  平均预算 <b className="tabular font-semibold text-foreground">¥{avgBudget}</b>
                </span>
                {topSubjects.length > 0 ? (
                  <span className="min-w-0 truncate">
                    热门科目{' '}
                    {topSubjects.map((s, i) => (
                      <span key={s.name}>
                        {i > 0 ? ' / ' : ''}
                        {s.name} {s.count}
                      </span>
                    ))}
                  </span>
                ) : null}
              </>
            ) : loading ? (
              <span className="text-muted-foreground/70">统计加载中…</span>
            ) : (
              <span className="text-muted-foreground/70">暂无统计数据</span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          <span>
            © {year} {APP_NAME}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {/* 「找家教」只给未登录访客（登录后路由层也会把人送回首页） */}
            {authenticated ? null : (
              <Link to="/tutors" className="transition-colors hover:text-foreground">
                全部家教
              </Link>
            )}
            {/* 备案号留位：拿到 ICP 备案号后填 lib/constants.ts 的 ICP_BEIAN 即可 */}
            {ICP_BEIAN ? <span>{ICP_BEIAN}</span> : null}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default CustomerFooter;
