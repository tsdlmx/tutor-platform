# -*- coding: utf-8 -*-
"""
客户侧接口验证（邮箱账号 + 需求单）

覆盖：
  1) 邮箱注册 / 登录 / 选择身份
  2) 注册与登录的各种边界（重复邮箱、格式错、密码太短、密码错误、无 token）
  3) 学生发布需求（科目 + 预算）及其校验
  4) 老师端能列出所有学生的需求；学生端只看得到自己的
  4.5) 老师「申请联系」学生需求，学生「我的」里能看到这份申请
  5) 越权：改/删别人的需求、老师发布需求、客户 token 打管理接口
  5.5) 帖子：发布后是待审核、不进广场；后台通过后才进广场（设 TUTOR_ADMIN_PASSWORD 才跑这段）

用独立进程跑，不依赖前端。可用 TUTOR_API_BASE 覆盖后端地址。
"""
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('TUTOR_API_BASE', 'http://127.0.0.1:12501')
ADMIN_USER = os.environ.get('TUTOR_ADMIN_USER', 'admin')
ADMIN_PASSWORD = os.environ.get('TUTOR_ADMIN_PASSWORD')
OK, FAIL = [], []


def call(method, path, body=None, token=None, raw=False, headers=None):
    url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    hdrs = {'Content-Type': 'application/json;charset=utf-8'}
    if token:
        hdrs['Authorization'] = 'Bearer ' + token
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.getcode()
            payload = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        payload = e.read()
    if raw:
        return status, payload
    try:
        return status, json.loads(payload.decode('utf-8'))
    except Exception:
        return status, {}


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


def send_code(email):
    """发验证码，返回 (响应, devCode)。devCode 只有开发模式（未配 SMTP）才有"""
    _, r = call('POST', '/customer/auth/send-code', {'email': email})
    data = r.get('data') or {}
    return r, data.get('devCode')


def register_account(email, password, nickname=None):
    """完整注册：先发验证码 -> 再带码注册"""
    send_r, code = send_code(email)
    if not code:
        return {'code': 400, 'msg': '没拿到验证码：%s' % (send_r.get('msg') or send_r)}
    body = {'email': email, 'password': password, 'code': code}
    if nickname:
        body['nickname'] = nickname
    _, r = call('POST', '/customer/auth/register', body)
    return r


stamp = str(int(time.time()))[-6:]
STUDENT_EMAIL = 'stu%s@example.com' % stamp
TEACHER_EMAIL = 'tea%s@example.com' % stamp
OTHER_EMAIL = 'other%s@example.com' % stamp
PASSWORD = 'demo1234'

print('=' * 72)
print('1) 邮箱注册（注册时还没有身份）')
r = register_account(STUDENT_EMAIL, PASSWORD, '测试学生')
stu_token = (r.get('data') or {}).get('token')
stu_account = (r.get('data') or {}).get('account') or {}
check('注册成功并返回 token', bool(stu_token), 'code=%s msg=%s' % (r.get('code'), r.get('msg')))
check('注册后 role 为空（还没选身份）', stu_account.get('role') in (None, ''), 'role=%r' % stu_account.get('role'))
check('响应里不含密码哈希', 'password' not in json.dumps(r), '')
check('邮箱已归一化为小写', stu_account.get('email') == STUDENT_EMAIL, stu_account.get('email'))

print('\n2) 注册 / 登录的边界')
_, r = call('POST', '/customer/auth/register', {'email': STUDENT_EMAIL, 'password': PASSWORD})
check('重复邮箱被拒', r.get('code') == 400 and '已被注册' in (r.get('msg') or ''), r.get('msg'))
_, r = call('POST', '/customer/auth/register', {'email': 'not-an-email', 'password': PASSWORD})
check('邮箱格式错被拒', r.get('code') == 400, r.get('msg'))
_, r = call('POST', '/customer/auth/register', {'email': 'ok%s@example.com' % stamp, 'password': '123'})
check('密码太短被拒', r.get('code') == 400, r.get('msg'))
_, r = call('POST', '/customer/auth/login', {'email': STUDENT_EMAIL, 'password': 'wrong-password'})
check('密码错误被拒', r.get('code') == 400, r.get('msg'))
st, r = call('GET', '/customer/auth/me')
check('无 token 访问 /auth/me 返回 401', st == 401 and r.get('code') == 401, 'HTTP %s' % st)
st, r = call('GET', '/customer/auth/me', token='garbage.token.value')
check('伪造 token 被拒', st == 401, 'HTTP %s' % st)

