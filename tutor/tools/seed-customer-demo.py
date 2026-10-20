# -*- coding: utf-8 -*-
"""
演示数据：给客户侧（邮箱账号 + 需求单）灌一批可看的内容。

为什么用脚本调接口而不是写 SQL：
  密码是 BCrypt 哈希，SQL 里手写哈希既容易出错又不真实；
  走真实的注册/发布接口，顺便等于又跑了一遍主流程。

可重复执行：先按邮箱前缀清理自己造过的账号与需求，再重新灌。
账号密码统一 12345678，方便演示登录。
"""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get('TUTOR_API_BASE', 'http://127.0.0.1:12501')
PASSWORD = '12345678'

# (邮箱, 昵称, 身份)
ACCOUNTS = [
    ('teacher.wang@demo.com', '王老师', 'TEACHER'),
    ('teacher.li@demo.com', '李老师', 'TEACHER'),
    ('student.liu@demo.com', '刘同学家长', 'STUDENT'),
    ('student.chen@demo.com', '陈同学家长', 'STUDENT'),
    ('student.zhao@demo.com', '赵同学家长', 'STUDENT'),
]

# (发布者邮箱, 需求内容)
DEMANDS = [
    ('student.liu@demo.com', {
        'title': '初二数学物理，希望找有经验的老师',
        'subjectList': ['数学', '物理'],
        'grade': '初二',
        'budgetMin': 150, 'budgetMax': 250, 'budgetUnit': 'hour',
        'classMode': 'offline', 'city': '北京',
        'description': '孩子数学基础一般，物理刚接触。希望每周两次课，每次两小时，'
                       '最好能上门（海淀区）。有初中教学经验的老师优先，可先试课一次。',
    }),
    ('student.liu@demo.com', {
        'title': '小学五年级英语口语陪练',
        'subjectList': ['英语'],
        'grade': '五年级',
        'budgetMin': 100, 'budgetMax': 160, 'budgetUnit': 'hour',
        'classMode': 'online', 'city': '北京',
        'description': '主要想练口语和听力，线上上课即可，每周三次，每次一小时。'
                       '希望老师发音标准、有耐心，能带孩子开口说。',
    }),
    ('student.chen@demo.com', {
        'title': '高三化学冲刺，目标提分 20+',
        'subjectList': ['化学'],
        'grade': '高三',
        'budgetMin': 300, 'budgetMax': 500, 'budgetUnit': 'hour',
        'classMode': 'both', 'city': '上海',
        'description': '距离高考半年，化学目前 60 分左右，想冲到 80 分。'
                       '需要老师能梳理知识框架、带着刷真题，一周至少两次。预算可以谈。',
    }),
    ('student.chen@demo.com', {
        'title': '初三语文阅读理解与作文',
        'subjectList': ['语文'],
        'grade': '初三',
        'budgetMin': 180, 'budgetMax': 260, 'budgetUnit': 'hour',
        'classMode': 'offline', 'city': '上海',
        'description': '阅读理解失分多，作文也总是写不长。希望老师能教方法、给批改，'
                       '中考前这段时间集中提升。',
    }),
    ('student.zhao@demo.com', {
        'title': '高一数学 + 物理，需要长期辅导',
        'subjectList': ['数学', '物理'],
        'grade': '高一',
        'budgetMin': 200, 'budgetMax': 320, 'budgetUnit': 'hour',
        'classMode': 'both', 'city': '深圳',
        'description': '刚上高一不太适应，想找一位能长期带的老师，每周两到三次。'
                       '线上为主，寒暑假可以线下。希望老师讲题细致、愿意答疑。',
    }),
    ('student.zhao@demo.com', {
        'title': '小学三年级奥数启蒙',
        'subjectList': ['奥数', '数学'],
        'grade': '三年级',
        'budgetMin': 120, 'budgetMax': 200, 'budgetUnit': 'hour',
        'classMode': 'offline', 'city': '深圳',
        'description': '孩子对数字挺感兴趣，想系统学一下奥数思维，为以后竞赛打基础。'
                       '希望老师有小学奥数教学经验，能布置适量作业并跟进。',
    }),
]

OK, FAIL = [], []


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    headers = {'Content-Type': 'application/json;charset=utf-8'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8'))
        except Exception:
            return {'code': e.code, 'msg': 'HTTP %s' % e.code}


def send_code(email):
    r = call('POST', '/customer/auth/send-code', {'email': email})
    return r, (r.get('data') or {}).get('devCode')


def register_or_login(email, password, nickname, role):
    """先发验证码再注册；已存在就直接登录"""
    _, code = send_code(email)
    r = call('POST', '/customer/auth/register',
             {'email': email, 'password': password, 'nickname': nickname, 'code': code or ''})
    if r.get('code') != 200:
        r = call('POST', '/customer/auth/login', {'email': email, 'password': password})
    return r


def step(label, cond, detail=''):
    (OK if cond else FAIL).append(label)
    print(('  OK    ' if cond else '  FAIL  ') + label + (('  -> ' + str(detail)) if detail else ''))


def main():
    print('=== 1) 注册 / 登录演示账号 ===')
    tokens = {}
    for email, nickname, role in ACCOUNTS:
        r = register_or_login(email, PASSWORD, nickname, role)
        token = (r.get('data') or {}).get('token')
        if not token:
            step('%s 注册/登录' % email, False, r.get('msg'))
            continue
        call('PUT', '/customer/auth/role', {'role': role}, token=token)
        tokens[email] = token
        step('%s (%s)' % (email, nickname), True, role)

    print('\n=== 2) 清理上一次灌的需求（保证可重复执行） ===')
    removed = 0
    for email, _nickname, role in ACCOUNTS:
        if role != 'STUDENT':
            continue
        token = tokens.get(email)
        if not token:
            continue
        r = call('GET', '/customer/demands?pageNum=1&pageSize=200', token=token)
        for row in (r.get('rows') or []):
            did = row.get('demandId')
            if did is None:
                continue
            d = call('DELETE', '/customer/demands/%s' % did, token=token)
            if d.get('code') == 200:
                removed += 1
    print('  已清理 %d 条旧需求' % removed)

    print('\n=== 3) 发布演示需求 ===')
    created = 0
    for email, payload in DEMANDS:
        token = tokens.get(email)
        if not token:
            continue
        r = call('POST', '/customer/demands', payload, token=token)
        ok = r.get('code') == 200
        if ok:
            created += 1
        step(payload['title'], ok, r.get('msg'))
    print('\n共创建 %d 条需求' % created)

    print('\n=== 4) 老师端视角确认 ===')
    teacher_token = tokens.get('teacher.wang@demo.com')
    if teacher_token:
        r = call('GET', '/customer/demands?pageNum=1&pageSize=50', token=teacher_token)
        rows = r.get('rows') or []
        print('  老师能看到 %s 条需求' % r.get('total'))
        for row in rows[:3]:
            print('    - %s | %s | %s-%s元/%s | %s' % (
                row.get('title'), '/'.join(row.get('subjectList') or []),
                row.get('budgetMin'), row.get('budgetMax'), row.get('budgetUnit'),
                row.get('studentName')))
        step('老师端至少能看到 1 条需求', len(rows) >= 1, 'total=%s' % r.get('total'))
        r = call('GET', '/customer/demands/stats', token=teacher_token)
        print('  统计：%s' % json.dumps(r.get('data'), ensure_ascii=False)[:200])

    print('\n通过 %d 项，失败 %d 项' % (len(OK), len(FAIL)))
    if FAIL:
        print('失败清单：')
        for f in FAIL:
            print('  - ' + f)


main()
