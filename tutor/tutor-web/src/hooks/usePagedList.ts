import { useCallback, useEffect, useRef, useState } from 'react';

export interface PageResult<T> {
  total: number;
  rows: T[];
}

export interface UsePagedListResult<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
  pageNum: number;
  pageSize: number;
  filters: Record<string, unknown>;
  setPageNum: (p: number) => void;
  setPageSize: (s: number) => void;
  /** 应用新筛选条件（自动回到第 1 页） */
  search: (next: Record<string, unknown>) => void;
  reset: () => void;
  reload: () => void;
}

/**
 * usePagedList —— 所有列表页共用的分页数据源。
 * 统一处理 loading / error / 筛选重置，配合 DataTable 使用。
 *
 * 关于 fetcher 的 query 参数类型：各 api/*.ts 的列表方法都声明了具体的可选查询对象
 * （如 TutorQuery），而这里是运行期拼装的通用对象，二者结构同构但签名不同。
 * 为避免在十几个页面里重复写断言，这里把入参放宽为 any，断言只此一处。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseQuery = any;

export function usePagedList<T>(
  fetcher: (query: LooseQuery) => Promise<PageResult<T>>,
  options: { pageSize?: number; initialFilters?: Record<string, unknown> } = {},
): UsePagedListResult<T> {
  const { pageSize: initialSize = 10 } = options;
  const initialFiltersRef = useRef<Record<string, unknown>>(options.initialFilters ?? {});
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [filters, setFilters] = useState<Record<string, unknown>>(initialFiltersRef.current);
  const [pageNum, setPageNumState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialSize);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetcherRef.current({ pageNum, pageSize, ...filters });
        if (!alive) return;
        setRows(Array.isArray(res?.rows) ? res.rows : []);
        setTotal(Number(res?.total ?? 0));
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setTotal(0);
        setError(e instanceof Error ? e.message : '数据加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pageNum, pageSize, filters, tick]);

  const setPageNum = useCallback((p: number) => {
    setPageNumState(Math.max(1, p));
  }, []);

  const setPageSize = useCallback((s: number) => {
    setPageSizeState(Math.max(1, s));
    setPageNumState(1);
  }, []);

  const search = useCallback((next: Record<string, unknown>) => {
    setFilters(next);
    setPageNumState(1);
  }, []);

  const reset = useCallback(() => {
    setFilters(initialFiltersRef.current);
    setPageNumState(1);
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    rows,
    total,
    loading,
    error,
    pageNum,
    pageSize,
    filters,
    setPageNum,
    setPageSize,
    search,
    reset,
    reload,
  };
}