print('\n2.5) 邮箱验证码（注册的前置条件）')
_, r = call('POST', '/customer/auth/send-code', {'email': 'not-an-email'})
check('发送验证码：邮箱格式错被拒', r.get('code') == 400, r.get('msg'))

CODE_EMAIL = 'code%s@example.com' % stamp
send_r, code = send_code(CODE_EMAIL)
check('发送验证码成功', send_r.get('code') == 200 and bool(code), send_r.get('msg'))
check('响应带有效期与重发间隔',
      (send_r.get('data') or {}).get('expiresIn') and (send_r.get('data') or {}).get('resendAfter'),
      'expiresIn=%s resendAfter=%s' % ((send_r.get('data') or {}).get('expiresIn'),
                                       (send_r.get('data') or {}).get('resendAfter')))

_, r = call('POST', '/customer/auth/send-code', {'email': CODE_EMAIL})
check('60 秒内重复发送被限流', r.get('code') == 400 and '秒后再试' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/auth/register',
            {'email': CODE_EMAIL, 'password': PASSWORD})
check('不带验证码不能注册', r.get('code') == 400 and '验证码' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/auth/register',
            {'email': CODE_EMAIL, 'password': PASSWORD, 'code': '000000'})
check('验证码错误不能注册', r.get('code') == 400 and '不正确' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/auth/register',
            {'email': CODE_EMAIL, 'password': PASSWORD, 'code': code})
check('验证码正确即可注册', r.get('code') == 200 and bool((r.get('data') or {}).get('token')), r.get('msg'))

_, r = call('POST', '/customer/auth/register',
            {'email': 'reuse%s@example.com' % stamp, 'password': PASSWORD, 'code': code})
check('验证码用过即失效（一次性）', r.get('code') == 400, r.get('msg'))

print('\n3) 登录 + 选择身份')
_, r = call('POST', '/customer/auth/login', {'email': STUDENT_EMAIL, 'password': PASSWORD})
stu_token = (r.get('data') or {}).get('token')
check('已有账号可以登录', bool(stu_token), r.get('msg'))
_, r = call('GET', '/customer/auth/me', token=stu_token)
check('/auth/me 返回当前账号', (r.get('data') or {}).get('email') == STUDENT_EMAIL)
_, r = call('PUT', '/customer/auth/role', {'role': 'WECHAT'}, token=stu_token)
check('非法身份被拒', r.get('code') == 400, r.get('msg'))
_, r = call('PUT', '/customer/auth/role', {'role': 'STUDENT'}, token=stu_token)
check('选择「学生」身份成功', r.get('code') == 200 and (r.get('data') or {}).get('role') == 'STUDENT', r.get('msg'))
_, r = call('GET', '/customer/auth/me', token=stu_token)
check('身份已持久化（me 里是 STUDENT）', (r.get('data') or {}).get('role') == 'STUDENT')

print('\n4) 学生发布需求（科目 + 预算）')
_, r = call('GET', '/customer/subjects')
subjects = r.get('data') or []
check('科目字典可匿名获取', '数学' in subjects and '英语' in subjects, '%d 个科目' % len(subjects))

_, r = call('POST', '/customer/demands',
            {'title': '缺科目的需求', 'grade': '初二'}, token=stu_token)
check('没选科目被拒', r.get('code') == 400 and '科目' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/demands',
            {'title': '预算颠倒', 'subjectList': ['数学'], 'budgetMin': 300, 'budgetMax': 100}, token=stu_token)
check('预算上限小于下限被拒', r.get('code') == 400 and '预算' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/demands',
            {'title': '   ', 'subjectList': ['数学']}, token=stu_token)
check('空标题被拒', r.get('code') == 400, r.get('msg'))

_, r = call('POST', '/customer/demands', {
    'title': '初二数学物理辅导（接口验证）',
    'subjectList': ['数学', '物理'],
    'grade': '初二',
    'budgetMin': 150,
    'budgetMax': 250,
    'budgetUnit': 'hour',
    'classMode': 'offline',
    'city': '北京',
    'description': '孩子基础一般，希望每周两次课，每次两小时。'
}, token=stu_token)
demand = r.get('data') or {}
demand_id = demand.get('demandId')
check('发布需求成功', r.get('code') == 200 and bool(demand_id), r.get('msg'))
check('科目数组被正确保存', demand.get('subjectList') == ['数学', '物理'], demand.get('subjectList'))
check('subjects 字符串同时返回', demand.get('subjects') == '数学,物理', demand.get('subjects'))
check('状态默认为待接单', demand.get('status') == '0' and demand.get('statusText') == '待接单',
      '%s/%s' % (demand.get('status'), demand.get('statusText')))

