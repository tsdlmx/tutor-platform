# -*- coding: utf-8 -*-
"""
前后端联调验证：走 Vite dev server 的 /dev-api 代理去打真实 Spring Boot 后端。

这个脚本回答的问题是「浏览器里点下去能不能通」，而不是「后端自己能不能跑」：
前端所有请求都带 /dev-api 前缀，由 vite.config.ts 的 proxy 转发到后端并剥掉前缀。
所以必须从前端端口验证，才能真正证明联调是通的。
（端口沿用历史值 5173；本机改成了 12500，可用 TUTOR_WEB_BASE 覆盖。）
"""
import json
import os
import subprocess
import ssl
import urllib.request
import urllib.error

WEB = os.environ.get('TUTOR_WEB_BASE', 'http://127.0.0.1:12500')
# 开发模式走 /dev-api；打包后用 vite preview 伺服生产构建，走 .env.production 的 /prod-api
API = WEB + os.environ.get('TUTOR_API_PREFIX', '/dev-api')

# 后台管理员口令不写在仓库里：跑验证前先 export（见 PORTING-LINUX.md 第一节）
# 站点默认是 HTTP；若用 WEB_TLS=1 起了自签 HTTPS，这里也不会因证书链报错
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

ADMIN_USER = os.environ.get('TUTOR_ADMIN_USER', 'admin')
ADMIN_PASSWORD = os.environ.get('TUTOR_ADMIN_PASSWORD')
if not ADMIN_PASSWORD:
    raise SystemExit('请先设置 TUTOR_ADMIN_PASSWORD（后台管理员口令）')
OK, FAIL = [], []


# ---------------------------------------------------------------- 清理工具
# 测试数据要真删干净只能直接连库：
#   * 家教的删除是逻辑删除（del_flag=2），API 删完行还在表里；
#   * 客户账号根本没有删除接口。
# 找不到 mysql 客户端就跳过（只是少清理，不影响任何断言）。
MYSQL_BIN = os.environ.get('TUTOR_MYSQL') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'runtime-linux', 'mysql', 'bin', 'mysql')


def purge(statement):
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


def check(label, cond, detail=''):
    (OK if cond else FAIL).append(label)
    print(('  PASS  ' if cond else '  FAIL  ') + label + (('  -> ' + detail) if detail else ''))


def req(method, url, body=None, token=None, timeout=30):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    headers = {'Content-Type': 'application/json;charset=utf-8'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=timeout, context=SSL_CTX) as resp:
        return resp.status, resp.read()


def req_json(*a, **kw):
    status, raw = req(*a, **kw)
    return status, json.loads(raw.decode('utf-8'))


print('=' * 72)
print('A) 前端页面（Vite dev server :5173）')
for path in ('/', '/admin/login', '/admin/dashboard', '/admin/tutor', '/tutors', '/tutors/1'):
    try:
        status, raw = req('GET', WEB + path)
        html = raw.decode('utf-8', 'replace')
        is_shell = '<div id="root">' in html or 'id="root"' in html
        check('GET %-18s' % path, status == 200 and is_shell, 'HTTP %s, SPA 挂载点=%s' % (status, is_shell))
    except Exception as e:
        check('GET %-18s' % path, False, repr(e))

print('\nB) 代理是否真的转发到后端（关键）')
try:
    status, cap = req_json('GET', API + '/captchaImage')
    check('/dev-api/captchaImage 经代理可达', cap.get('code') == 200,
          'captchaEnabled=%s' % cap.get('captchaEnabled'))
except Exception as e:
    check('/dev-api/captchaImage 经代理可达', False, repr(e))
    cap = {}

try:
    status, login = req_json('POST', API + '/login',
                             {'username': ADMIN_USER, 'password': ADMIN_PASSWORD})
    check('/dev-api/login 经代理登录成功', bool(login.get('token')),
          'HTTP %s token 长度 %s' % (status, len(login.get('token') or '')))
    TOKEN = login.get('token')
except Exception as e:
    check('/dev-api/login 经代理登录成功', False, repr(e))
    TOKEN = None

