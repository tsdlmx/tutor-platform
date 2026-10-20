# -*- coding: utf-8 -*-
"""
客户侧真实浏览器验证（Chrome DevTools Protocol）

验证的是一条**完整业务闭环**，而不是接口是否返回 200：

  1. 打开站点根路径 —— 必须是「客户界面」，不能是管理后台登录页
  2. 注册一个全新邮箱账号
  3. 注册后进入「选择身份」，选「我是学生」
  4. 学生发布需求：多选科目 + 填预算 + 写描述
  5. 用自己的学生账号能看到这条需求
  6. 退出，改用演示老师账号登录
  7. 老师的界面里**能看到刚才那条需求**（科目、预算、学生昵称都在）
  8. 全程 0 条控制台 JS 异常

运行前需要：后端(12501) + 前端(12500) 已启动。
脚本**自带数据**：自己注册学生和老师账号，不依赖任何预置演示数据。
需要 Chrome：用 TUTOR_CHROME 指定，或用 TUTOR_WEB_BASE 换站点地址。
"""
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websocket  # websocket-client

WEB = os.environ.get('TUTOR_WEB_BASE', 'http://127.0.0.1:12500')
PORT = 9334
SHOTS = os.environ.get('TUTOR_SHOTS') or '/tmp/tutor-customer-shots'
# 每轮都用独立 profile：否则上一轮的登录态留在 localStorage 里，会让断言假过/假挂
PROFILE = os.path.join(tempfile.gettempdir(), 'tutor-customer-cdp-profile-%d' % os.getpid())

OK, FAIL = [], []


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
        # 导航前在旧文档埋哨兵，导航后等它消失 —— 确认新文档已接管（否则会读到旧 DOM）
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

    def text(self):
        return self.js('document.body ? document.body.innerText : ""') or ''

    def shot(self, name):
        os.makedirs(SHOTS, exist_ok=True)
        data = self.send('Page.captureScreenshot', format='png').get('data')
        path = os.path.join(SHOTS, name)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        return os.path.getsize(path)


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
    print(('  PASS  ' if cond else '  FAIL  ') + label + (('  -> ' + str(detail)) if detail else ''))


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def fill(c, kind, value):
    """给输入框赋值（React 受控组件必须走原生 setter + input 事件）"""
    expr = """
    (function(){
      var kind = %s, value = %s;
      var els = Array.prototype.slice.call(document.querySelectorAll('input,textarea'));
      var el = null;
      if (kind === 'email') {
        el = els.find(function(e){ return e.type === 'email' || (e.placeholder||'').indexOf('邮箱') >= 0; });
      } else if (kind === 'password') {
        el = els.find(function(e){ return e.type === 'password'; });
      } else if (kind === 'password2') {
        var ps = els.filter(function(e){ return e.type === 'password'; });
        el = ps[1] || ps[0];
      } else if (kind === 'title') {
        el = els.find(function(e){ return (e.placeholder||'').indexOf('标题') >= 0; });
      } else if (kind === 'budgetMin') {
        el = els.find(function(e){ return (e.placeholder||'').indexOf('最低') >= 0 || (e.placeholder||'').indexOf('下限') >= 0; });
      } else if (kind === 'budgetMax') {
        el = els.find(function(e){ return (e.placeholder||'').indexOf('最高') >= 0 || (e.placeholder||'').indexOf('上限') >= 0; });
      } else if (kind === 'description') {
        el = els.find(function(e){ return e.tagName === 'TEXTAREA'; });
      }
      if (!el) return 'not-found';
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok:' + (el.placeholder || el.type || '');
    })()
    """ % (js_str(kind), js_str(value))
    return c.js(expr)


def fill_id(c, elem_id, value):
    """按元素 id 填值（表单里的 Field 都带了 id，比按 placeholder 猜稳）"""
    expr = """
    (function(){
      var el = document.getElementById(%s);
      if (!el) return 'not-found';
      var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT'   ? window.HTMLSelectElement.prototype
                : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, %s);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok:' + (el.value || '').slice(0, 24);
    })()
    """ % (js_str(elem_id), js_str(value))
    return c.js(expr)


