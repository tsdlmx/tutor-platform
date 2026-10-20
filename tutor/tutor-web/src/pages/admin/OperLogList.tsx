import * as monitorApi from '@/api/monitor';
import { BUSINESS_TYPE, formatDateTime } from '@/lib/constants';
import type { OperLog } from '@/types/api';
import { Badge } from '@/components/ui';
import { SimpleListPage, type SimpleListConfig } from '@/pages/admin/SimpleListPage';

const config: SimpleListConfig<OperLog> = {
  title: '操作日志',
  description: '后台操作审计，只记录动作、目标与结果等安全元数据，不保存请求体与返回体',
  filters: [
    { name: 'title', label: '系统模块', type: 'input', placeholder: '如 家教信息' },
    { name: 'operName', label: '操作人员', type: 'input', placeholder: '如 admin' },
    {
      name: 'businessType',
      label: '操作类型',
      type: 'select',
      options: Object.entries(BUSINESS_TYPE).map(([value, label]) => ({ label, value })),
    },
    {
      name: 'status',
      label: '操作状态',
      type: 'select',
      options: [
        { label: '正常', value: '0' },
        { label: '异常', value: '1' },
      ],
    },
  ],
  fetch: (query) => monitorApi.listOperLog(query),
  rowKey: (row, i) => row.operId ?? `row-${i}`,
  columns: [
    { key: 'operId', title: '日志编号', width: '100px', align: 'right' },
    { key: 'title', title: '系统模块', width: '140px' },
    {
      key: 'businessType',
      title: '操作类型',
      width: '100px',
      render: (r) => <Badge tone="outline">{BUSINESS_TYPE[r.businessType ?? 0] ?? '其它'}</Badge>,
    },
    { key: 'requestMethod', title: '请求方式', width: '90px' },
    {
      key: 'operName',
      title: '操作人员',
      width: '120px',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-xs">{r.operName ?? '—'}</p>
          <p className="truncate text-2xs text-muted-foreground">{r.deptName ?? ''}</p>
        </div>
      ),
    },
    { key: 'operIp', title: '操作地址', width: '130px' },
    { key: 'operLocation', title: '操作地点', width: '130px' },
    {
      key: 'status',
      title: '状态',
      width: '90px',
      render: (r) =>
        r.status === 0 ? (
          <Badge tone="success" dot>
            正常
          </Badge>
        ) : (
          <Badge tone="danger" dot>
            异常
          </Badge>
        ),
    },
    {
      key: 'costTime',
      title: '耗时',
      width: '90px',
      align: 'right',
      render: (r) => <span className="tabular text-2xs text-muted-foreground">{r.costTime ?? 0} ms</span>,
    },
    { key: 'operTime', title: '操作时间', width: '170px', render: (r) => formatDateTime(r.operTime) },
  ],
  detailTitle: (r) => `${r.title ?? '操作'} · ${r.operName ?? ''}`,
  detailSections: (r) => [
    {
      title: '操作信息',
      fields: [
        { label: '日志编号', value: r.operId },
        { label: '系统模块', value: r.title },
        { label: '操作类型', value: BUSINESS_TYPE[r.businessType ?? 0] },
        { label: '请求方式', value: r.requestMethod },
        { label: '操作方法', value: r.method, span: 2 },
        { label: '请求地址', value: r.operUrl, span: 2, copyable: true },
        { label: '操作人员', value: r.operName },
        { label: '所属部门', value: r.deptName },
        { label: '操作地址', value: r.operIp },
        { label: '操作地点', value: r.operLocation },
        { label: '操作时间', value: formatDateTime(r.operTime) },
        { label: '消耗时间', value: r.costTime ? `${r.costTime} ms` : '—' },
        { label: '请求参数', value: r.operParam, span: 2, fallback: '无' },
        { label: '返回结果', value: r.jsonResult, span: 2, fallback: '无' },
        ...(r.errorMsg ? [{ label: '异常信息', value: r.errorMsg, span: 2 as const }] : []),
      ],
    },
  ],
};

export default function OperLogList() {
  return <SimpleListPage config={config} />;
}
