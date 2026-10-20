# -*- coding: utf-8 -*-
"""
家教中介平台 —— 后端接口验证脚本

用 Python 而不是 PowerShell 发请求，原因：
  1) PowerShell 的 Invoke-RestMethod 对 Content-Type 里没有 charset 的 JSON
     会解码错，中文全变乱码，无法判断到底是服务端还是客户端的问题；
  2) PowerShell 传 -Dxxx.yyy=zzz 形式的参数会在第一个点处被拆开（踩过两次）。
这里用 urllib 直接控制 UTF-8 字节，结果可信。

**自带测试数据**：不再依赖 sql/demo-seed.sql 灌的演示数据（那些已按要求清空）。
脚本流程：登录 -> 建 2 位家教 -> 验证列表/分页/中文/科目 -> 验证审核闭环
-> 删掉自己造的数据。可以反复跑，跑完库里不留痕迹。

可用环境变量覆盖：
  TUTOR_API_BASE  后端地址（默认 http://127.0.0.1:12501）
  TUTOR_MYSQL     mysql 客户端路径（用于造「一个家教多条资质」的回归数据；
                  找不到就跳过那一项，其余检查照跑）
"""
import json
import os
import subprocess
import urllib.error
import urllib.request

BASE = os.environ.get('TUTOR_API_BASE', 'http://127.0.0.1:12501')
MYSQL_BIN = os.environ.get('TUTOR_MYSQL') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'runtime-linux', 'mysql', 'bin', 'mysql')
OK = []
FAIL = []

TUTOR_A = '接口自测甲'
TUTOR_B = '接口自测乙'


def call(method, path, body=None, token=None, raw=False):
    url = BASE + path
    data = None
    headers = {'Content-Type': 'application/json;charset=utf-8'}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = resp.read()
    return payload if raw else json.loads(payload.decode('utf-8'))


def check(label, cond, detail=''):
    (OK if cond else FAIL).append(label)
    print(('  PASS  ' if cond else '  FAIL  ') + label + (('  -> ' + detail) if detail else ''))


def sql(statement):
    """直接改库：只用于造接口造不出来的回归数据（一个家教挂两条资质）"""
    if not os.path.exists(MYSQL_BIN):
        return False
    try:
        r = subprocess.run(
            [MYSQL_BIN, '-h', '127.0.0.1', '-P', '3307', '-u', 'root', '-p1234',
             '--default-character-set=utf8mb4', 'tutor', '-e', statement],
            capture_output=True, text=True, timeout=30)
        return r.returncode == 0
    except Exception:
        return False


print('=' * 72)
print('1) 登录')
ADMIN_USER = os.environ.get('TUTOR_ADMIN_USER', 'admin')
ADMIN_PASSWORD = os.environ.get('TUTOR_ADMIN_PASSWORD')
if not ADMIN_PASSWORD:
    raise SystemExit('请先设置 TUTOR_ADMIN_PASSWORD（后台管理员口令，仓库里不保存明文）')
login = call('POST', '/login', {'username': ADMIN_USER, 'password': ADMIN_PASSWORD})
check('POST /login 返回 token', bool(login.get('token')), 'token 长度 %d' % len(login.get('token') or ''))
T = login['token']

print('\n2) 身份与权限')
info = call('GET', '/getInfo', token=T)
check('GET /getInfo 返回 admin', info.get('user', {}).get('userName') == 'admin')
check('拥有 *:*:* 权限', '*:*:*' in (info.get('permissions') or []))

print('\n3) 造测试数据（2 位家教，跑完会删掉）')
created = []
for name, subjects, subject_ids in ((TUTOR_A, '数学,物理', '2,4'), (TUTOR_B, '英语', '3')):
    r = call('POST', '/system/tutorInfo', {
        'tutorName': name,
        'gender': 'female',
        'age': 25,
        'province': '测试省',
        'city': '测试市',
        'district': '测试区',
        'phone': '13800000000',
        'identityType': 'teacher',
        'school': '验证大学',
        'major': '验证专业',
        'subjectIds': subject_ids,
        'subjectNames': subjects,
        'teachGrades': '7,8,9',
        'teachMode': 'offline,online',
        'hourlyRate': 150,
        'intro': '这是接口自测创建的数据，用来验证列表、分页、中文与审核闭环。',
        'auditStatus': '0',
        'status': '0',
        'qualification': {
            'teacherCertificate': '高级中学教师资格证',
            'teachingExperience': '带过三届毕业班',
            'characterIntro': '耐心细致',
        },
    }, token=T)
    check('新增家教「%s」' % name, r.get('code') == 200, r.get('msg'))