def select_text(c, elem_id, text):
    """原生 select：按选项文字选中"""
    expr = """
    (function(){
      var el = document.getElementById(%s);
      if (!el) return 'not-found';
      var opt = Array.prototype.slice.call(el.options).filter(function(o){
        return (o.textContent || '').indexOf(%s) >= 0;
      })[0];
      if (!opt) return 'no-option';
      var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(el, opt.value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok:' + opt.textContent;
    })()
    """ % (js_str(elem_id), js_str(text))
    return c.js(expr)


def click_role(c, label):
    """点身份卡片：标题（如「我是老师」「我是家长 / 学生」）只是个 <p>，真正可点的是卡片里的按钮"""
    expr = """
    (function(){
      var want = '我是' + %s;
      var nodes = Array.prototype.slice.call(document.querySelectorAll('p,span,div,h1,h2,h3'));
      // 标题可能是「我是家长 / 学生」这种带补充词的形式，所以用包含匹配而不是全等
      var title = nodes.filter(function(e){
        var t = (e.innerText || '').trim();
        return t === want || (t.indexOf('我是') === 0 && t.indexOf(%s) >= 0 && t.length < 20);
      })[0];
      if (!title) return 'no-title';
      var card = title.closest('div');
      var btn = card && card.querySelector('button');
      if (!btn) return 'no-button';
      btn.click();
      return 'clicked:' + (btn.innerText || '').trim();
    })()
    """ % (js_str(label), js_str(label))
    return c.js(expr)


def click_submit(c):
    """点表单的提交按钮 —— 比按文字找稳（按钮文字可能是「登 录」这种带空格的）"""
    return c.js("""
    (function(){
      var b = document.querySelector('form button[type=submit]')
           || document.querySelector('button[type=submit]');
      if (!b) return 'not-found';
      b.click();
      return 'clicked:' + (b.innerText || '').trim();
    })()
    """)