print('\n5) 学生自己看得到、改得动')
st, r = call('GET', '/customer/demands?pageNum=1&pageSize=20', token=stu_token)
ids = [x.get('demandId') for x in (r.get('rows') or [])]
check('学生的列表里有自己刚发的需求', demand_id in ids, 'total=%s' % r.get('total'))
_, r = call('PUT', '/customer/demands/%s' % demand_id,
            {'title': '改过的标题', 'subjectList': ['数学'], 'budgetMax': 300}, token=stu_token)
check('修改自己的需求成功', r.get('code') == 200, r.get('msg'))
_, r = call('GET', '/customer/demands/%s' % demand_id, token=stu_token)
d = r.get('data') or {}
check('修改已生效', d.get('title') == '改过的标题' and d.get('subjectList') == ['数学'],
      '%s / %s' % (d.get('title'), d.get('subjectList')))

print('\n6) 老师端：列出所有学生的需求')
r = register_account(TEACHER_EMAIL, PASSWORD, '测试老师')
tea_token = (r.get('data') or {}).get('token')
_, r = call('PUT', '/customer/auth/role', {'role': 'TEACHER'}, token=tea_token)
check('注册并选择「老师」身份', r.get('code') == 200, r.get('msg'))
st, r = call('GET', '/customer/demands?pageNum=1&pageSize=50', token=tea_token)
rows = r.get('rows') or []
check('老师能看到学生的需求', any(x.get('demandId') == demand_id for x in rows),
      'total=%s' % r.get('total'))
mine = [x for x in rows if x.get('demandId') == demand_id]
if mine:
    m = mine[0]
    check('需求里带学生昵称', bool(m.get('studentName')), m.get('studentName'))
    check('需求里带科目与预算', m.get('subjectList') == ['数学'] and m.get('budgetMax') is not None,
          '%s / %s' % (m.get('subjectList'), m.get('budgetMax')))
_, r = call('GET', '/customer/demands?subject=' + urllib.parse.quote('数学') + '&pageNum=1&pageSize=50', token=tea_token)
check('老师可以按科目筛选', any(x.get('demandId') == demand_id for x in (r.get('rows') or [])),
      'total=%s' % r.get('total'))
_, r = call('GET', '/customer/demands?subject=' + urllib.parse.quote('不存在的科目xyz') + '&pageNum=1&pageSize=50', token=tea_token)
check('筛不存在的科目返回空', r.get('total') == 0, 'total=%s' % r.get('total'))
_, r = call('GET', '/customer/demands/stats', token=tea_token)
s = r.get('data') or {}
check('老师端统计可用', s.get('total', 0) >= 1 and 'bySubject' in s,
      'total=%s open=%s avg=%s' % (s.get('total'), s.get('open'), s.get('avgBudget')))

print('\n6.5) 老师「申请联系」学生需求')
st, r = call('GET', '/customer/demands/applied', token=tea_token)
check('申请前「我申请过的」是空的', (r.get('data') or []) == [], r.get('data'))

_, r = call('POST', '/customer/demands/%s/apply' % demand_id,
            {'message': '带过同年级，可以先免费试讲一次'}, token=tea_token)
check('老师申请联系成功', r.get('code') == 200, r.get('msg'))

_, r = call('POST', '/customer/demands/%s/apply' % demand_id, {}, token=tea_token)
check('重复申请被拒（同一条需求只申请一次）', r.get('code') == 400, r.get('msg'))

_, r = call('POST', '/customer/demands/%s/apply' % demand_id, {}, token=stu_token)
check('学生不能申请（只有老师能申请）', r.get('code') == 403, r.get('msg'))

_, r = call('POST', '/customer/demands/99999999/apply', {}, token=tea_token)
check('申请不存在的需求返回 404', r.get('code') == 404, r.get('msg'))

_, r = call('GET', '/customer/demands/applied', token=tea_token)
check('「我申请过的」里出现这条需求', demand_id in (r.get('data') or []), r.get('data'))