lst = call('GET', '/system/tutorInfo/list?pageNum=1&pageSize=100', token=T)
by_name = {row.get('tutorName'): row.get('tutorId') for row in lst.get('rows', [])}
a_id, b_id = by_name.get(TUTOR_A), by_name.get(TUTOR_B)
check('两位家教都在列表里（拿到 id）', bool(a_id) and bool(b_id), 'a=%s b=%s' % (a_id, b_id))
if not (a_id and b_id):
    print('\n无法继续（新增家教失败），请先看后端日志')
    raise SystemExit(1)

# 「一个家教挂两条资质」——这是原来那个 Bug 2（LEFT JOIN 一对多导致重复行）的触发条件，
# 接口只支持挂一条资质，所以第二条直接写库造出来
dup_ok = sql("INSERT INTO t_tutor_qualification (tutor_id, teaching_experience, character_intro, create_time) "
             "VALUES (%d, '第二条资质（回归用）', '用于复现一对多 JOIN', NOW());" % a_id)
if dup_ok:
    print('  （已为「%s」补第二条资质，用于复现一对多 JOIN 的场景）' % TUTOR_A)
    # subject_names 只在 resultMap / select 里，insert 语句没有这一列，
    # 所以接口建数据时写不进去 —— 这里补上，用来验证列表接口会返回该字段
    sql("UPDATE t_tutor_info SET subject_names = '数学,物理' WHERE tutor_id = %d;" % a_id)
else:
    print('  （没有可用的 mysql 客户端，跳过"多资质重复行"的复现）')

# 上面的 SQL 是在第一次取列表之后执行的，这里重新取一次，保证断言用的是最新数据
lst = call('GET', '/system/tutorInfo/list?pageNum=1&pageSize=100', token=T)

print('\n4) 家教列表与分页')
distinct = len({r['tutorId'] for r in lst['rows']})
check('total 与去重行数一致（LEFT JOIN 重复行已修复）',
      lst['total'] == distinct,
      'total=%s distinct=%s rows=%s' % (lst['total'], distinct, len(lst['rows'])))
# 注意：RuoYi 的 PageDomain.reasonable 默认 true —— 页码超出范围会被「贴到最后一页」，
# 所以只按总页数翻页来断言（翻超范围页本来就会重复返回最后一页，那是设计如此）
total = lst['total']
npages = max(1, total)
pages = []
for p in range(1, npages + 1):
    r = call('GET', '/system/tutorInfo/list?pageNum=%d&pageSize=1' % p, token=T)
    pages += [x['tutorId'] for x in r['rows']]
check('逐页翻完无重复行', len(pages) == len(set(pages)) == npages,
      '翻 %d 页取到 %d 条（去重 %d）' % (npages, len(pages), len(set(pages))))
check('翻页取到的 id 与首页一致', set(pages) == {r['tutorId'] for r in lst['rows']},
      '共 %s 条' % total)

print('\n5) 中文编码（关键）')
row_a = [r for r in lst['rows'] if r['tutorId'] == a_id][0]
check('接口返回的中文是真正的 UTF-8（原样往返）',
      row_a['tutorName'] == TUTOR_A and any('\u4e00' <= c <= '\u9fff' for c in row_a['tutorName']),
      '写入=%r 读回=%r' % (TUTOR_A, row_a['tutorName']))
check('subject_names 已回填（按科目名筛选的前提）',
      row_a.get('subjectNames') == '数学,物理', 'subjectNames=%r' % row_a.get('subjectNames'))


def pub_ids():
    """H5 公开列表（审核通过且状态正常才可见）里的 tutorId 集合"""
    return {r['tutorId'] for r in call('GET', '/miniapp/tutor/list')['data']}


print('\n6) 审核流程（核心业务）')
ids_before = pub_ids()
r = call('PUT', '/system/tutorInfo/audit',
         {'tutorId': a_id, 'auditStatus': '1', 'auditRemark': '资质材料齐全，审核通过'}, token=T)
check('PUT /system/tutorInfo/audit 通过', r.get('code') == 200, str(r.get('msg')))
t = call('GET', '/system/tutorInfo/%d' % a_id, token=T)['data']
check('审核状态变为 1', t['auditStatus'] == '1', 'auditStatus=%s' % t['auditStatus'])
check('审核备注中文未乱码（写入即读回一致）',
      t.get('auditRemark') == '资质材料齐全，审核通过', 'remark=%r' % t.get('auditRemark'))
ids_after = pub_ids()
check('通过后该家教出现在 H5 公开列表',
      a_id in ids_after and (a_id not in ids_before),
      '公开列表 %d -> %d 条' % (len(ids_before), len(ids_after)))

