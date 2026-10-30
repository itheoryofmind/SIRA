# الفحص الأسبوعي الشامل (weekly.yml): آيات الموقعين بالمصحف، ودفعة من متون أحاديث السيرة بالموسوعة الحديثية،
# وما يُوجد يصير بطاقات في «فروق النص والطبعة» في لوحة التحكم (rv.json)، ولكل بطاقة «تجاهل هذه الملاحظة».
# Nothing in the sites' text is changed here. A note the keeper ignored stays ignored (his choice is kept by the card's id).
import json, os, sys, time, collections, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import verses, hadith
RV = os.path.join(HERE, '..', 'review', 'rv.json')
ST = os.path.join(HERE, 'state.json')
HN = os.path.join(HERE, 'hnotes.json')
DURAR = os.environ.get('DURAR_DATA', 'durar_repo/data')
A = '٠١٢٣٤٥٦٧٨٩'; ar = lambda n: ''.join(A[int(c)] if c.isdigit() else c for c in str(n))
now = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 3 * 3600))
D = json.load(open(RV, encoding='utf-8')); R = D['review']
old_ids = {c['id'] for c in R}
# the page picture of a Sira book page, learnt from the cards that have one: book -> (offset, frames per picture, frame height)
pic = {}
for c in R:
    if c.get('s') == 'sira' and c.get('img') and isinstance(c.get('p'), int) and isinstance(c.get('b'), int):
        fn, i, n, h = c['img']; m = re.match(r'(\d+)_(\d+)\.png$', fn)
        if m and int(m.group(1)) == c['b']: pic.setdefault(c['b'], collections.Counter())[(int(m.group(2)) * n + i - c['p'], n, h)] += 1
pic = {b: cn.most_common(1)[0][0] for b, cn in pic.items()}
# the place of a hadith collection on the Sira site, learnt the same way: file -> link
lnk = {}
for c in R:
    if c.get('lnk') and (c.get('f') or '').startswith('sx_'): lnk.setdefault(c['f'], c['lnk'])
def place(c):
    m = re.fullmatch(r't(\d+)\.json', c['f'])
    if m and c['path'][0] == 'p':
        c['b'], c['p'] = int(m.group(1)), c['path'][1]
        if c['s'] == 'durar': c['dimg'] = '%d_%d' % (c['b'], c['p'])
        elif c['b'] in pic:
            off, n, h = pic[c['b']]; g = c['p'] + off
            if g >= 0: c['img'] = ['%d_%03d.png' % (c['b'], g // n), g % n, n, h]
    return c
# 1) the verses of both sites against the mushaf
V = [place(c) for c in verses.run('sira', 'data') + verses.run('durar', DURAR)]
nwk = [c for c in R if not c.get('wk')]
by = collections.defaultdict(list)
for c in nwk: by[(c.get('s'), c.get('f'), c.get('p'))].append(c)
sk = lambda t: re.sub('[^ء-ي]', '', t or '')
def covered(c):   # a card the panel already has on the same verse
    a = sk(c['old'])
    return any(x.get('sec') == 'v' and sk(x.get('old')) and (sk(x.get('old')) in a or a in sk(x.get('old'))) for x in by[(c['s'], c['f'], c.get('p'))])
V = [c for c in V if not covered(c)]
for c in V: c['why'] = 'الفحص الأسبوعي (' + now + '): ' + c['why']
# 2) a batch of the Sira hadith against the hadith encyclopedia, a different batch each week
st = json.load(open(ST)) if os.path.exists(ST) else {'h': 0}
N = int(os.environ.get('HADITH_N', '600'))
hr = hadith.run('data', st.get('h', 0), N)
HNOTES = json.load(open(HN, encoding='utf-8')) if os.path.exists(HN) else {}
for c in hr['notes']:
    if c['f'] in lnk: c['lnk'] = lnk[c['f']]
    if c['id'] not in HNOTES:
        c['why'] = 'الفحص الأسبوعي (' + now + '): ' + c['why']; HNOTES[c['id']] = c
st['h'] = hr['next']; st['at'] = now; st['last'] = {k: hr[k] for k in ('total', 'checked', 'nores', 'errs')}
# the cards: last week's verse notes give way to this week's (a corrected verse leaves the list); hadith notes stay
D['review'] = nwk + V + list(HNOTES.values())
new = [c for c in V + list(HNOTES.values()) if c['id'] not in old_ids]
D['wk'] = {'at': now, 'verses': len(V), 'hadith': len(HNOTES), 'new': len(new), 'hadith_checked': hr['checked'], 'hadith_total': hr['total']}
json.dump(D, open(RV, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(HNOTES, open(HN, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(st, open(ST, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps(D['wk'], ensure_ascii=False), json.dumps(st['last']))
# a word to his phone
try:
    sys.path.insert(0, os.path.join(HERE, '..', 'cms')); import apply_post as AP
    nv = sum(1 for c in new if c['id'].startswith('wkv_')); nh = len(new) - nv
    t = ('ملاحظات جديدة: ' + ('%s على الآيات' % ar(nv) if nv else '') + ('، ' if nv and nh else '') + ('%s على الأحاديث' % ar(nh) if nh else '')) if new else 'لا ملاحظات جديدة'
    b = 'قوبلت آيات الموقعين كلها بالمصحف، و%s حديثاً من أحاديث السيرة بالموسوعة الحديثية (من %s). ' % (ar(hr['checked']), ar(hr['total'])) + ('افتح «فروق النص والطبعة» في اللوحة.' if new else '')
    if hr['errs'] > hr['checked']: b += ' وتعذّر الوصول إلى الموسوعة الحديثية هذا الأسبوع.'
    AP.post('/c/report', {'t': 'الفحص الأسبوعي: ' + t, 'b': b, 'tag': 'wk'})
except Exception as x:
    print('report to phone failed:', x)