_, r = call('GET', '/customer/demands/applications', token=stu_token)
apps = r.get('data') or []
hit = [x for x in apps if x.get('demandId') == demand_id]
check('学生能看到老师发来的申请', bool(hit), 'count=%s' % len(apps))
if hit:
    a0 = hit[0]
    check('申请里带老师昵称、需求标题与留言',
          bool(a0.get('teacherName')) and bool(a0.get('demandTitle')) and bool(a0.get('message')),
          '%s / %s / %s' % (a0.get('teacherName'), a0.get('demandTitle'), a0.get('message')))
    check('申请状态默认待处理（0）', str(a0.get('status')) == '0', a0.get('status'))

_, r = call('GET', '/customer/demands/applications', token=tea_token)
check('老师调「收到的申请」返回空列表（这是学生用的模块）', (r.get('data') or []) == [], r.get('data'))

print('\n7) 越权与隔离')
_, r = call('POST', '/customer/demands',
            {'title': '老师不该能发', 'subjectList': ['数学']}, token=tea_token)
check('老师发布需求被拒（403）', r.get('code') == 403, r.get('msg'))

r = register_account(OTHER_EMAIL, PASSWORD)
other_token = (r.get('data') or {}).get('token')
call('PUT', '/customer/auth/role', {'role': 'STUDENT'}, token=other_token)
st, r = call('GET', '/customer/demands?pageNum=1&pageSize=50', token=other_token)
other_ids = [x.get('demandId') for x in (r.get('rows') or [])]
check('另一个学生看不到别人的需求', demand_id not in other_ids, 'total=%s' % r.get('total'))
_, r = call('PUT', '/customer/demands/%s' % demand_id, {'title': '偷改', 'subjectList': ['数学']}, token=other_token)
check('另一个学生改不了别人的需求', r.get('code') == 404, r.get('msg'))
_, r = call('DELETE', '/customer/demands/%s' % demand_id, token=other_token)
check('另一个学生删不掉别人的需求', r.get('code') == 404, r.get('msg'))

st, r = call('GET', '/system/tutorInfo/list', token=tea_token)
check('客户 token 打管理接口被拒（关键隔离）',
      st == 401 or r.get('code') == 401, 'HTTP %s code=%s' % (st, r.get('code')))

print('\n7.5) 个人主页（老师简历 + 帖子）')
st, r = call('GET', '/customer/profile/me', token=tea_token)
d = r.get('data') or {}
check('/profile/me 可用（带邮箱、简历为空）',
      r.get('code') == 200 and (d.get('account') or {}).get('email') == TEACHER_EMAIL
      and d.get('profile') is None,
      'email=%s profile=%s' % ((d.get('account') or {}).get('email'), d.get('profile')))

st, r = call('PUT', '/customer/profile', {
    'realName': '验证老师', 'gender': '1', 'age': 30, 'city': '北京',
    'education': '硕士', 'school': '验证大学', 'major': '数学',
    'subjectList': ['数学', '物理'], 'grades': '初一,初二',
    'hourlyRate': 220, 'experienceYears': 4, 'availableTime': '周末全天',
    'intro': '带过三届毕业班，擅长把抽象概念讲成生活里的例子。',
    'certificates': '高级中学教师资格证', 'contact': '微信 verify',
}, token=tea_token)
prof = r.get('data') or {}
check('老师保存简历成功', r.get('code') == 200 and bool(prof.get('realName')), r.get('msg'))
check('科目数组存取正确', prof.get('subjects') == '数学,物理' and prof.get('subjectList') == ['数学', '物理'],
      '%s / %s' % (prof.get('subjects'), prof.get('subjectList')))
check('简历里的中文未乱码', prof.get('intro') == '带过三届毕业班，擅长把抽象概念讲成生活里的例子。',
      '%r' % prof.get('intro'))

st, r = call('PUT', '/customer/profile', {'realName': '   '}, token=tea_token)
check('简历缺姓名被拒', r.get('code') == 400 and '姓名' in (r.get('msg') or ''), r.get('msg'))
st, r = call('PUT', '/customer/profile', {'realName': '学生不该能写'}, token=stu_token)
check('学生不能填简历', r.get('code') == 400 and '老师' in (r.get('msg') or ''), r.get('msg'))