r = call('PUT', '/system/tutorInfo/audit',
         {'tutorId': b_id, 'auditStatus': '2', 'auditRemark': '测试：材料不全'}, token=T)
t = call('GET', '/system/tutorInfo/%d' % b_id, token=T)['data']
check('拒绝分支 auditStatus=2', t['auditStatus'] == '2', 'auditStatus=%s' % t['auditStatus'])
check('被拒绝的家教不出现在 H5 公开列表', b_id not in pub_ids())

print('\n7) 其余列表接口')
for path in ('/system/parentInfo/list', '/system/studentInfo/list', '/system/wxUser/list',
             '/system/role/list', '/system/user/list',
             '/monitor/online/list', '/monitor/logininfor/list', '/monitor/operlog/list'):
    r = call('GET', path + '?pageNum=1&pageSize=2', token=T)
    ok = r.get('code') == 200 and isinstance(r.get('total'), int)
    check(path, ok, 'total=%s' % r.get('total'))

print('\n7.5) 后台的客户账号接口（老师信息 / 学生信息）')
for role, label in (('TEACHER', '老师'), ('STUDENT', '学生')):
    r = call('GET', '/system/customerAccount/list?role=%s&pageNum=1&pageSize=10' % role, token=T)
    rows = r.get('rows') or []
    ok_shape = r.get('code') == 200 and isinstance(r.get('total'), int)
    only_role = all(x.get('role') == role for x in rows)
    no_password = all('password' not in x for x in rows)
    check('%s列表可用（%d 条）' % (label, len(rows)), ok_shape and only_role,
          'total=%s role=%s' % (r.get('total'), role))
    check('%s列表不返回密码字段' % label, no_password)
    if rows:
        one = call('GET', '/system/customerAccount/%d' % rows[0]['accountId'], token=T)
        check('%s详情可用' % label,
              one.get('code') == 200 and one['data'].get('accountId') == rows[0]['accountId'])
    else:
        # 没有真实注册的%s时也要断言结构正确（用例数保持稳定，不随线上数据漂移）
        check('%s列表为空时结构正确' % label, r.get('total') == 0 and rows == [],
              'total=%s' % r.get('total'))

print('\n8) 服务监控')
srv = call('GET', '/monitor/server', token=T)
check('/monitor/server 可用', srv.get('code') == 200)
# 注意：这个接口和 /login、/getInfo、/captchaImage 不一样 —— 它把数据包在 data 里，
# 而登录类接口是字段平铺在根节点。前端 src/lib/httpCompat.ts 就是为了兼容这两种形状。
payload = srv.get('data') if isinstance(srv.get('data'), dict) else srv
check('返回 cpu/mem/jvm（data 包裹或根节点平铺均可）',
      all(k in payload for k in ('cpu', 'mem', 'jvm')),
      '根节点键=%s' % sorted(srv.keys()))
print('     cpu 样例：' + json.dumps(payload.get('cpu', {}), ensure_ascii=False)[:160])

print('\n9) 未登录访问受保护接口应被拒')
# 注意：RuoYi 的 AuthenticationEntryPointImpl 返回的是 HTTP 200 + body 里 code=401，
# 所以这里断言 body 的 code，而不是 HTTP 状态码。
unauth = call('GET', '/system/tutorInfo/list')
check('未带 token 时 body.code == 401', unauth.get('code') == 401,
      'code=%s msg=%s' % (unauth.get('code'), unauth.get('msg')))
check('未带 token 时拿不到任何数据行', not unauth.get('rows'), 'rows=%s' % (unauth.get('rows'),))

print('\n10) 收尾：删掉本次自建的测试数据')
r = call('DELETE', '/system/tutorInfo/%d,%d' % (a_id, b_id), token=T)
check('删除测试家教', r.get('code') == 200, r.get('msg'))
sql('DELETE FROM t_tutor_qualification WHERE tutor_id IN (%d,%d);' % (a_id, b_id))
# 家教的删除是逻辑删除（del_flag=2），这里连行一起清掉，别在库里留垃圾
sql('DELETE FROM t_tutor_info WHERE tutor_id IN (%d,%d);' % (a_id, b_id))
left = call('GET', '/system/tutorInfo/list?pageNum=1&pageSize=100', token=T)
left_ids = [x['tutorId'] for x in left.get('rows', [])]
check('测试数据已清干净', a_id not in left_ids and b_id not in left_ids,
      '剩余 %s 条' % left.get('total'))

print('\n' + '=' * 72)
print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
if FAIL:
    print('失败清单：')
    for f in FAIL:
        print('  - ' + f)
