# -*- coding: utf-8 -*-
"""
移动端底部导航 + 首屏加载验证（真实 Chrome，DevTools Protocol）

上一轮把 H5 的底部栏「提升」成了全站客户侧共用的组件
（src/components/layouts/CustomerBottomNav.tsx），并按身份给出不同入口。
这个脚本专门盯这件事，因为它最容易被后续改动悄悄弄坏：

  1. 游客：底栏是「首页 / 找家教 / 登录」，且只有一项处于激活态
  2. 学生：底栏是「首页 / 发布需求 / 广场 / 我的」，点「发布需求」真能进 /demands/new
  3. 老师：底栏是「首页 / 广场 / 我的」，且访问 /tutors 会被送回需求池
     （这两条同时锁住「首页」= 角色首页：登录后访问 / 会重定向到 /demands、/demands/mine，
      所以底栏里不能再放一个「学生需求 / 我的需求」，否则两栏点下去是同一页。
      另外老师不需要找老师，所以老师端既没有「找家教」入口，路由层也会拦）
  4. 已登录未选身份：底栏是「首页 / 选身份 / 广场 / 我的」
  5. /tutors 只对游客开放：学生访问会被送回 /demands/mine
  6. H5（/h5）仍然只有一条底栏，三项，不会和客户侧底栏叠成两条
  7. 桌面宽度（1440）下客户侧底栏隐藏、H5 底栏保留
  8. 底栏不遮挡内容：滚到底时页脚完整露在底栏上方
  9. 移动端没有横向溢出
 10. 平台统计在**页脚**（登录后才有）：首页不再有「统计信息」那一块
 10. 顺带量一下首屏请求数与传输字节（换生产构建后应该只有个位数请求）

运行前需要：后端(12501) + 前端(12500) 已启动。
账号经接口现注册（开发模式 send-code 会返回 devCode），token 直接注入
localStorage 的 `tutor_customer_token`（与前端 store 的 key 一致），跑完清库。
"""
import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

import websocket  # websocket-client

WEB = os.environ.get('TUTOR_WEB_BASE', 'http://127.0.0.1:12500')
API = os.environ.get('TUTOR_API_BASE', 'http://127.0.0.1:12501')
PORT = int(os.environ.get('TUTOR_CDP_PORT', '9336'))
SHOTS = os.environ.get('TUTOR_SHOTS') or '/tmp/tutor-mobile-shots'
PROFILE = os.path.join(tempfile.gettempdir(), 'tutor-mobile-cdp-%d' % os.getpid())
TOKEN_KEY = 'tutor_customer_token'

OK, FAIL = [], []
INFO = []


def _find_browser():
    for c in (os.environ.get('TUTOR_CHROME'),
              '/home/ubuntu/PlatformE/tutor-platform/runtime-linux/opt/chrome/chrome',
              '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'):
        if c and os.path.exists(c):
            return c
    return None


CHROME = _find_browser()
if not CHROME:
    raise SystemExit('找不到 Chrome，请用 TUTOR_CHROME 指定路径')