st, r = call('POST', '/customer/posts', {'content': '   '}, token=tea_token)
check('空内容发帖被拒', r.get('code') == 400, r.get('msg'))
st, r = call('POST', '/customer/posts',
             {'content': '今天把二次函数讲成了投篮轨迹，孩子一下就懂了。'}, token=tea_token)
post = r.get('data') or {}
post_id = post.get('postId')
check('发帖成功', r.get('code') == 200 and bool(post_id), r.get('msg'))
check('新帖默认待审核（auditStatus=0）', str(post.get('auditStatus')) == '0', post.get('auditStatus'))
check('帖子里带作者昵称与身份',
      post.get('authorRole') == 'TEACHER' and bool(post.get('authorName')),
      '%s / %s' % (post.get('authorName'), post.get('authorRole')))

st, r = call('GET', '/customer/posts/mine?pageNum=1&pageSize=10', token=tea_token)
mine_posts = r.get('rows') or []
check('我的帖子列表里有刚发的帖（待审核也看得见自己）',
      any(x.get('postId') == post_id for x in mine_posts), 'total=%s' % r.get('total'))
check('自己的列表里带出待审核状态',
      any(str(x.get('auditStatus')) == '0' for x in mine_posts if x.get('postId') == post_id), '')

st, r = call('GET', '/customer/profile/%s' % (prof.get('accountId') or ''), token=stu_token)
pub = r.get('data') or {}
check('别人能看到我的主页（且看不到邮箱）',
      r.get('code') == 200 and 'email' not in (pub.get('account') or {}),
      'account keys=%s' % sorted((pub.get('account') or {}).keys()))
check('待审核的帖子不计入公开主页的帖子数', (pub.get('postCount') or 0) == 0,
      'postCount=%s' % pub.get('postCount'))

st, r = call('GET', '/customer/profile/%s/posts?pageNum=1&pageSize=10' % prof.get('accountId'), token=stu_token)
check('待审核的帖子不出现在别人的主页列表里',
      not any(x.get('postId') == post_id for x in (r.get('rows') or [])), 'total=%s' % r.get('total'))

st, r = call('GET', '/customer/posts/plaza?pageNum=1&pageSize=50', token=stu_token)
check('广场不展示待审核的帖子',
      not any(x.get('postId') == post_id for x in (r.get('rows') or [])), 'total=%s' % r.get('total'))

print('\n7.6) 后台审核帖子 → 通过后才进广场')
admin_token = None
if not ADMIN_PASSWORD:
    print('  SKIP  未设置 TUTOR_ADMIN_PASSWORD，跳过帖子审核段')
else:
    _, lg = call('POST', '/login', {'username': ADMIN_USER, 'password': ADMIN_PASSWORD})
    admin_token = lg.get('token')
    check('管理员登录成功（审核要用）', bool(admin_token), lg.get('msg'))