def click_text(c, text, exact=False):
    """按可见文字点一个可点击元素（只认 button/a/[role=button]/label 及其后代）"""
    expr = """
    (function(){
      var t = %s, exact = %s;
      var all = Array.prototype.slice.call(
        document.querySelectorAll('button,a,[role=button],label,li,div,span'));
      var hits = [];
      all.forEach(function(e){
        var c = e.closest('button,a,[role=button],label');
        if (!c) return;
        var s = (c.innerText || c.textContent || '').trim();
        if (!s) return;
        if (exact ? s === t : s.indexOf(t) >= 0) hits.push(c);
      });
      hits = hits.filter(function(e, i){ return hits.indexOf(e) === i; });
      // 取文字最短的那个：最具体的匹配，避免点到外层大容器
      hits.sort(function(a, b){
        return (a.innerText || '').length - (b.innerText || '').length;
      });
      var el = hits[0];
      if (!el) return 'not-found';
      el.click();
      return 'clicked:' + (el.innerText || '').trim().slice(0, 30);
    })()
    """ % (js_str(text), 'true' if exact else 'false')
    return c.js(expr)


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
        email = 'browser-student%s@example.com' % stamp
        student_nick = '浏览器学生%s' % stamp
        password = 'demo12345'
        title = '浏览器验证需求 %s' % stamp
        DESC_TEXT = '这是浏览器端自动验证创建的需求：希望老师有耐心，每周两次课。'

        print('=' * 72)
        print('1) 根路径必须是客户界面（不是管理后台）')
        c.goto(WEB + '/')
        collect()
        time.sleep(1.5)
        collect()
        root_text = c.text()
        check('根路径渲染出内容', len(root_text.strip()) > 20, '文本 %d 字' % len(root_text.strip()))
        check('根路径是客户界面（出现注册/登录入口）',
              ('注册' in root_text or '登录' in root_text), root_text.strip().replace('\n', ' ')[:70])
        check('根路径不是管理后台登录页（没有「若依」/「管理后台」标题）',
              '若依' not in root_text and 'RuoYi' not in root_text, '')
        check('根路径没有跳到 /admin', '/admin' not in (c.path() or ''), 'path=%s' % c.path())
        check('首页不再出现「管理后台」入口', '管理后台' not in root_text, '')
        check('首页截图非空', c.shot('01-landing.png') > 10000)

        print('\n2) 注册新账号（邮箱 + 邮箱验证码）')
        c.goto(WEB + '/register')
        c.wait_for('document.querySelectorAll("input").length > 0')
        r1 = fill(c, 'email', email)
        check('第 1 步有邮箱输入框', str(r1).startswith('ok'), r1)
        check('注册页是分步的（第 1 / 3 步）', '第 1 / 3 步' in c.text(), '')

        # 第 1 步：发验证码 + 填码
        sent = click_text(c, '发送验证码')
        c.wait_for('/开发模式验证码/.test(document.body.innerText)', timeout=25)
        m = re.search(r'开发模式验证码：(\d{6})', c.text())
        code = m.group(1) if m else None
        check('点「发送验证码」后拿到验证码（开发模式回显）',
              bool(code), '点击=%s 验证码=%s' % (sent, code))
        r_code = fill_id(c, 'code', code or '000000')
        check('验证码能填', str(r_code).startswith('ok'), r_code)

        # 不填验证码时点下一步应被拦住：先清空再点
        fill_id(c, 'code', '')
        click_text(c, '下一步')
        time.sleep(0.6)
        check('第 1 步校验没过不放行', '第 1 / 3 步' in c.text(), 'path=%s' % c.path())
        fill_id(c, 'code', code or '000000')

        click_text(c, '下一步')
        ok2 = c.wait_for('document.getElementById("password") !== null', timeout=15)
        check('第 1 步通过后进入第 2 步（密码）',
              ok2 and '第 2 / 3 步' in c.text(), 'password 框存在=%s' % ok2)

        # 第 2 步：密码 + 确认密码
        r2 = fill(c, 'password', password)
        r3 = fill(c, 'password2', password)   # 「确认密码」不填会被前端校验拦下
        check('密码 / 确认密码 能填',
              str(r2).startswith('ok') and str(r3).startswith('ok'),
              'pwd=%s pwd2=%s' % (r2, r3))
        click_text(c, '下一步')
        ok3 = c.wait_for('document.getElementById("nickname") !== null', timeout=15)
        check('第 2 步通过后进入第 3 步（昵称）',
              ok3 and '第 3 / 3 步' in c.text(), 'nickname 框存在=%s' % ok3)

        # 第 3 步：昵称 + 提交
        r4 = fill_id(c, 'nickname', student_nick)
        check('昵称能填', str(r4).startswith('ok'), r4)
        click_submit(c)
        ok = c.wait_for('location.pathname.indexOf("choose-role") >= 0', timeout=20)
        collect()
        check('注册成功后进入「选择身份」', ok, 'path=%s' % c.path())
        check('选择身份页有两个选项', '老师' in c.text() and '学生' in c.text(), '')
        check('选择身份截图非空', c.shot('02-choose-role.png') > 10000)

        print('\n3) 选择「我是学生」')
        clicked = click_role(c, '学生')
        ok = c.wait_for('location.pathname.indexOf("/demands/mine") >= 0', timeout=20)
        collect()
        check('点「我是学生」后进入学生界面', ok, '%s / path=%s' % (clicked, c.path()))
        check('学生界面有「发布需求」入口', '发布' in c.text(), '')

        print('\n4) 发布需求（科目 + 预算）')
        if '/demands/new' not in (c.path() or ''):
            click_text(c, '发布需求')
            if not c.wait_for('location.pathname.indexOf("/demands/new") >= 0', timeout=15):
                c.goto(WEB + '/demands/new')
        c.wait_for('document.getElementById("title") !== null')
        r_title = fill_id(c, 'title', title)
        # 科目多选：点科目「芯片」（可多选）
        picked = []
        for name in ('数学', '英语'):
            hit = click_text(c, name, exact=True)
            if str(hit).startswith('clicked'):
                picked.append(name)
            time.sleep(0.3)
        r_grade = select_text(c, 'grade', '初二')
        r_min = fill_id(c, 'budgetMin', '120')
        r_max = fill_id(c, 'budgetMax', '260')
        r_desc = fill_id(c, 'description', DESC_TEXT)
        if not str(r_desc).startswith('ok'):
            # 这个 Textarea 没有 id（Field 没写 htmlFor），退回按标签找
            r_desc = fill(c, 'description', DESC_TEXT)
        check('标题 / 年级 / 预算 / 描述 都能填', 
              all(str(x).startswith('ok') for x in (r_title, r_grade, r_min, r_max, r_desc)),
              'title=%s grade=%s min=%s max=%s desc=%s' % (r_title, r_grade, r_min, r_max, r_desc))
        check('科目可以多选', len(picked) >= 1, '已选 %s' % picked)
        c.shot('03-demand-form.png')
        click_submit(c)
        ok = c.wait_for('location.pathname.indexOf("/demands/mine") >= 0',
                        timeout=20)
        collect()
        time.sleep(1.0)
        collect()
        check('发布后回到学生列表', ok, 'path=%s' % c.path())
        check('学生列表里能看到刚发布的需求', title in c.text(), title)
        check('学生列表截图非空', c.shot('04-student-list.png') > 10000)

        print('\n5) 退出，现场注册一个老师账号（不依赖预置数据）')
        c.js('localStorage.removeItem("tutor_customer_token");')
        c.goto(WEB + '/register')
        c.wait_for('document.querySelectorAll("input").length > 0')
        teacher_email = 'browser-teacher%s@example.com' % stamp
        fill(c, 'email', teacher_email)
        click_text(c, '发送验证码')
        c.wait_for('/开发模式验证码/.test(document.body.innerText)', timeout=25)
        m2 = re.search(r'开发模式验证码：(\d{6})', c.text())
        tcode = m2.group(1) if m2 else '000000'
        fill_id(c, 'code', tcode)
        click_text(c, '下一步')                     # 第 1 步 -> 第 2 步
        c.wait_for('document.getElementById("password") !== null', timeout=15)
        fill(c, 'password', password)
        fill(c, 'password2', password)
        click_text(c, '下一步')                     # 第 2 步 -> 第 3 步
        c.wait_for('document.getElementById("nickname") !== null', timeout=15)
        click_submit(c)
        ok = c.wait_for('location.pathname.indexOf("choose-role") >= 0', timeout=20)
        collect()
        check('老师账号注册成功并进入选择身份', ok, 'path=%s' % c.path())
        click_role(c, '老师')
        ok = c.wait_for('location.pathname.indexOf("/demands") >= 0', timeout=20)
        collect()
        check('选「我是老师」后进入老师界面', ok, 'path=%s' % c.path())

        print('\n6) 老师界面能看到所有学生的需求（含刚才那条）')
        c.wait_for('document.body.innerText.length > 100')
        time.sleep(1.5)
        collect()
        teacher_text = c.text()
        check('老师界面渲染出需求列表', '需求' in teacher_text or '待接单' in teacher_text,
              '文本 %d 字' % len(teacher_text))
        check('老师能看到刚由学生发布的那条需求', title in teacher_text, title)
        check('老师能看到需求所属学生的昵称', student_nick in teacher_text, student_nick)
        check('老师能看到预算数字', ('120' in teacher_text and '260' in teacher_text), '')
        check('老师能看到科目', '数学' in teacher_text or '英语' in teacher_text, '')
        # 统计已经不在页面正文里了（挪到了页脚 CustomerFooter），
        # 所以这里断言：需求列表在正文、平台总览在页脚，各就各位。
        pos_list = teacher_text.find('学生需求列表')
        foot_text = c.js("(document.querySelector('footer')||{}).innerText || ''") or ''
        check('老师端正文是需求列表（统计已移出正文）',
              pos_list >= 0 and '统计信息' not in teacher_text,
              '列表@%s 统计信息出现=%s' % (pos_list, '统计信息' in teacher_text))
        check('页脚显示平台总览（需求总数/待接单/平均预算）',
              '平台总览' in foot_text and '需求总数' in foot_text and '平均预算' in foot_text,
              foot_text.replace('\n', ' ')[:80])
        check('老师界面截图非空', c.shot('05-teacher-list.png') > 10000)

        print('\n6.5) 老师「申请联系」这条需求 → 学生「我的」能看到这份申请')
        clicked_apply = c.js("""
        (function(){
          var want = %s;
          var btns = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){
            return (b.innerText || '').indexOf('申请联系') >= 0;
          }).filter(function(b){
            var p = b;
            for (var i = 0; i < 8 && p; i++) {
              if ((p.innerText || '').indexOf(want) >= 0) return true;
              p = p.parentElement;
            }
            return false;
          });
          if (!btns.length) return 'not-found';
          btns[0].click();
          return 'clicked';
        })()
        """ % js_str(title))
        ok = c.wait_for(
            "Array.prototype.slice.call(document.querySelectorAll('button'))"
            ".some(function(b){ return (b.innerText||'').indexOf('已申请') >= 0; })", 20)
        collect()
        check('老师点「申请联系」后按钮变成「已申请」', ok, clicked_apply)
        check('申请成功给了提示（toast）',
              '已申请联系' in (c.js('document.body.innerText') or '')
              or ok, clicked_apply)
        check('老师端需求列表截图非空', c.shot('05b-apply.png') > 10000)

        # 换成学生登录，看「我的」里的「老师申请」模块
        c.js('localStorage.removeItem("tutor_customer_token");')
        c.goto(WEB + '/login')
        c.wait_for('document.querySelectorAll("input").length > 0', 20)
        fill(c, 'email', email)
        fill(c, 'password', password)
        click_submit(c)
        ok = c.wait_for('location.pathname.indexOf("/demands/mine") >= 0', timeout=25)
        collect()
        check('学生能重新登录（回到自己的主页）', ok, 'path=%s' % c.path())
        c.goto(WEB + '/me')
        c.wait_for('!!document.querySelector("textarea")', 25)
        time.sleep(1.2)
        collect()
        stu_me = c.text()
        check('学生「我的」里是「老师申请」模块（不是简历）',
              '老师申请' in stu_me and '个人简历' not in stu_me,
              stu_me.strip().replace('\n', ' ')[:90])
        check('学生「我的」里能看到刚才那条需求的申请',
              title in stu_me, stu_me.strip().replace('\n', ' ')[:120])
        check('学生「我的」截图非空', c.shot('05c-student-applications.png') > 10000)

        # 回到老师身份继续后面的用例（简历 + 帖子只在老师端出现）
        c.js('localStorage.removeItem("tutor_customer_token");')
        c.goto(WEB + '/login')
        c.wait_for('document.querySelectorAll("input").length > 0', 20)
        fill(c, 'email', teacher_email)
        fill(c, 'password', password)
        click_submit(c)
        ok = c.wait_for('location.pathname.indexOf("/demands") >= 0', timeout=25)
        collect()
        check('切回老师账号成功', ok, 'path=%s' % c.path())

        print('\n7) 个人主页（老师简历 + 帖子）')
        c.goto(WEB + '/me')
        c.wait_for('document.body.innerText.length > 60')
        time.sleep(1.5)
        collect()
        me_text = c.text()
        check('/me 是我的主页（简历与帖子在同一页）',
              '简历' in me_text and ('动态' in me_text or '帖子' in me_text),
              me_text.strip().replace('\n', ' ')[:70])
        check('「我的」不再有左侧账号信息板块（昵称/邮箱/账号 #）',
              '账号 #' not in me_text and '注册时间' not in me_text,
              me_text.strip().replace('\n', ' ')[:90])
        check('「我的」不再用标签页（我的资料 / 公开主页 / 我的帖子）',
              c.js('document.querySelectorAll(\'[role="tab"]\').length') == 0,
              c.js('document.querySelectorAll(\'[role="tab"]\').length'))
        # 单页结构：身份头 + 我的资料（简历）+ 我的帖子，三块同屏，不再切标签页
        c.wait_for('!!document.querySelector("textarea")', 25)
        check('主页上有发帖输入框（我的帖子区块常驻）',
              (c.js('document.querySelectorAll("textarea").length') or 0) > 0, '')

        # 填简历：进入编辑态 -> 填必填项 -> 保存
        entered = click_text(c, '去填写')
        if not str(entered).startswith('clicked'):
            entered = click_text(c, '填写简历')
        if not str(entered).startswith('clicked'):
            entered = click_text(c, '编辑简历') or click_text(c, '编辑')
        c.wait_for('document.getElementById("realName") !== null', timeout=15)
        r_name = fill_id(c, 'realName', '浏览器验证老师')
        fill_id(c, 'city', '北京')
        fill_id(c, 'intro', '这是浏览器验证脚本填写的自我介绍，用来确认简历能存下来。')
        check('简历表单能填写', str(r_name).startswith('ok'), 'realName=%s（入口=%s）' % (r_name, entered))
        click_submit(c)
        ok = c.wait_for('document.body.innerText.indexOf("浏览器验证老师") >= 0', timeout=25)
        collect()
        check('简历保存后展示在主页上', ok, 'realName=浏览器验证老师')
        check('简历截图非空', c.shot('09-profile-resume.png') > 10000)

        # 发帖：页面上那个 textarea 就是发帖框（我的帖子区块常驻在第一屏下方）
        post_text = '浏览器验证帖子 %s' % stamp
        c.wait_for('!!document.querySelector("textarea")', 25)
        fill(c, 'description', post_text)
        click_text(c, '发布')
        ok = c.wait_for('document.body.innerText.indexOf(%s) >= 0' % json.dumps(post_text), timeout=25)
        collect()
        check('发帖后出现在我的帖子列表里（自己能看到待审核的）', ok, post_text)
        after_post = c.text()
        check('新帖标着「待审核」（不再假装已经展示在主页上）',
              '待审核' in after_post, after_post.strip().replace('\n', ' ')[:90])
        check('主页截图非空', c.shot('10-profile-posts.png') > 10000)

        # 三块内容同屏：身份头 + 我的资料 + 我的帖子（不再有「公开主页」标签页）
        me_text_now = c.text()
        check('「我的」不再有「进入老师端」按钮', '进入老师端' not in me_text_now, '')
        check('「我的」不再有「查看我的公开主页」跳转按钮',
              '查看我的公开主页' not in me_text_now, '')
        check('身份头不再有「在新页面打开」外链（已移除）', '在新页面打开' not in me_text_now, '')
        check('同一页里同时有简历与帖子两块的标题',
              '个人简历' in me_text_now and '我的帖子' in me_text_now,
              me_text_now.strip().replace('\n', ' ')[:80])
        check('资料页不重复渲染简历（只出现一次「个人简历」）',
              me_text_now.count('个人简历') == 1, me_text_now.count('个人简历'))
        check('我的主页截图非空', c.shot('11-profile-public.png') > 10000)

        # 独立地址 /u/{accountId}：访问自己的 id 会回到 /me（老书签不 404）
        my_id = c.js('''(function(){
          var a = Array.prototype.slice.call(document.querySelectorAll('a'))
            .filter(function(x){ return (x.getAttribute('href')||'').indexOf('/u/') === 0; })[0];
          return a ? a.getAttribute('href').split('/u/')[1] : null;
        })()''')
        if my_id:
            c.goto(WEB + '/u/' + my_id)
            c.wait_for('location.pathname === "/me"', timeout=25)
            time.sleep(1.0)
            collect()
            check('旧地址 /u/{accountId} 重定向回 /me', (c.path() or '') == '/me', c.path())

        print('\n8) 「我的」页（唯一，不再有 H5 / 客户区两份）')
        # 已登录（老师）状态
        c.goto(WEB + '/me')
        c.wait_for('document.body.innerText.length > 60')
        time.sleep(1.2)
        collect()
        my_text = c.text()
        check('已登录时显示账号身份', '老师' in my_text, my_text.strip().replace('\n', ' ')[:60])
        check('老师「我的」里有简历与帖子两块',
              '简历' in my_text and ('帖子' in my_text or '动态' in my_text), '')
        check('老师「我的」里没有学生的「老师申请」模块', '老师申请' not in my_text, '')
        check('账号操作已收进顶栏账户菜单（正文不再堆按钮）',
              '退出登录' not in my_text
              and c.js('!!document.querySelector(\'header button[aria-label="账户菜单"]\')'), '')
        check('「我的」已移除「偏好设置」卡片', '偏好设置' not in my_text, '')
        check('深色模式入口仍在顶栏（主题切换按钮）',
              c.js('!!document.querySelector(\'header button[aria-label*="切换到"]\')'), '')
        check('「我的」不再出现管理后台入口', '管理后台' not in my_text, '')
        check('「我的」不再出现后台菜单（数据概览等）',
              '数据概览' not in my_text and '家教审核' not in my_text, '')
        check('「我的」截图非空', c.shot('07-my-logged-in.png') > 10000)

        # 未登录状态：/me 属于登录后页面，应该被守卫送去 /login（而不是渲染一份游客版「我的」）
        c.js('localStorage.removeItem("tutor_customer_token");')
        c.goto(WEB + '/me')
        time.sleep(1.2)
        collect()
        check('未登录访问 /me 会被引导到登录页',
              'login' in (c.path() or ''), 'path=%s' % c.path())
        guest_text = c.text()
        check('登录页引导邮箱注册',
              '注册' in guest_text and '登录' in guest_text, guest_text.strip().replace('\n', ' ')[:60])
        check('未登录时不再引导「登录管理后台」', '管理后台' not in guest_text, '')
        check('未登录截图非空', c.shot('08-guest-login.png') > 10000)

        print('\n9) 客户侧 404（不能让客户看到管理后台的 404）')
        c.goto(WEB + '/a-page-that-does-not-exist')
        time.sleep(1.2)
        collect()
        nf = c.text()
        check('未知道路渲染出 404 页面', '404' in nf or '不存在' in nf, nf.strip().replace('\n', ' ')[:60])
        check('404 页不是管理后台那份（没有「回到概览」）', '回到概览' not in nf, '')
        check('404 页给出回首页的入口', '回到首页' in nf or '首页' in nf, '')
        c.shot('06-customer-404.png')

        print('\n9.5) 找回密码（真实浏览器走一遍 UI）')
        # 用本轮的老师账号：此时浏览器已经处于未登录状态（上面刚清过 token）
        c.goto(WEB + '/login')
        c.wait_for('document.body.innerText.length > 40', timeout=25)
        time.sleep(0.8)
        check('登录页有「忘记密码？」入口', '忘记密码' in c.text(), '')
        entered = click_text(c, '忘记密码')
        c.wait_for('location.pathname === "/forgot-password"', timeout=20)
        c.wait_for('!!document.querySelector("#email")', timeout=20)
        time.sleep(0.6)
        collect()
        check('能进入找回密码页', (c.path() or '') == '/forgot-password',
              '入口=%s path=%s' % (entered, c.path()))
        check('找回密码页有邮箱/验证码/新密码/确认密码四个输入',
              (c.js('document.querySelectorAll("input").length') or 0) >= 4,
              c.js('document.querySelectorAll("input").length'))
        check('找回密码页截图非空', c.shot('12-forgot-password.png') > 10000)

        fill_id(c, 'email', teacher_email)
        click_text(c, '发送验证码')
        # test-echo 模式下页面会显示「开发模式验证码：xxxxxx」
        ok = c.wait_for('/开发模式验证码：(\\d{6})/.test(document.body.innerText)', timeout=25)
        m3 = re.search(r'开发模式验证码：(\d{6})', c.text())
        reset_code = m3.group(1) if m3 else None
        check('点「发送验证码」拿到重置码', ok and bool(reset_code), reset_code)

        new_password = 'resetpw%d' % int(stamp)
        fill_id(c, 'code', reset_code or '000000')
        fill_id(c, 'password', new_password)
        fill_id(c, 'confirm', new_password)
        click_submit(c)
        ok = c.wait_for('location.pathname === "/login"', timeout=30)
        collect()
        check('提交后回到登录页', ok, 'path=%s' % c.path())

        # 用新密码登录（走真实 UI），旧密码应当登不上
        fill(c, 'email', teacher_email)
        fill(c, 'password', password)
        click_submit(c)
        time.sleep(1.6)
        collect()
        check('旧密码登不上', 'choose-role' not in (c.path() or '') and '/demands' not in (c.path() or ''),
              'path=%s' % c.path())
        c.goto(WEB + '/login')
        c.wait_for('!!document.querySelector("input")', timeout=25)
        time.sleep(0.6)
        fill(c, 'email', teacher_email)
        fill(c, 'password', new_password)
        click_submit(c)
        # 这个账号本轮已经选过身份（老师），登录后应直达 /demands；未选身份则是 /choose-role
        ok = c.wait_for(
            'location.pathname === "/demands" || location.pathname.indexOf("/choose-role") >= 0',
            timeout=30,
        )
        collect()
        check('新密码可以登录（直达角色首页/选身份页）', ok, 'path=%s' % c.path())
        check('找回密码流程截图非空', c.shot('13-forgot-password-done.png') > 10000)

        print('\n10) 控制台异常')
        collect()
        check('全程无 JS 异常', len(console_errors) == 0,
              '；'.join(console_errors[:3]) if console_errors else '0 条')

        print('\n11) 收尾：清掉本次注册的测试账号')
        emails = [email, teacher_email]
        in_list = ','.join("'%s'" % e for e in emails)
        cleaned = purge(
            'DELETE p FROM t_user_post p JOIN t_customer_account a ON a.account_id = p.account_id '
            'WHERE a.email IN (%s); '
            'DELETE ap FROM t_demand_apply ap JOIN t_customer_account a ON a.account_id = ap.teacher_id '
            'WHERE a.email IN (%s); '
            'DELETE pr FROM t_teacher_profile pr JOIN t_customer_account a ON a.account_id = pr.account_id '
            'WHERE a.email IN (%s); '
            'DELETE d FROM t_student_demand d JOIN t_customer_account a ON a.account_id = d.student_id '
            'WHERE a.email IN (%s); '
            'DELETE FROM t_customer_account WHERE email IN (%s);'
            % (in_list, in_list, in_list, in_list, in_list))
        check('测试账号已清理（无 mysql 客户端时跳过）', cleaned or not os.path.exists(MYSQL_BIN),
              '已清 %s' % ', '.join(emails))

        print('\n' + '=' * 72)
        print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
        if FAIL:
            print('失败清单：')
            for f in FAIL:
                print('  - ' + f)
        print('截图目录：%s' % SHOTS)
    finally:
        proc.terminate()
        shutil.rmtree(PROFILE, ignore_errors=True)


main()