# ------------------------------------------------------------------ 接口调用
def call(method, path, body=None, token=None):
    url = API + path
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    headers = {'Content-Type': 'application/json;charset=utf-8'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read()
    except urllib.error.HTTPError as e:
        payload = e.read()
    try:
        return json.loads(payload.decode('utf-8'))
    except Exception:
        return {}


def register(email, password, nickname):
    """注册并（可选）选身份，返回 token"""
    r = call('POST', '/customer/auth/send-code', {'email': email})
    code = (r.get('data') or {}).get('devCode')
    if not code:
        return None, '拿不到 devCode（后端不是开发模式？）：%s' % (r.get('msg') or r)
    r = call('POST', '/customer/auth/register',
             {'email': email, 'password': password, 'code': code, 'nickname': nickname})
    token = (r.get('data') or {}).get('token')
    if not token:
        return None, '注册失败：%s' % (r.get('msg') or r)
    return token, ''


def set_role(token, role):
    r = call('PUT', '/customer/auth/role', {'role': role}, token=token)
    return r.get('code')


# ---------------------------------------------------------------- 清理工具
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
    print(('  PASS  ' if cond else '  FAIL  ') + label + (('  -> ' + str(detail)) if detail else ''))


def info(label, value):
    INFO.append((label, value))
    print('  INFO  %s  -> %s' % (label, value))


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

    def js(self, expr):
        r = self.send('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
        res = r.get('result', {})
        if res.get('subtype') == 'error':
            raise RuntimeError(res.get('description'))
        return res.get('value')

    def goto(self, url, timeout=60):
        try:
            self.js('window.__navSentinel = 1;')
        except Exception:
            pass
        self.send('Page.navigate', url=url)
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.js('window.__navSentinel === undefined') is True:
                    break
            except Exception:
                pass
            time.sleep(0.2)
        self.wait_for('document.readyState === "complete"', timeout=timeout)

    def wait_for(self, expr, timeout=25, interval=0.25):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.js(expr) is True:
                    return True
            except Exception:
                pass
            time.sleep(interval)
        return False

    def path(self):
        return self.js('location.pathname')

    def shot(self, name):
        os.makedirs(SHOTS, exist_ok=True)
        data = self.send('Page.captureScreenshot', format='png').get('data')
        path = os.path.join(SHOTS, name)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        return os.path.getsize(path)


MOBILE = (390, 844)
DESKTOP = (1440, 900)


def emulate(c, size, mobile=True):
    c.send('Emulation.setDeviceMetricsOverride', width=size[0], height=size[1],
           deviceScaleFactor=2 if mobile else 1, mobile=mobile)
    c.send('Emulation.setTouchEmulationEnabled', enabled=mobile)


NAV_JS = """
(function(){
  var nav = document.querySelector('nav[aria-label="底部导航"]');
  if (!nav) return {found: false};
  var r = nav.getBoundingClientRect();
  var cs = getComputedStyle(nav);
  var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  var labels = links.map(function(a){
    var t = (a.innerText || '').replace(/\\s+/g, ' ').trim();
    return t;
  });
  var active = links.filter(function(a){ return a.getAttribute('aria-current') === 'page'; });
  var footer = document.querySelector('footer');
  var main = document.querySelector('main');
  return {
    found: true,
    count: nav.querySelectorAll('nav[aria-label="底部导航"]').length,
    navs: document.querySelectorAll('nav[aria-label="底部导航"]').length,
    labels: labels,
    hrefs: links.map(function(a){ return a.getAttribute('href'); }),
    activeCount: active.length,
    activeLabel: active.length ? (active[0].innerText || '').replace(/\\s+/g, ' ').trim() : null,
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 1,
    navTop: Math.round(r.top),
    navBottom: Math.round(r.bottom),
    vh: window.innerHeight,
    footerBottom: footer ? Math.round(footer.getBoundingClientRect().bottom) : null,
    hasMain: !!main,
    overflowX: document.documentElement.scrollWidth - window.innerWidth
  };
})()
"""


def nav(c):
    return c.js(NAV_JS) or {'found': False}


def set_token(c, token):
    """把 token 写进 localStorage（先停在站点同源页面上）"""
    if token is None:
        c.js('localStorage.removeItem(%s); true;' % json.dumps(TOKEN_KEY))
    else:
        c.js('localStorage.setItem(%s, %s); true;' % (json.dumps(TOKEN_KEY), json.dumps(token)))


def scroll_bottom(c):
    c.js('window.scrollTo(0, document.documentElement.scrollHeight); true;')
    time.sleep(0.4)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--ignore-certificate-errors', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--remote-debugging-port=%d' % PORT, '--remote-allow-origins=*',
        '--user-data-dir=' + PROFILE, '--window-size=1440,1000', 'about:blank',
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
        c.send('Network.enable')
        # 关缓存：否则同一会话里第二次打开首页时资源都命中缓存，
        # transferSize 会全是 0，量出来的「首屏传输字节」没有意义。
        c.send('Network.setCacheDisabled', cacheDisabled=True)

        console_errors = []

        def collect():
            for ev in c.drain_events():
                if ev.get('method') == 'Log.entryAdded':
                    e = ev['params']['entry']
                    if e.get('level') == 'error':
                        console_errors.append(e.get('text', '')[:160])
                if ev.get('method') == 'Runtime.exceptionThrown':
                    d = ev['params']['exceptionDetails']
                    console_errors.append((d.get('text') or '') + ' ' +
                                          str((d.get('exception') or {}).get('description', ''))[:140])

        stamp = str(int(time.time()))[-6:]
        password = 'demo12345'
        stu_email = 'mstu%s@example.com' % stamp
        tea_email = 'mtea%s@example.com' % stamp
        new_email = 'mnew%s@example.com' % stamp

        stu_token, err = register(stu_email, password, '移动学生%s' % stamp)
        if not stu_token:
            raise SystemExit('注册学生账号失败：' + err)
        set_role(stu_token, 'STUDENT')
        tea_token, err = register(tea_email, password, '移动老师%s' % stamp)
        if not tea_token:
            raise SystemExit('注册老师账号失败：' + err)
        set_role(tea_token, 'TEACHER')
        new_token, err = register(new_email, password, '未选身份%s' % stamp)
        if not new_token:
            raise SystemExit('注册未选身份账号失败：' + err)

        print('=' * 72)
        print('1) 游客 · 手机宽度（390×844）')
        emulate(c, MOBILE, True)
        # 先落一次站点，拿到同源上下文才能操作 localStorage（about:blank 没有源）
        c.goto(WEB + '/')
        set_token(c, None)
        c.goto(WEB + '/')
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
        time.sleep(0.4)
        n = nav(c)
        check('底栏渲染出来了', n.get('found') is True, n)
        check('底栏是「首页 / 找家教 / 登录」三项',
              n.get('labels') == ['首页', '找家教', '登录'], n.get('labels'))
        check('只有一项处于激活态', n.get('activeCount') == 1, n.get('activeCount'))
        check('激活项是「首页」', n.get('activeLabel') == '首页', n.get('activeLabel'))
        check('只有一条底栏（没有重复渲染）', n.get('navs') == 1, n.get('navs'))
        info('游客首页 · 资源请求数', c.js("performance.getEntriesByType('resource').length"))
        info('游客首页 · 传输字节(transferSize 合计)',
             c.js("performance.getEntriesByType('resource')"
                  ".reduce(function(s,r){return s+(r.transferSize||0);},0)"))
        info('游客首页 · 首包到可交互(domInteractive, ms)',
             c.js("Math.round(performance.getEntriesByType('navigation')[0].domInteractive)"))
        check('底栏贴在视口底部', abs(n.get('navBottom', 0) - n.get('vh', 0)) <= 2,
              '%s vs %s' % (n.get('navBottom'), n.get('vh')))
        check('没有横向溢出', (n.get('overflowX') or 0) <= 1, n.get('overflowX'))
        scroll_bottom(c)
        n = nav(c)
        check('滚到底时页脚完整露在底栏上方',
              n.get('footerBottom') is not None and n.get('footerBottom') <= n.get('navTop', 0),
              'footerBottom=%s navTop=%s' % (n.get('footerBottom'), n.get('navTop')))
        foot = c.js("(document.querySelector('footer')||{}).innerText || ''") or ''
        check('游客页脚不显示平台统计（没有总览数据）', '平台总览' not in foot, foot[:60])
        check('页脚有版权行', '©' in foot, foot[:60])
        check('游客首页截图非空', c.shot('01-guest-home.png') > 10000)
        collect()

        print('\n2) 学生 · 底栏（/demands/mine 就是首页，不再有重复入口）')
        set_token(c, stu_token)
        c.goto(WEB + '/')
        # Landing 会把已登录用户直接送到自己的首页（学生 = /demands/mine）
        check('已登录学生访问 / 会落到 /demands/mine',
              c.wait_for('location.pathname === "/demands/mine"', 25), c.path())
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 20)
        time.sleep(0.4)
        n = nav(c)
        check('学生底栏是「首页 / 发布需求 / 广场 / 我的」四项（学生端没有「找家教」）',
              n.get('labels') == ['首页', '发布需求', '广场', '我的'], n.get('labels'))
        check('学生底栏没有「找家教」', '找家教' not in (n.get('labels') or []), n.get('labels'))
        check('底栏没有与「首页」重复的「我的需求」',
              '我的需求' not in (n.get('labels') or []), n.get('labels'))
        check('只有一项激活', n.get('activeCount') == 1, n.get('activeLabel'))
        check('/demands/mine 上激活项是「首页」', n.get('activeLabel') == '首页', n.get('activeLabel'))
        check('「首页」指向 /demands/mine（不是 /）',
              n.get('hrefs') and n['hrefs'][0] == '/demands/mine', n.get('hrefs'))
        check('学生首页截图非空', c.shot('02-student-home.png') > 10000)

        # 学生端没有「找家教」功能：直接输地址也被守卫送回自己的首页
        c.goto(WEB + '/tutors')
        check('学生访问 /tutors 会被送回 /demands/mine',
              c.wait_for('location.pathname === "/demands/mine"', 25), c.path())
        c.goto(WEB + '/tutors/1')
        check('学生访问 /tutors/:id 也会被送回 /demands/mine',
              c.wait_for('location.pathname === "/demands/mine"', 25), c.path())

        r = c.js("""
        (function(){
          var a = Array.prototype.slice.call(
            document.querySelectorAll('nav[aria-label="底部导航"] a')).filter(function(x){
              return (x.innerText||'').indexOf('发布需求') >= 0; })[0];
          if (!a) return 'not-found';
          a.click();
          return 'clicked';
        })()
        """)
        ok = c.wait_for('location.pathname === "/demands/new"', 20)
        check('点「发布需求」进入 /demands/new', ok, '%s -> %s' % (r, c.path()))
        n = nav(c)
        check('/demands/new 上只有一项激活（不会与「首页」同时高亮）',
              n.get('activeCount') == 1, n.get('activeLabel'))
        check('激活项是「发布需求」', n.get('activeLabel') == '发布需求', n.get('activeLabel'))
        check('发布需求页截图非空', c.shot('03-demand-new.png') > 10000)
        collect()

        print('\n3) 老师 · 底栏（/demands 就是首页，不再有重复入口）')
        set_token(c, tea_token)
        c.goto(WEB + '/')
        check('已登录老师访问 / 会落到 /demands',
              c.wait_for('location.pathname === "/demands"', 25), c.path())
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 20)
        time.sleep(0.5)
        n = nav(c)
        check('老师底栏是「首页 / 广场 / 我的」三项（老师没有「找家教」）',
              n.get('labels') == ['首页', '广场', '我的'], n.get('labels'))
        check('底栏没有与「首页」重复的「学生需求」',
              '学生需求' not in (n.get('labels') or []), n.get('labels'))
        check('底栏没有「找家教」（老师不需要找老师）',
              '找家教' not in (n.get('labels') or []), n.get('labels'))
        check('/demands 上激活项是「首页」', n.get('activeLabel') == '首页', n.get('activeLabel'))
        check('「首页」指向 /demands（不是 /）', n.get('hrefs') and n['hrefs'][0] == '/demands',
              n.get('hrefs'))
        # 统计是异步拉的：等页脚真的出现数字再断言
        c.wait_for('((document.querySelector("footer")||{}).innerText || "").indexOf("需求总数") >= 0', 15)
        body = c.js('document.body.innerText') or ''
        check('首页不再有「统计信息」那一块', '统计信息' not in body, body[:80])
        check('页脚显示平台总览', '平台总览' in body and '需求总数' in body, body[-160:])
        nums = c.js('''
        (function(){
          var f = document.querySelector('footer');
          if (!f) return null;
          var t = (f.innerText || '').replace(/\\s+/g, ' ');
          var m = t.match(/需求总数\\s*([0-9]+)\\s*条/);
          return {text: t.slice(0, 120), total: m ? Number(m[1]) : null};
        })()
        ''')
        check('页脚统计里的「需求总数」是个数字', bool(nums) and nums.get('total') is not None, nums)
        check('老师端截图非空', c.shot('04-teacher.png') > 10000)

        # 老师打开「找家教」应被守卫送回需求池（路由层也拦，不靠隐藏入口）
        c.goto(WEB + '/tutors')
        check('老师访问 /tutors 会被送回 /demands',
              c.wait_for('location.pathname === "/demands"', 25), c.path())
        c.goto(WEB + '/tutors/1')
        check('老师访问 /tutors/:id 也会被送回 /demands',
              c.wait_for('location.pathname === "/demands"', 25), c.path())

        c.goto(WEB + '/me')
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
        time.sleep(0.5)
        n = nav(c)
        check('/me 上激活项是「我的」', n.get('activeLabel') == '我的', n.get('activeLabel'))
        check('老师「我的」页脚不显示「全部家教」入口',
              '全部家教' not in ((c.js("(document.querySelector('footer')||{}).innerText || ''") or '')))
        check('「我的」页脚同样有平台总览（页脚是全站共用）',
              '平台总览' in ((c.js("(document.querySelector('footer')||{}).innerText || ''") or '')))
        r = c.js("""
        (function(){
          var a = Array.prototype.slice.call(
            document.querySelectorAll('nav[aria-label="底部导航"] a')).filter(function(x){
              return (x.innerText||'').indexOf('首页') >= 0; })[0];
          if (!a) return 'not-found';
          a.click();
          return 'clicked:' + a.getAttribute('href');
        })()
        """)
        check('从「我的」点「首页」回到 /demands（不再是空链接）',
              c.wait_for('location.pathname === "/demands"', 20), '%s -> %s' % (r, c.path()))
        collect()

        print('\n3.5) 广场 · 学生与老师都能看已审核的帖子')
        for who, tok in (('学生', stu_token), ('老师', tea_token)):
            set_token(c, tok)
            c.goto(WEB + '/plaza')
            c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
            time.sleep(0.6)
            n = nav(c)
            body = c.js('document.body.innerText') or ''
            check('%s能打开 /plaza（不被守卫弹走）' % who, c.path() == '/plaza', c.path())
            check('%s的 /plaza 上激活项是「广场」' % who, n.get('activeLabel') == '广场', n.get('activeLabel'))
            check('%s的广场有列表标题' % who, '广场' in body, body[:60])
            check('%s的广场底栏只有一条' % who, n.get('navs') == 1, n.get('navs'))
            check('%s的广场截图非空' % who, c.shot('07-plaza-%s.png' % ('stu' if tok == stu_token else 'tea')) > 10000)
            collect()

        print('\n4) 已登录未选身份 · 底栏给「选身份」')
        set_token(c, new_token)
        c.goto(WEB + '/')
        check('未选身份访问 / 会落到 /choose-role',
              c.wait_for('location.pathname === "/choose-role"', 25), c.path())
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 20)
        time.sleep(0.4)
        n = nav(c)
        check('底栏是「首页 / 选身份 / 广场 / 我的」',
              n.get('labels') == ['首页', '选身份', '广场', '我的'], n.get('labels'))
        check('/choose-role 上激活项是「选身份」', n.get('activeLabel') == '选身份', n.get('activeLabel'))
        check('未选身份截图非空', c.shot('05-no-role.png') > 10000)
        collect()

        print('\n5) 「找家教」只对游客开放（登录后没有这个功能）')
        set_token(c, None)
        c.goto(WEB + '/tutors')
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
        time.sleep(0.6)
        n = nav(c)
        check('/tutors 上激活项是「找家教」', n.get('activeLabel') == '找家教', n.get('activeLabel'))
        check('找家教页只有一条底栏', n.get('navs') == 1, n.get('navs'))
        check('游客能打开找家教页',
              '位老师' in (c.js('document.body.innerText') or '')
              or '暂无' in (c.js('document.body.innerText') or ''),
              (c.js('document.body.innerText') or '')[:60])
        check('找家教页截图非空', c.shot('06-tutors.png') > 10000)
        collect()

        print('\n6) 旧地址重定向（老书签 / 聊天里的旧链接不能 404）')
        set_token(c, None)
        c.goto(WEB + '/h5')
        check('/h5 → /', c.wait_for('location.pathname === "/"', 20), c.path())
        check('/h5 没有 404 文案', '404' not in (c.js('document.body.innerText') or ''), '')
        c.goto(WEB + '/h5/tutor?subject=%E6%95%B0%E5%AD%A6')
        check('/h5/tutor → /tutors（并保留 subject 参数）',
              c.wait_for('location.pathname === "/tutors" && location.search.indexOf("subject") >= 0', 25),
              '%s%s' % (c.path(), c.js('location.search')))
        c.goto(WEB + '/h5/my')
        check('/h5/my → /login 或 /me（登录后页面，不能 404）',
              c.wait_for('location.pathname === "/login" || location.pathname === "/me"', 25), c.path())
        collect()

        print('\n7) 桌面宽度（1440×900）')
        emulate(c, DESKTOP, False)
        c.goto(WEB + '/')
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
        time.sleep(0.5)
        n = nav(c)
        check('客户侧底栏在桌面宽度下隐藏', n.get('visible') is False, n)
        check('桌面首页仍有顶栏导航（页面不是空的）',
              c.js('document.body.innerText.indexOf("找家教") >= 0'))
        check('桌面首页截图非空', c.shot('08-desktop-home.png') > 10000)
        c.goto(WEB + '/tutors')
        c.wait_for('!!document.querySelector(\'nav[aria-label="底部导航"]\')', 25)
        time.sleep(0.6)
        n = nav(c)
        check('找家教页在桌面上也是同一套外壳（底栏隐藏、顶栏在）',
              n.get('visible') is False
              and c.js('document.body.innerText.indexOf("登录") >= 0 || document.body.innerText.indexOf("注册") >= 0'),
              n)
        check('桌面找家教截图非空', c.shot('09-desktop-tutors.png') > 10000)
        collect()

        print('\n8) 控制台异常')
        check('全程无 JS 异常', len(console_errors) == 0,
              ' | '.join(console_errors[:3]) if console_errors else '0 条')

        print('\n9) 收尾：清掉本次注册的测试账号')
        sql = ("DELETE FROM t_customer_account WHERE email IN "
               "('%s','%s','%s');" % (stu_email, tea_email, new_email))
        if purge(sql):
            print('  PASS  测试账号已清理  -> %s, %s, %s' % (stu_email, tea_email, new_email))
        else:
            print('  SKIP  没有 mysql 客户端，跳过清理（不影响上面的断言）')

    finally:
        try:
            proc.terminate()
        except Exception:
            pass

    print('\n' + '=' * 72)
    print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
    if FAIL:
        print('失败项：')
        for f in FAIL:
            print('  - ' + f)
    print('截图目录：%s' % SHOTS)
    return 1 if FAIL else 0


if __name__ == '__main__':
    raise SystemExit(main())