if TOKEN:
    try:
        s, info = req_json('GET', API + '/getInfo', token=TOKEN)
        check('/dev-api/getInfo 取到当前用户', info.get('user', {}).get('userName') == 'admin',
              'roles=%s' % info.get('roles'))
    except Exception as e:
        check('/dev-api/getInfo 取到当前用户', False, repr(e))

    # 预置演示数据已清空 —— 先经代理建一位「审核通过」的家教，
    # 后面的列表校验与公开列表校验都用它，跑完在最后删掉。
    try:
        req_json('POST', API + '/system/tutorInfo', {
            'tutorName': '联调自测老师',
            'province': '测试省', 'city': '测试市',
            'subjectIds': '2', 'subjectNames': '数学',
            'auditStatus': '1', 'status': '0',
        }, token=TOKEN)
        s, page = req_json('GET', API + '/system/tutorInfo/list?pageNum=1&pageSize=100', token=TOKEN)
        pub_id = next((r['tutorId'] for r in (page.get('rows') or [])
                       if r.get('tutorName') == '联调自测老师'), None)
        check('经代理新增一位审核通过的家教（联调用）', bool(pub_id), 'tutorId=%s' % pub_id)
    except Exception as e:
        check('经代理新增一位审核通过的家教（联调用）', False, repr(e))

    try:
        s, lst = req_json('GET', API + '/system/tutorInfo/list?pageNum=1&pageSize=5', token=TOKEN)
        rows = lst.get('rows') or []
        total = lst.get('total') or 0
        names = [r.get('tutorName') for r in rows]
        # 分页语义：一页最多 5 条，不足则返回全部
        check('/dev-api/system/tutorInfo/list 返回数据',
              lst.get('code') == 200 and len(rows) == min(5, total) and total >= 1,
              'total=%s rows=%s' % (total, len(rows)))
        check('经代理返回的中文未乱码',
              bool(names) and all('\u4e00' <= c <= '\u9fff' for n in names for c in n),
              '样例：' + ' / '.join(names[:3]))
    except Exception as e:
        check('/dev-api/system/tutorInfo/list 返回数据', False, repr(e))

    try:
        s, srv = req_json('GET', API + '/monitor/server', token=TOKEN)
        payload = srv.get('data') if isinstance(srv.get('data'), dict) else srv
        check('/dev-api/monitor/server 可用（data 包裹已兼容）', 'cpu' in payload,
              'cpuNum=%s' % payload.get('cpu', {}).get('cpuNum'))
    except Exception as e:
        check('/dev-api/monitor/server 可用（data 包裹已兼容）', False, repr(e))

try:
    s, pub = req_json('GET', API + '/miniapp/tutor/list')
    pub_rows = pub.get('data') or []
    shown = {r.get('tutorId') for r in pub_rows}
    check('/dev-api/miniapp/tutor/list 公开接口免登录可用',
          pub.get('code') == 200 and isinstance(pub_rows, list)
          and (pub_id is None or pub_id in shown),
          '返回 %s 条已通过审核的家教' % len(pub_rows))
except Exception as e:
    check('/dev-api/miniapp/tutor/list 公开接口免登录可用', False, repr(e))

# 收尾：删掉自建的联调数据
if TOKEN and pub_id:
    try:
        req_json('DELETE', API + '/system/tutorInfo/%d' % pub_id, token=TOKEN)
    except Exception:
        pass
    # 逻辑删除后行还在表里，直接清掉
    purge('DELETE FROM t_tutor_qualification WHERE tutor_id = %d; '
          'DELETE FROM t_tutor_info WHERE tutor_id = %d;' % (pub_id, pub_id))

print('\nC) 生产构建产物')
dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tutor-web', 'dist')
check('dist/index.html 存在', os.path.isfile(os.path.join(dist, 'index.html')))
assets = os.path.join(dist, 'assets')
if os.path.isdir(assets):
    files = os.listdir(assets)
    check('dist/assets 有构建产物', len(files) >= 4, '%d 个文件：%s' % (len(files), ', '.join(sorted(files)[:6])))
    check('包含 JS 与 CSS', any(f.endswith('.js') for f in files) and any(f.endswith('.css') for f in files))

print('\n' + '=' * 72)
print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
for f in FAIL:
    print('  - ' + f)