if admin_token:
    st, r = call('GET', '/system/userPost/pendingCount', token=admin_token)
    check('待审核帖子数 >= 1', int(r.get('data') or 0) >= 1, r.get('data'))

    st, r = call('GET', '/system/userPost/list?auditStatus=0&pageNum=1&pageSize=200', token=admin_token)
    pend = [x.get('postId') for x in (r.get('rows') or [])]
    check('待审核队列里有刚发的帖', post_id in pend, 'total=%s' % r.get('total'))

    st, r = call('GET', '/system/userPost/list?pageNum=1&pageSize=200', token=admin_token)
    check('不传 auditStatus 时列出全部帖子（含已处理）',
          int(r.get('total') or 0) >= 1, 'total=%s' % r.get('total'))

    _, r = call('PUT', '/system/userPost/audit', {'postId': post_id, 'auditStatus': '1'}, token=admin_token)
    check('审核通过', r.get('code') == 200, r.get('msg'))

    st, r = call('GET', '/customer/posts/plaza?pageNum=1&pageSize=50', token=stu_token)
    check('通过后出现在广场上',
          any(x.get('postId') == post_id for x in (r.get('rows') or [])), 'total=%s' % r.get('total'))

    st, r = call('GET', '/customer/profile/%s' % prof.get('accountId'), token=stu_token)
    check('通过后计入公开主页帖子数', (r.get('data') or {}).get('postCount') == 1,
          'postCount=%s' % (r.get('data') or {}).get('postCount'))

    # 第二条：拒绝 + 理由，广场里看不到，作者自己仍能看到被拒理由
    st, r = call('POST', '/customer/posts', {'content': '广告：加微信 xxx 领资料。'}, token=tea_token)
    post2 = r.get('data') or {}
    post2_id = post2.get('postId')
    check('再发一条（待审核）', r.get('code') == 200 and bool(post2_id), r.get('msg'))
    _, r = call('PUT', '/system/userPost/audit',
                {'postId': post2_id, 'auditStatus': '2', 'auditRemark': '含站外联系方式，请修改后重发'},
                token=admin_token)
    check('审核拒绝并能带理由', r.get('code') == 200, r.get('msg'))
    st, r = call('GET', '/customer/posts/mine?pageNum=1&pageSize=10', token=tea_token)
    rej = [x for x in (r.get('rows') or []) if x.get('postId') == post2_id]
    check('作者自己能看到被拒状态与理由',
          bool(rej) and str(rej[0].get('auditStatus')) == '2'
          and '站外联系方式' in (rej[0].get('auditRemark') or ''),
          '%s / %s' % (rej[0].get('auditStatus'), rej[0].get('auditRemark')) if rej else 'not found')
    st, r = call('GET', '/customer/posts/plaza?pageNum=1&pageSize=50', token=stu_token)
    check('被拒的帖子不进广场',
          not any(x.get('postId') == post2_id for x in (r.get('rows') or [])), 'total=%s' % r.get('total'))

    st, r = call('PUT', '/system/userPost/audit', {'postId': post2_id}, token=admin_token)
    check('审核状态不合法被拒（400）', int(r.get('code') or 0) == 400 or st == 400,
          'HTTP %s code=%s' % (st, r.get('code')))
    st, r = call('PUT', '/system/userPost/audit', {'auditStatus': '1'}, token=admin_token)
    check('缺 postId 被拒（400）', int(r.get('code') or 0) == 400 or st == 400,
          'HTTP %s code=%s' % (st, r.get('code')))

print('\n7.7) 删帖（作者本人）与越权删除')
st, r = call('DELETE', '/customer/posts/%s' % post_id, token=other_token)
check('删不掉别人的帖子', r.get('code') == 404, r.get('msg'))
for pid in ([post_id, post2_id] if admin_token else [post_id]):
    _, r = call('DELETE', '/customer/posts/%s' % pid, token=tea_token)
    check('可以删自己的帖子 #%s' % pid, r.get('code') == 200, r.get('msg'))

print('\n8) 取消 / 删除自己的需求')
_, r = call('PUT', '/customer/demands/%s/status' % demand_id, {'status': '3'}, token=stu_token)
check('学生可以取消自己的需求', r.get('code') == 200, r.get('msg'))
_, r = call('GET', '/customer/demands?pageNum=1&pageSize=50', token=tea_token)
check('取消后老师端不再显示', not any(x.get('demandId') == demand_id for x in (r.get('rows') or [])),
      'total=%s' % r.get('total'))
_, r = call('DELETE', '/customer/demands/%s' % demand_id, token=stu_token)
check('学生可以删除自己的需求', r.get('code') == 200, r.get('msg'))
_, r = call('GET', '/customer/demands/%s' % demand_id, token=stu_token)
check('删除后查不到', r.get('code') == 404, r.get('msg'))

print('\n9) 退出登录')
_, r = call('POST', '/customer/auth/logout', token=stu_token)
check('退出成功', r.get('code') == 200, r.get('msg'))
st, r = call('GET', '/customer/auth/me', token=stu_token)
check('退出后旧 token 立即失效', st == 401, 'HTTP %s' % st)

print('\n9.5) 找回密码（邮箱重置码 + 新密码）')
RESET_EMAIL = 'reset%s@example.com' % stamp
RESET_OLD_PW = 'oldpass123'
RESET_NEW_PW = 'newpass456'
_, r = call('POST', '/customer/auth/send-code', {'email': RESET_EMAIL})
reg_code = (r.get('data') or {}).get('devCode')
_, r = call('POST', '/customer/auth/register',
            {'email': RESET_EMAIL, 'password': RESET_OLD_PW, 'code': reg_code, 'nickname': '找回密码测试'})
reset_token = (r.get('data') or {}).get('token')
check('重置密码用的账号已就绪', bool(reset_token), r.get('msg'))

st, r = call('GET', '/customer/auth/me', token=reset_token)
check('账号旧会话可用（改密后应失效）', r.get('code') == 200, r.get('msg'))

