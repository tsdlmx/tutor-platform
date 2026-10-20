# -*- coding: utf-8 -*-
"""
用 Chrome DevTools Protocol 驱动真实浏览器内核，做权威验证。

为什么不用 `chrome --screenshot`：
  那个方式对 SPA 不可靠 —— 它不等网络请求和 React 渲染，截图时机由
  --virtual-time-budget 决定，实测同一批页面里有几张是纯白（内容还没挂载）。
  这里改成 CDP：显式等页面元素出现、可读控制台报错、可执行 JS 操作登录。

产出：
  * docs/screenshots/*.png      —— 可靠的页面截图
  * 控制台错误清单              —— 能发现"白屏但构建通过"这类问题
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websocket  # websocket-client

def _find_browser():
    """Chrome 或 Edge 都行（两者都是 Chromium 内核，CDP 协议一致）。"""
    env = os.environ.get('TUTOR_CHROME')
    if env and os.path.exists(env):
        return env
    for c in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
              r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(c):
            return c
    return None


CHROME = _find_browser()
PORT = 9333
BASE = os.environ.get('TUTOR_WEB_BASE', 'http://127.0.0.1:12500')

ADMIN_USER = os.environ.get('TUTOR_ADMIN_USER', 'admin')
ADMIN_PASSWORD = os.environ.get('TUTOR_ADMIN_PASSWORD')
if not ADMIN_PASSWORD:
    raise SystemExit('请先设置 TUTOR_ADMIN_PASSWORD（后台管理员口令）')
# 后端地址：本脚本要自己造/删测试数据（预置演示数据已清空），所以直连后端
API_BASE = os.environ.get('TUTOR_API_BASE', 'http://127.0.0.1:12501')
SHOTS = os.environ.get('TUTOR_SHOTS') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'screenshots')
# 临时 profile 放系统临时目录，避免写死在某一台机器的路径上
# 每轮用独立 profile：复用同一个 profile 会把上一轮登录后的 admin token 留在
# localStorage 里，导致 /admin/login 直接重定向到概览页、登录表单根本渲染不出来
# （表现为「找不到输入框」，看着像页面坏了，其实是测试之间没隔离）
PROFILE = os.path.join(tempfile.gettempdir(), 'tutor-verify-cdp-profile-%d' % os.getpid())

if not CHROME:
    raise SystemExit('找不到 Chrome / Edge。请安装其中之一，或用环境变量 TUTOR_CHROME 指定浏览器路径。')


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, max_size=200 * 1024 * 1024)
        self.n = 0

    def send(self, method, **params):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError('%s -> %s' % (method, msg['error']))
                return msg.get('result', {})

    def drain_events(self):
        """取出已到达的事件（不阻塞）"""
        events = []
        self.ws.settimeout(0.05)
        try:
            while True:
                events.append(json.loads(self.ws.recv()))
        except Exception:
            pass
        finally:
            self.ws.settimeout(30)
        return events

    def eval_js(self, expr):
        r = self.send('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')

    def goto(self, url, timeout=60):
        """导航到 url，并保证之后 eval_js 读到的是【新文档】。

        踩过的坑：Page.navigate 返回时导航可能还没提交，此时 Runtime.evaluate
        仍然作用在【旧文档】上。旧文档若是已渲染过的页面，紧接着的
        wait_for("#root 有子节点") 会立刻判定为真，于是截图截到未渲染的空白页，
        报出假的"页面渲染失败"（实测因此误报了 12 项）。
        解法：导航前在旧文档埋一个哨兵，导航后等它消失 —— 说明新文档已接管。
        """
        try:
            self.eval_js('window.__navSentinel = 1;')
        except Exception:
            pass
        self.send('Page.navigate', url=url)
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.eval_js('typeof window.__navSentinel === "undefined"'):
                    if self.eval_js('document.readyState') == 'complete':
                        return True
            except Exception:
                pass
            time.sleep(0.15)
        return False

    def wait_for(self, expr, timeout=25):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.eval_js(expr):
                    return True
            except Exception:
                pass
            time.sleep(0.25)
        return False

    def shot(self, path, full=False):
        params = {'format': 'png'}
        if full:
            params['captureBeyondViewport'] = True
        data = self.send('Page.captureScreenshot', **params)['data']
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        return os.path.getsize(path)


# ---------------------------------------------------------------- 清理工具
# 家教的删除是逻辑删除（del_flag=2），API 删完行还在表里，要真删干净只能直接连库。
# 找不到 mysql 客户端就跳过（只是少清理，不影响断言）。
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


os.makedirs(SHOTS, exist_ok=True)
for f in os.listdir(SHOTS):
    if f.endswith('.png'):
        os.remove(os.path.join(SHOTS, f))

proc = subprocess.Popen([
    CHROME, '--headless=new', '--ignore-certificate-errors', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--remote-debugging-port=%d' % PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + PROFILE,
    '--window-size=1600,1000', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    ws_url = None
    for _ in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:%d/json/list' % PORT, timeout=3) as r:
                targets = json.loads(r.read().decode())
            page = [t for t in targets if t.get('type') == 'page']
            if page:
                ws_url = page[0]['webSocketDebuggerUrl']
                break
        except Exception:
            pass
        time.sleep(0.5)
    if not ws_url:
        raise SystemExit('无法连接 Chrome 调试端口')

    c = CDP(ws_url)
    c.send('Page.enable')
    c.send('Runtime.enable')
    c.send('Log.enable')

    console_errors = []
    OK, FAIL = [], []

    def check(label, cond, detail=''):
        (OK if cond else FAIL).append(label)
        print(('  PASS  ' if cond else '  FAIL  ') + label + (('  -> ' + detail) if detail else ''))

    def collect_errors(tag):
        for ev in c.drain_events():
            m = ev.get('method')
            p = ev.get('params', {})
            if m == 'Runtime.exceptionThrown':
                d = p.get('exceptionDetails', {})
                console_errors.append('[%s] EXCEPTION %s' % (tag, (d.get('exception') or {}).get('description') or d.get('text')))
            elif m == 'Runtime.consoleAPICalled' and p.get('type') == 'error':
                console_errors.append('[%s] console.error %s' % (tag, ' '.join(str(a.get('value')) for a in p.get('args', []))))
            elif m == 'Log.entryAdded' and p.get('entry', {}).get('level') == 'error':
                console_errors.append('[%s] LOG %s' % (tag, p['entry'].get('text')))

    # ---------- 1) 登录页 ----------
    print('=' * 72)
    print('1) 登录页 /admin/login （真实浏览器渲染 + 控制台检查）')
    c.goto(BASE + '/admin/login')
    mounted = c.wait_for("document.querySelector('#root') && document.querySelector('#root').children.length > 0", 120)
    has_form = c.wait_for("!!document.querySelector('input')", 20)
    # 断言当前真的停在目标路由上：SPA 客户端跳转会让"看起来渲染成功"变成假象
    path_now = c.eval_js('location.pathname')
    check('停留在 /admin/login', path_now == '/admin/login', '实际=%s' % path_now)
    check('React 已挂载（#root 有子节点）', bool(mounted))
    check('登录表单已渲染（存在 input）', has_form)
    n_inputs = c.eval_js("document.querySelectorAll('input').length")
    btn_text = c.eval_js("(document.querySelector('button[type=submit]')||{}).textContent || ''")
    check('有账号/密码输入框', (n_inputs or 0) >= 2, 'input 数量=%s' % n_inputs)
    check('有提交按钮', bool((btn_text or '').strip()), '按钮文字=%r' % (btn_text or '').strip())
    time.sleep(1.0)
    size = c.shot(os.path.join(SHOTS, '01-admin-login.png'))
    check('登录页截图非空白', size > 20000, '%d 字节' % size)
    collect_errors('login')

    # ---------- 2) 用真实交互登录 ----------
    print('\n2) 真实交互登录（填入表单并点击提交）')
    c.eval_js("""
      (function(){
        const set = (el, v) => {
          const proto = Object.getPrototypeOf(el);
          const d = Object.getOwnPropertyDescriptor(proto, 'value');
          d.set.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const inputs = document.querySelectorAll('input');
        set(inputs[0], %s);
        set(inputs[1], %s);
        return true;
      })()
    """ % (json.dumps(ADMIN_USER), json.dumps(ADMIN_PASSWORD)))
    time.sleep(0.4)
    c.eval_js("(document.querySelector('button[type=submit]')||{click:()=>{}}).click()")
    logged_in = c.wait_for(
        "location.pathname.indexOf('/admin') === 0 && location.pathname !== '/admin/login'", 25)
    path_now = c.eval_js('location.pathname')
    check('点击登录后跳转成功', logged_in, '当前路径=%s' % path_now)
    token_set = c.eval_js("!!localStorage.getItem('tutor-admin-token')")
    check('token 已写入 localStorage', token_set)
    collect_errors('login-submit')

    # ---------- 2.5) 自建 H5 详情页需要的数据 ----------
    # 预置演示数据已清空，所以这里自己造一位「审核通过」的家教；
    # 否则 /h5/tutor/{id} 详情页没有可看的对象，这条断言就变成在测 404 页了。
    print('\n2.5) 造一位家教给 H5 详情页用（跑完删掉）')
    admin_token = c.eval_js("localStorage.getItem('tutor-admin-token')")
    fixture_id = None

    def api(method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
        req = urllib.request.Request(
            API_BASE + path, data=data, method=method,
            headers={'Content-Type': 'application/json;charset=utf-8',
                     'Authorization': 'Bearer ' + (admin_token or '')})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))

    try:
        api('POST', '/system/tutorInfo', {
            'tutorName': '浏览器自测老师',
            'province': '测试省', 'city': '测试市', 'district': '测试区',
            'school': '验证大学', 'major': '数学',
            'subjectIds': '2', 'subjectNames': '数学',
            'teachMode': 'offline,online', 'hourlyRate': 150,
            'intro': '浏览器验证脚本创建的临时数据，跑完即删。',
            'auditStatus': '1', 'status': '0',
        })
        page = api('GET', '/system/tutorInfo/list?pageNum=1&pageSize=100')
        fixture_id = next((r['tutorId'] for r in (page.get('rows') or [])
                           if r.get('tutorName') == '浏览器自测老师'), None)
    except Exception as e:
        print('  造数据失败：%r' % e)
    check('自建一位家教（供家教详情页使用）', bool(fixture_id), 'tutorId=%s' % fixture_id)

    # ---------- 3) PC 后台各页 ----------
    print('\n3) PC 管理后台页面')
    # marker 要选【页面正文里独有】的词：侧边栏常驻"家教信息/家长信息/服务监控"，
    # 拿它们当标记的话，就算落到 404 页也会"匹配成功"，等于没测。
    pages = [
        ('02-admin-dashboard', '/admin/dashboard', '科目分布'),
        ('03-admin-tutor-audit', '/admin/tutor', '可授科目'),
        ('04-admin-teacher', '/admin/teacher', '老师'),
        ('05-admin-student', '/admin/student', '学生'),
        ('06-admin-post-audit', '/admin/post', '才会出现在广场'),
        ('06-admin-monitor', '/admin/server', 'JVM'),
    ]
    # 截图前先等异步数据到位，否则会截到"加载中"的骨架屏
    # （服务监控的 /monitor/server 比较慢，第一版就截到了满屏转圈）。
    NO_LOADING = "document.body.innerText.indexOf('加载中') < 0"
    for name, path, marker in pages:
        c.goto(BASE + path)
        c.wait_for("document.querySelector('#root') && document.querySelector('#root').children.length > 0", 90)
        if marker:
            c.wait_for("document.body.innerText.indexOf(%s) >= 0" % json.dumps(marker), 25)
        else:
            c.wait_for("document.body.innerText.length > 200", 25)
        c.wait_for(NO_LOADING, 30)
        # 服务监控是卡片式布局，等它把 CPU 使用率渲染出来再截
        if path == '/admin/server':
            c.wait_for("document.body.innerText.indexOf('已用百分比') >= 0 && "
                       "document.body.innerText.indexOf('核') >= 0", 30)
        time.sleep(1.4)
        png = os.path.join(SHOTS, name + '.png')
        sz = c.shot(png)
        body_len = c.eval_js('document.body.innerText.length')
        actual = c.eval_js('location.pathname')
        still_loading = c.eval_js("document.body.innerText.indexOf('加载中') >= 0")
        check('%-26s 渲染出内容' % path,
              sz > 20000 and (body_len or 0) > 100 and actual == path and not still_loading,
              '截图 %d 字节, 文本 %s 字, 路径 %s, 仍在加载=%s' % (sz, body_len, actual, still_loading))
        collect_errors(path)

    # 侧栏的「帖子审核」入口必须在，并且是能点的链接
    sidebar_ok = c.eval_js("""
    (function(){
      var a = Array.prototype.slice.call(document.querySelectorAll('nav a'))
        .filter(function(x){ return (x.getAttribute('href') || '') === '/admin/post'; })[0];
      if (!a) return 'not-found';
      return 'ok:' + (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 24);
    })()
    """)
    check('侧栏有「帖子审核」入口', str(sidebar_ok).startswith('ok'), sidebar_ok)

    # 切换到移动视口看后台的响应式
    print('\n4) 客户侧「找家教」页面（390x844 视口）')
    c.send('Emulation.setDeviceMetricsOverride', width=390, height=844,
           deviceScaleFactor=2, mobile=True)
    for name, path, marker in [
        ('06-tutors-list', '/tutors', '位老师'),
        ('07-tutor-detail', '/tutors/%s' % (fixture_id or 1), None),
    ]:
        c.goto(BASE + path)
        c.wait_for("document.querySelector('#root') && document.querySelector('#root').children.length > 0", 90)
        if marker:
            c.wait_for("document.body.innerText.indexOf(%s) >= 0" % json.dumps(marker), 25)
        else:
            c.wait_for("document.body.innerText.length > 150", 25)
        time.sleep(1.4)
        png = os.path.join(SHOTS, name + '.png')
        sz = c.shot(png)
        body_len = c.eval_js('document.body.innerText.length')
        actual = c.eval_js('location.pathname')
        check('%-24s 渲染出内容' % path,
              sz > 15000 and (body_len or 0) > 80 and actual == path,
              '截图 %d 字节, 文本 %s 字, 路径 %s' % (sz, body_len, actual))
        collect_errors(path)

    # ---------- 5) 控制台错误汇总 ----------
    print('\n5) 浏览器控制台错误')
    collect_errors('final')
    # 忽略后端未实现接口造成的 404（这是已知的、有意为之的降级）
    real = [e for e in console_errors if 'miniapp/home' not in e and 'parent/grades' not in e]
    if real:
        print('  发现 %d 条：' % len(real))
        for e in real[:15]:
            print('   - ' + e[:220])
    check('页面运行时无 JS 异常', len(real) == 0, '%d 条' % len(real))

    # ---------- 收尾：删掉自建的临时数据 ----------
    if fixture_id:
        try:
            api('DELETE', '/system/tutorInfo/%d' % fixture_id)
            purge('DELETE FROM t_tutor_qualification WHERE tutor_id = %d; '
                  'DELETE FROM t_tutor_info WHERE tutor_id = %d;' % (fixture_id, fixture_id))
            print('  已删除临时家教 tutorId=%s' % fixture_id)
        except Exception as e:
            print('  删除临时数据失败：%r' % e)

    print('\n' + '=' * 72)
    print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
    for f in FAIL:
        print('  - ' + f)
    print('\n截图目录：' + SHOTS)
    for f in sorted(os.listdir(SHOTS)):
        print('  %-28s %6.1f KB' % (f, os.path.getsize(os.path.join(SHOTS, f)) / 1024))
finally:
    proc.terminate()
    shutil.rmtree(PROFILE, ignore_errors=True)
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
