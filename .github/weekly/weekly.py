# «الفحص الأسبوعي» (weekly.yml, asked every ten minutes): it runs when he presses «شغّل الفحص الآن» in the control panel, or by itself
# on Friday morning while «التشغيل التلقائي» is on. It checks the verses of both sites against the mushaf and a batch of the Sira
# hadith against the hadith encyclopedia, and writes its notes to .github/weekly/notes.json for the panel's «الفحص الأسبوعي» card.
# It changes nothing in the sites' text: each note waits for his choice. A note he ignored is never shown to him again.
import json, os, sys, time, collections, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..', 'cms'))
import apply_post as AP
NOTES = os.path.join(HERE, 'notes.json')
RV = os.path.join(HERE, '..', 'review', 'rv.json')
DURAR = os.environ.get('DURAR_DATA', 'durar_repo/data')
A = '٠١٢٣٤٥٦٧٨٩'; ar = lambda n: ''.join(A[int(c)] if c.isdigit() else c for c in str(n))
riyadh = time.gmtime(time.time() + 3 * 3600); now = time.strftime('%Y-%m-%d %H:%M', riyadh)
out = open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a')
# 1) is it time? (gate.py asked a moment ago; asked again here for the notes he set aside and the reason it runs)
c = AP.post('/c/wkctl'); ctl, st, IGN = c.get('ctl') or {}, c.get('st') or {}, set(c.get('ign') or [])
asked = (ctl.get('run') or 0) > (st.get('start') or 0)
start = int(time.time() * 1000)
AP.post('/c/wkst', {'running': True, 'start': start, 'by': 'أنت' if asked else 'تلقائي', 'phase': 'الآيات', 'stopped': False})
import verses, hadith
old = json.load(open(NOTES, encoding='utf-8')) if os.path.exists(NOTES) else {'notes': [], 'ignored': []}
prev = {n['id']: n for n in old.get('notes', [])}
ignored = {n['id']: n for n in old.get('ignored', [])}
# 2) the verses of both sites against the mushaf
D = json.load(open(RV, encoding='utf-8')); R = D['review']
pic = {}
for x in R:
    if x.get('s') == 'sira' and x.get('img') and isinstance(x.get('p'), int) and isinstance(x.get('b'), int):
        fn, i, n, h = x['img']; m = re.match(r'(\d+)_(\d+)\.png$', fn)
        if m and int(m.group(1)) == x['b']: pic.setdefault(x['b'], collections.Counter())[(int(m.group(2)) * n + i - x['p'], n, h)] += 1
pic = {b: cn.most_common(1)[0][0] for b, cn in pic.items()}
lnk = {}
for x in R:
    if x.get('lnk') and (x.get('f') or '').startswith('sx_'): lnk.setdefault(x['f'], x['lnk'])
def place(x):
    m = re.fullmatch(r't(\d+)\.json', x['f'])
    if m and x['path'][0] == 'p':
        x['b'], x['p'] = int(m.group(1)), x['path'][1]
        if x['s'] == 'durar': x['dimg'] = '%d_%d' % (x['b'], x['p'])
        elif x['b'] in pic:
            off, n, h = pic[x['b']]; g = x['p'] + off
            if g >= 0: x['img'] = ['%d_%03d.png' % (x['b'], g // n), g % n, n, h]
    elif (x.get('f') or '').startswith('sx_'):
        x['b'], x['p'] = 'sx', 0
        if x['f'] in lnk: x['lnk'] = lnk[x['f']]
    return x
by = collections.defaultdict(list)
for x in R: by[(x.get('s'), x.get('f'), x.get('p'))].append(x)
sk = lambda t: re.sub('[^ء-ي]', '', t or '')
def covered(x):   # «فروق النص والطبعة» already has a card on this verse (decided or not): not raised twice
    a = sk(x['old'])
    return any(y.get('sec') == 'v' and sk(y.get('old')) and (sk(y.get('old')) in a or a in sk(y.get('old'))) for y in by[(x['s'], x['f'], x.get('p'))])
V = [place(x) for x in verses.run('sira', 'data') + verses.run('durar', DURAR)]
V = [x for x in V if not covered(x)]
notes = {}
for x in V:
    if x['id'] in IGN: continue
    x['at'] = prev[x['id']]['at'] if x['id'] in prev else now
    notes[x['id']] = x
# 3) a batch of the Sira hadith against the hadith encyclopedia, a different batch each run
AP.post('/c/wkst', {'phase': 'الأحاديث'})
pos = old.get('hpos', 0); N = int(os.environ.get('HADITH_N', '600'))
def stop():
    try: return ((AP.post('/c/wkctl').get('ctl') or {}).get('stop') or 0) > start
    except Exception: return False
hr = hadith.run('data', pos, N, should_stop=stop)
for x in [n for n in prev.values() if n['id'].startswith('wkh_')] + hr['notes']:   # hadith notes stay until he decides
    if x['id'] in IGN or x['id'] in notes: continue
    if x['f'] in lnk: x['lnk'] = lnk[x['f']]
    x.setdefault('at', now); notes[x['id']] = x
# the notes he ignored move to their own list, with what they said, and are skipped from now on
for i in IGN:
    if i in prev and i not in ignored: ignored[i] = prev[i]
new = [n for n in notes.values() if n['id'] not in prev]
J = {'at': now, 'by': 'أنت' if asked else 'تلقائي', 'stopped': hr.get('stopped', False), 'hpos': hr['next'],
     'count': {'verses': sum(1 for n in notes if n.startswith('wkv_')), 'hadith': sum(1 for n in notes if n.startswith('wkh_')), 'new': len(new),
               'hadith_checked': hr['checked'], 'hadith_total': hr['total'], 'hadith_errs': hr['errs']},
     'notes': sorted(notes.values(), key=lambda n: (n.get('at', ''), n['id']), reverse=True), 'ignored': list(ignored.values())}
json.dump(J, open(NOTES, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
out.write('ran=1\n')
AP.post('/c/wkst', {'running': False, 'done': int(time.time() * 1000), 'phase': '', 'stopped': J['stopped'], 'count': J['count']})
print(json.dumps(J['count'], ensure_ascii=False))
# a word to his phone
nv = sum(1 for n in new if n['id'].startswith('wkv_')); nh = len(new) - nv
t = ('ملاحظات جديدة: ' + ('%s على الآيات' % ar(nv) if nv else '') + ('، ' if nv and nh else '') + ('%s على الأحاديث' % ar(nh) if nh else '')) if new else 'لا ملاحظات جديدة'
b = ('أوقفته قبل أن يتم. ' if J['stopped'] else '') + 'قوبلت آيات الموقعين كلها بالمصحف، و%s حديثاً من أحاديث السيرة بالموسوعة الحديثية. ' % ar(hr['checked']) + ('افتح «الفحص الأسبوعي» في لوحة التحكم.' if new else '')
if hr['errs'] > hr['checked']: b += ' وتعذّر الوصول إلى الموسوعة الحديثية هذه المرة.'
try: AP.post('/c/report', {'t': 'الفحص الأسبوعي: ' + t, 'b': b, 'tag': 'wk'})
except Exception as x: print('report to phone failed:', x)