_, r = call('POST', '/customer/auth/send-reset-code', {'email': 'nobody%s@example.com' % stamp})
check('未注册邮箱发重置码：仍返回成功（防枚举）', r.get('code') == 200, r.get('msg'))
check('未注册邮箱不返回 devCode、也不真发信',
      'devCode' not in (r.get('data') or {}), r.get('data'))

_, r = call('POST', '/customer/auth/send-reset-code', {'email': RESET_EMAIL})
reset_code = (r.get('data') or {}).get('devCode')
check('已注册邮箱发重置码成功', r.get('code') == 200 and bool(reset_code), r.get('msg'))

_, r = call('POST', '/customer/auth/reset-password',
         {'email': RESET_EMAIL, 'code': reg_code, 'password': RESET_NEW_PW})
check('拿「注册码」当重置码用被拒（用途隔离）', r.get('code') == 400 and '验证码' in (r.get('msg') or ''), r.get('msg'))

_, r = call('POST', '/customer/auth/reset-password',
         {'email': RESET_EMAIL, 'code': reset_code, 'password': '123'})
check('新密码太短被拒', r.get('code') == 400, r.get('msg'))

_, r = call('POST', '/customer/auth/reset-password',
         {'email': RESET_EMAIL, 'code': reset_code, 'password': RESET_NEW_PW})
check('用重置码改密成功', r.get('code') == 200, r.get('msg'))

_, r = call('POST', '/customer/auth/login', {'email': RESET_EMAIL, 'password': RESET_OLD_PW})
check('旧密码已失效', r.get('code') == 400, r.get('msg'))
_, r = call('POST', '/customer/auth/login', {'email': RESET_EMAIL, 'password': RESET_NEW_PW})
check('新密码可以登录', r.get('code') == 200 and bool((r.get('data') or {}).get('token')), r.get('msg'))
st, r = call('GET', '/customer/auth/me', token=reset_token)
check('改密后旧 token 立即失效（会话被踢）', st == 401, 'HTTP %s' % st)

print('\n9.8) 按 IP 限流')
# 用「回环 + X-Forwarded-For」模拟另一个 IP：后端只在直连方是回环时才采信 XFF，
# 这样限流桶是 203.0.113.9，不会把本机 127.0.0.1 的额度烧掉（后面还要跑浏览器用例）
RL_IP = '203.0.113.9'
RATE_LIMITED = False
for i in range(1, 41):
    _, r = call('POST', '/customer/auth/send-code',
                {'email': 'rl%d%s@example.com' % (i, stamp)},
                headers={'X-Forwarded-For': RL_IP})
    if r.get('code') == 429 or '过于频繁' in (r.get('msg') or ''):
        RATE_LIMITED = True
        check('验证码接口按 IP 限流生效', True, '第 %d 次被拦：%s' % (i, r.get('msg')))
        break
if not RATE_LIMITED:
    check('验证码接口按 IP 限流生效', False, '连发 40 次都没被拦（检查 customer.ratelimit 配置）')
RATE_LIMITED_LOGIN = False
for i in range(1, 31):
    _, r = call('POST', '/customer/auth/login',
                {'email': RESET_EMAIL, 'password': 'definitely-wrong'},
                headers={'X-Forwarded-For': '203.0.113.10'})
    if r.get('code') == 429 or '过于频繁' in (r.get('msg') or ''):
        RATE_LIMITED_LOGIN = True
        check('登录接口按 IP+邮箱 限流生效', True, '第 %d 次被拦：%s' % (i, r.get('msg')))
        break
if not RATE_LIMITED_LOGIN:
    check('登录接口按 IP+邮箱 限流生效', False, '连试 30 次都没被拦')

print('\n10) 收尾：清掉本次注册的测试账号')
# 客户账号没有删除接口，直接清库；只删本脚本自己造的那几个邮箱
account_emails = [STUDENT_EMAIL, TEACHER_EMAIL, OTHER_EMAIL, CODE_EMAIL,
                  'reuse%s@example.com' % stamp, 'ok%s@example.com' % stamp,
                  'reset%s@example.com' % stamp]
in_list = ','.join("'%s'" % e for e in account_emails)
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
      '已清 %d 个邮箱' % len(account_emails))

print('\n' + '=' * 72)
print('通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
if FAIL:
    print('失败清单：')
    for f in FAIL:
        print('  - ' + f)
