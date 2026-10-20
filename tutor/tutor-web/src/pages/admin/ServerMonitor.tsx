import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw, Server, Terminal } from 'lucide-react';
import * as monitorApi from '@/api/monitor';
import { getCompat } from '@/lib/httpCompat';
import type { ServerInfo } from '@/types/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui';
import { PageHeader } from '@/components/common';

function Meter({ value, label, tone = 'default' }: { value: number; label?: string; tone?: 'default' | 'warning' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color =
    tone === 'danger' || pct >= 90
      ? 'bg-destructive'
      : tone === 'warning' || pct >= 75
        ? 'bg-warning'
        : 'bg-success';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 text-xs last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function ServerMonitor() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      let data = await monitorApi.getServerInfo();
      // 兜底：RuoYi 原生 /monitor/server 平铺返回 cpu/mem/jvm/sys
      if (!data || (!data.cpu && !data.mem && !data.jvm)) {
        data = await getCompat<ServerInfo>('/monitor/server');
      }
      setInfo(data ?? null);
      setUpdatedAt(new Date().toLocaleTimeString('zh-CN'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '服务器信息获取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const cpu = info?.cpu;
  const mem = info?.mem;
  const jvm = info?.jvm;
  const sys = info?.sys;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="服务监控"
        description="CPU、内存、JVM 与磁盘的实时状态，每 15 秒自动刷新"
        className="[&_h1]:text-base"
      >
        {updatedAt ? (
          <Badge tone="muted" className="hidden sm:inline-flex">
            更新于 {updatedAt}
          </Badge>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </Button>
      </PageHeader>

      {error && !info ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5" />
                  CPU
                </CardTitle>
                <CardDescription>{cpu ? `${cpu.cpuNum} 核心` : '—'}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading && !cpu ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Meter value={cpu?.used ?? 0} label="CPU 使用率" />
                  <div className="grid grid-cols-2 gap-x-4">
                    <KV label="用户使用率" value={`${(cpu?.sys ?? 0).toFixed(1)}%`} />
                    <KV label="系统使用率" value={`${(cpu?.used ?? 0).toFixed(1)}%`} />
                    <KV label="当前等待率" value={`${(cpu?.wait ?? 0).toFixed(1)}%`} />
                    <KV label="当前空闲率" value={`${(cpu?.free ?? 0).toFixed(1)}%`} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MemoryStick className="h-3.5 w-3.5" />
                内存
              </CardTitle>
              <CardDescription>{mem ? `总计 ${mem.total} G` : '—'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading && !mem ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Meter value={mem?.usage ?? 0} label="内存使用率" />
                  <div className="grid grid-cols-2 gap-x-4">
                    <KV label="总内存" value={`${mem?.total ?? 0} G`} />
                    <KV label="已用内存" value={`${mem?.used ?? 0} G`} />
                    <KV label="剩余内存" value={`${mem?.free ?? 0} G`} />
                    <KV label="使用率" value={`${(mem?.usage ?? 0).toFixed(1)}%`} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                JVM
              </CardTitle>
              <CardDescription>{jvm?.name ?? '—'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {loading && !jvm ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <Meter value={jvm?.usage ?? 0} label="JVM 使用率" />
                  <div className="grid grid-cols-2 gap-x-4">
                    <KV label="JDK 版本" value={jvm?.version} />
                    <KV label="启动时间" value={jvm?.startTime} />
                    <KV label="总内存" value={jvm ? `${jvm.total} M` : '—'} />
                    <KV label="最大可用" value={jvm ? `${jvm.max} M` : '—'} />
                    <KV label="空闲内存" value={jvm ? `${jvm.free} M` : '—'} />
                    <KV label="运行时长" value={jvm?.runTime} />
                  </div>
                  <KV label="JDK 路径" value={<span className="font-mono text-2xs">{jvm?.home ?? '—'}</span>} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5" />
                服务器信息
              </CardTitle>
              <CardDescription>{sys?.computerName ?? '—'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {loading && !sys ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <KV label="服务器名称" value={sys?.computerName} />
                  <KV label="服务器 IP" value={sys?.computerIp} />
                  <KV label="操作系统" value={sys?.osName} />
                  <KV label="系统架构" value={sys?.osArch} />
                  <KV label="项目路径" value={<span className="font-mono text-2xs">{sys?.userDir ?? '—'}</span>} />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" />
                磁盘状态
              </CardTitle>
              <CardDescription>各挂载点容量与使用率</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TableWrapper className="[&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>盘符路径</TableHead>
                      <TableHead>文件系统</TableHead>
                      <TableHead>盘符类型</TableHead>
                      <TableHead className="text-right">总大小</TableHead>
                      <TableHead className="text-right">可用大小</TableHead>
                      <TableHead className="text-right">已用大小</TableHead>
                      <TableHead className="w-[200px]">已用百分比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(info?.sysFiles ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                          {loading ? '加载中…' : '后端未返回磁盘信息'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (info?.sysFiles ?? []).map((f, i) => (
                        <TableRow key={`${f.dirName}-${i}`}>
                          <TableCell className="font-mono text-xs">{f.dirName}</TableCell>
                          <TableCell className="text-xs">{f.sysTypeName}</TableCell>
                          <TableCell className="text-xs">{f.typeName}</TableCell>
                          <TableCell className="tabular text-right text-xs">{f.total}</TableCell>
                          <TableCell className="tabular text-right text-xs">{f.free}</TableCell>
                          <TableCell className="tabular text-right text-xs">{f.used}</TableCell>
                          <TableCell>
                            <Meter value={f.usage} label="" />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableWrapper>
            </CardContent>
          </Card>

          {jvm?.inputArgs ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5" />
                  运行参数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-2xs leading-5">{jvm.inputArgs}</pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
