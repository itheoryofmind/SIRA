# لوحة المحتوى: writes the keeper's waiting corrections into the site's files. Run by .github/workflows/cms.yml (in each site's repository).
# Each correction names a data file and the place of one text in it (or the site's own wording, f = 'ui'), the text as he saw it,
# and the corrected text. It is applied only if the text there is still the one he saw. Then the page's file list (index.html)
# gets the file's new fingerprint so readers' saved copies are renewed, and the same text in the search-engine pages is corrected.
# Before anything is published every script of the page must still parse and every data file must still be valid JSON;
# otherwise nothing is published and each correction is reported back as refused, with the reason.
import json, os, sys, re, html, glob, hashlib, time, subprocess, urllib.request

W = os.environ.get('CMS_W', 'https://push.seeratuh.com')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ui as UIM

def auth():
    # GitHub's signed token says which repository this is; the deploy key is the older way, kept for the Sira repository
    u, t = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'), os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    if u and t:
        r = urllib.request.Request(u + '&audience=seeratuh-cms', headers={'Authorization': 'bearer ' + t})
        return {'X-OIDC': json.load(urllib.request.urlopen(r, timeout=30))['value']}
    return {'X-Admin': hashlib.sha256(os.environ['CLOUDFLARE_API_TOKEN'].encode()).hexdigest()[:40]}
HDR = auth()

def post(p, o=None):
    r = urllib.request.Request(W + p, data=json.dumps(o or {}).encode(), method='POST',
                               headers={**HDR, 'Content-Type': 'application/json', 'User-Agent': 'site-cms'})
    return json.load(urllib.request.urlopen(r, timeout=60))

def git(*a):
    return subprocess.run(['git', *a], check=True, capture_output=True, text=True).stdout.strip()

def dump(d):
    return json.dumps(d, ensure_ascii=False, separators=(',', ':'))

def uadj(d, path, old, new):
    # the verse marks of a book page (data 'u') follow the corrected text: a verse span's places move with the text,
    # and a verse whose words changed is no longer shown in the mushaf's script until it is checked again
    import difflib
    try:
        if not (isinstance(d, dict) and 'u' in d and len(path) == 3 and path[0] == 'p'): return
        L = d['u'].get(str(path[1]))
        if not L: return
        it = path[2] - 1
        ops = difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes()
        def f(i, end=False):
            for tag, a1, a2, b1, b2 in ops:
                if a1 <= i < a2 or (end and i == a2 and tag == 'equal'):
                    return b1 + (i - a1) if tag == 'equal' else (b2 if end else b1)
            return len(new)
        # each verse of the paragraph by its place: the k-th { with its words up to its } (or to the end, a verse that goes on to
        # the next page), and k = -1 the words before the first } (a verse begun on the page before); only a verse whose own
        # words changed loses its mushaf script, not one beside the change
        br = lambda t: {t[:m.start()].count('{'): m.group(1) for m in re.finditer(r'\{([^{}]*)(?:\}|$)', t)}
        def cont(t):
            j = t.find('}')
            return t[:j] if j >= 0 and '{' not in t[:j] else None
        bo, bn = br(old), br(new)
        for r in L:
            if r[0] != it: continue
            if r[1] == 's':
                r[6], r[7] = f(r[6]), f(r[7], True)
            elif isinstance(r[1], int) and r[2]:
                k = r[1]
                if k == -1: same = cont(old) is not None and cont(old) == cont(new)
                else: same = k in bo and bo.get(k) == bn.get(k)
                if not same:
                    r[2] = None; r[3] = None
    except Exception:
        pass

def patch(cur, old, new):
    # his change (old -> new) carried onto the text as it is now, when every changed part is still found there once, with its surroundings
    import difflib
    ops = [o for o in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes() if o[0] != 'equal']
    if not ops: return cur
    H = []
    for t, a1, a2, b1, b2 in ops:
        if H and a1 - H[-1][1] < 40: H[-1] = [H[-1][0], a2, H[-1][2], b2]
        else: H.append([a1, a2, b1, b2])
    out = cur
    for a1, a2, b1, b2 in reversed(H):
        L, R = old[max(0, a1 - 25):a1], old[a2:a2 + 25]
        k = L + old[a1:a2] + R
        if not k.strip() or out.count(k) != 1: return None
        out = out.replace(k, L + new[b1:b2] + R)
    return out

def verse(t):
    return re.sub(r'\{\s*', '﴿', re.sub(r'\s*\}', '﴾', t))

r = post('/c/pending')
E = sorted(r.get('edits') or [], key=lambda e: e['id'])
print('site:', r.get('site'), 'waiting:', len(E))
if not E:
    sys.exit(0)

OPEN = {}      # file -> [data, original text]
done = []      # (edit, ok, message)
IX0 = open('index.html', encoding='utf-8').read(); UIX = IX0; UIL = UIM.load()
for e in E:
    f = e['f']
    if f == 'ui':      # the site's own wording, in the page itself: one at a time, each checked
        t2, n = UIM.apply(UIX, e['old'], e['nw'])
        if UIM.BAD.search(e['nw']): done.append((e, False, 'لا تُستعمل في ألفاظ الموقع علامات التنصيص ولا < > ولا \\')); continue
        if not n: done.append((e, False, 'لم يوجد هذا اللفظ بعينه في الموقع')); continue
        if not UIM.js_ok(t2): done.append((e, False, 'هذا التعديل يُخلّ بعمل الموقع، فلم يُنشر')); continue
        UIX = t2; UIL.append({'old': e['old'], 'nw': e['nw']}); done.append((e, True, 'عُدِّل في %d موضع' % n)); continue
    if not re.fullmatch(r'[a-z0-9_]{1,40}\.json', f) or not os.path.exists('data/' + f):
        done.append((e, False, 'الملف غير موجود')); continue
    if f not in OPEN:
        s = open('data/' + f, encoding='utf-8').read()
        OPEN[f] = [json.loads(s), s]
    d = OPEN[f][0]
    try:
        o = d
        for k in e['path'][:-1]:
            o = o[k]
        last = e['path'][-1]
        cur = o[last]
    except Exception:
        done.append((e, False, 'الموضع لم يعد موجوداً')); continue
    if e['path'][0] == 'u' and isinstance(cur, list):
        # a verse's mushaf place (for its tafsir and aya number), from «الفحص الأسبوعي»: only if it is still as seen, and the new
        # place's mushaf text holds exactly the words shown
        try:
            new = json.loads(e['nw'])
            import umatch as UM
            TMK = re.compile(r'\s*۝[٠-٩]+\s*'); nm = lambda t: ' '.join(x for x in TMK.sub(' ', t).split() if x != '\u06de')
            UT = {(q[0], q[1]): q[2] for q in UM.Q}
            ok_ = (json.dumps(cur, ensure_ascii=False, separators=(',', ':')) == e['old'] and isinstance(new, list) and len(new) == len(cur) and new[:2] == cur[:2]
                   and all(isinstance(new[i], int) for i in (3, 4, 5)) and new[4] <= new[5]
                   and nm(new[2]) in ' '.join(nm(UT.get((new[3], a), '')) for a in range(new[4], new[5] + 1)))
        except Exception:
            ok_ = False
        if not ok_:
            done.append((e, False, 'لم يُطبَّق: تغيّر هذا الموضع منذ الفحص، أو الموضع الجديد لا يطابق نص الآية')); continue
        o[last] = new; done.append((e, True, 'صُحّح موضع الآية في المصحف')); continue
    if f == 'mid.json' and len(e['path']) == 1 and isinstance(cur, list):
        # «يخالف المطبوع» marks of a page taken away from the panel after his choice there: nw = {"rm": [[item, offset], ...],
        # "dl": n} — those marks are dropped from the page's marks as they are now (so two choices on one page do not clash), and a
        # later mark in the same paragraph moves by the length of the text he put in before it
        try:
            q = json.loads(e['nw']); rm = [list(x[:2]) for x in q['rm']]; dl = int(q.get('dl') or 0)
            ok_ = bool(rm) and all(isinstance(a, int) and isinstance(b, int) for a, b in rm)
        except Exception:
            ok_ = False
        if not ok_:
            done.append((e, False, 'لم يُطبَّق: طلب إزالة العلامة غير مفهوم')); continue
        new = [x for x in cur if list(x[:2]) not in rm]
        if len(new) == len(cur):
            done.append((e, True, 'العلامة كانت قد أُزيلت')); continue
        new = [[x[0], x[1] + dl] + list(x[2:]) if dl and x[0] == rm[0][0] and x[1] > rm[0][1] else x for x in new]
        if new: o[last] = new
        else: del o[last]
        done.append((e, True, 'أُزيلت علامة «يخالف المطبوع» من هذا الموضع')); continue
    if not isinstance(cur, str):
        done.append((e, False, 'الموضع ليس نصاً')); continue
    msg = ''
    nw = e['nw']
    if cur != e['old']:
        if not e.get('force'):
            done.append((e, False, 'تغيّر النص في هذا الموضع بعد أن فتحته (نُشر عليه تعديل آخر قبل تعديلك)، فلم يُطبَّق حتى لا يضيع ذلك التعديل. إن كنت متأكداً فاضغط «أُصرّ على تعديلي».')); continue
        p2 = patch(cur, e['old'], e['nw'])
        if p2 is not None: nw = p2; msg = 'طُبّق تعديلك على النص الحالي مع إبقاء التعديل الآخر.'
        else: msg = 'لم يمكن جمعه مع التعديل الآخر، فكُتب نصك كما هو مكان النص كله (بإصرارك).'
    o[last] = nw
    e['_old'], e['_nw'] = cur, nw
    uadj(d, e['path'], cur, nw)
    done.append((e, True, msg))

# a verse he corrected is shown again in the mushaf's script when its words are now the mushaf's words (umatch.py)
try:
    import umatch
    for f, (d, s) in OPEN.items():
        if not (isinstance(d, dict) and 'p' in d): continue
        pgs = {e['path'][1] for e, g, m in done if g and e.get('f') == f and len(e['path']) == 3 and e['path'][0] == 'p'}
        for pg in sorted(pgs | {p + 1 for p in pgs if p + 1 < len(d['p'])} | {p - 1 for p in pgs if p > 0}):
            umatch.page(d, pg)
except Exception as x:
    print('mushaf script not refreshed:', x)
# a verse that was in the mushaf's script before his correction and is not now: said in his result, never silently; each such
# verse is told once, in the result of the correction made in its own paragraph (else the one on the page next to it)
try:
    P3 = [(n, e) for n, (e, g, m) in enumerate(done) if g and e.get('f') != 'ui' and len(e.get('path') or []) == 3 and e['path'][0] == 'p']
    LOST = {}
    for f in {e['f'] for n, e in P3}:
        d, s = OPEN[f]; d0 = json.loads(s)
        for q in sorted({e['path'][1] + k for n, e in P3 if e['f'] == f for k in (-1, 0, 1)}):
            was = {(r[0], r[1]): r[2] for r in (d0.get('u', {}).get(str(q)) or []) if isinstance(r[1], int) and r[2]}
            now = {(r[0], r[1]) for r in (d.get('u', {}).get(str(q)) or []) if isinstance(r[1], int) and r[2]}
            for k, u in was.items():
                if k in now: continue
                own = [n for n, e in P3 if e['f'] == f and e['path'][1] == q and e['path'][2] == k[0] + 1]
                near = [n for n, e in P3 if e['f'] == f and abs(e['path'][1] - q) <= 1]
                if own or near: LOST.setdefault((own or near)[0], []).append(u)
    # a verse whose words he changed and that still shows in the mushaf's script: his text differs from the mushaf's only in
    # spelling (hamza, vowel marks, ى/ي, ة/ه), so the reader sees no change; said in his result, so he knows it was not lost
    KEPT = {}; NOTM = {}
    BR = lambda t: {t[:m.start()].count('{'): m.group(1) for m in re.finditer(r'\{([^{}]*)(?:\}|$)', t)}
    CT = lambda t: t[:t.find('}')] if '}' in t and '{' not in t[:t.find('}')] else None
    for n, e in P3:
        o_, w_ = e.get('_old'), e.get('_nw')
        if not isinstance(o_, str) or not isinstance(w_, str): continue
        d = OPEN[e['f']][0]; it = e['path'][2] - 1
        now = {(r[0], r[1]) for r in (d.get('u', {}).get(str(e['path'][1])) or []) if isinstance(r[1], int) and r[2]}
        bo, bn = BR(o_), BR(w_); ch = [k for k in bn if k in bo and bo[k] != bn[k]]
        if CT(o_) is not None and CT(w_) is not None and CT(o_) != CT(w_): ch.append(-1)
        if any((it, k) in now for k in ch): KEPT[n] = 1
        # a verse he added or changed that is not shown in the mushaf's script now: said too, so a verse is never left in the book's
        # wording without his knowing
        NEWV = [k for k in bn if bo.get(k) != bn[k] and len(bn[k].split()) >= 2 and (it, k) not in now]
        if NEWV: NOTM.setdefault(n, []).extend(bn[k] for k in NEWV)
    for n, L in NOTM.items():
        e, g, m = done[n]
        if 'لم تعد تظهر برسم المصحف' in (m or ''): continue
        done[n] = (e, g, (m + ' ' if m else '') + 'تنبيه: ' + ('هذه الآيات تظهر' if len(L) > 1 else 'هذه الآية تظهر') + ' للقارئ بلفظ الكتاب لا برسم المصحف، لأن نصها لا يطابق كلمات المصحف كلمةً كلمة: ' + '، '.join('«' + t[:60] + '»' for t in L[:3]) + '. راجعها، أو اخترها من لفظ المصحف.')
    for n in KEPT:
        e, g, m = done[n]
        done[n] = (e, g, (m + ' ' if m else '') + 'الآية التي عدّلتها ما زالت تظهر للقارئ برسم المصحف كما كانت، لأن الفرق بين نصك ونص المصحف في الإملاء فقط (الهمزة أو التشكيل أو الياء والألف المقصورة أو التاء المربوطة والهاء)؛ فلا يتغير ما يراه القارئ، ويُصلَح النص المحفوظ الذي يُبحث فيه.')
    for n, lost in LOST.items():
        e, g, m = done[n]
        w = 'تنبيه: ' + ('هذه الآيات لم تعد تظهر' if len(lost) > 1 else 'هذه الآية لم تعد تظهر') + ' برسم المصحف، لأن نصها بعد التعديل لا يطابق كلمات المصحف كلمةً كلمة، فتظهر بلفظ الكتاب. ' + ('وهي التي أولها: ' if len(lost) == 1 else 'وأوائلها: ') + '، '.join('«' + re.sub('[\u064B-\u065F\u0670\u06D6-\u06ED]', '', u)[:60] + '»' for u in lost[:3]) + '. راجعها.'
        done[n] = (e, g, (m + ' ' if m else '') + w)
except Exception as x:
    print('verse check not reported:', x)

ok = [x for x in done if x[1]]
okd = [x for x in ok if x[0]['f'] != 'ui']
sha = ''
if ok:
    changed = set()
    for f, (d, s) in OPEN.items():
        t = dump(d) + ('\n' if s.endswith('\n') else '')
        if t != s:
            json.loads(t); open('data/' + f, 'w', encoding='utf-8').write(t); changed.add(f)
    if UIX != IX0:
        open('index.html', 'w', encoding='utf-8').write(UIX)
        json.dump(UIL, open(UIM.UI, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    # the Prophet's words marked in a quotation are kept by the quotation's text: follow the corrected text
    gp = 'data/sx_gold.json'
    if os.path.exists(gp):
        gs = open(gp, encoding='utf-8').read(); G = json.loads(gs); gch = False
        for e, _, _ in okd:
            if e['old'] in G and e['nw'] not in G:
                G = {(e['nw'] if k == e['old'] else k): v for k, v in G.items()}; gch = True
        if gch:
            open(gp, 'w', encoding='utf-8').write(dump(G) + ('\n' if gs.endswith('\n') else '')); changed.add('sx_gold.json')
    # the notes «مواضع الخلاف مع المطبوع» (marks.json) on a word he has now corrected go with it: a note is dropped when its words
    # were in the text he saw and are no longer in his corrected text (read the same way the page finds them, marks.js mkNorm)
    mp = 'data/marks.json'
    if os.path.exists(mp) and any(re.fullmatch(r't\d+\.json', e['f']) for e, _, _ in okd):
        def mkn(t):
            t = t.replace('\ufdfa', ' صلي الله عليه وسلم ')
            t = re.sub('[\u064b-\u0652\u0640\u0670\u06d6-\u08f0\u06ed-\u08ff]', '', t)
            for x, y in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ٱ', 'ا'), ('ى', 'ي'), ('ة', 'ه'), ('ؤ', 'و'), ('ئ', 'ي')):
                t = t.replace(x, y)
            return ' ' + ' '.join(re.sub('[^\u0621-\u064a]', ' ', t).split()) + ' '
        ms = open(mp, encoding='utf-8').read(); MK = json.loads(ms); mch = False
        for e, _, _ in okd:
            m = re.fullmatch(r't(\d+)\.json', e['f'])
            if not m: continue
            o, w = mkn(e['old']), mkn(e['nw'])
            for k in [k for k in MK if k.split(':')[0] == m.group(1)]:
                keep = []
                for x in MK[k]:
                    ph = ' ' + ((x[1] + ' ') if x[1] else '') + x[2] + ' '
                    if x[2] and ph in o and ph not in w: mch = True; continue
                    keep.append(x)
                if keep: MK[k] = keep
                else: del MK[k]
        if mch:
            open(mp, 'w', encoding='utf-8').write(dump(MK) + ('\n' if ms.endswith('\n') else '')); changed.add('marks.json')
    # the search-engine pages: the same text, where it appears whole
    for p in glob.glob('*/index.html'):
        h = open(p, encoding='utf-8').read(); h0 = h
        for e, _, _ in okd:
            for a, b in {(html.escape(e['old']), html.escape(e['nw'])), (html.escape(verse(e['old'])), html.escape(verse(e['nw'])))}:
                if len(e['old']) >= 8 and '>' + a + '<' in h:
                    h = h.replace('>' + a + '<', '>' + b + '<')
        if h != h0:
            open(p, 'w', encoding='utf-8').write(h)
    # «تعديلاتي» in the control panel: every correction he published, kept for good (.github/cms/mine.json)
    try:
        import difflib
        MP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mine.json')
        MN = json.load(open(MP, encoding='utf-8')) if os.path.exists(MP) else []
        now = time.strftime('%Y-%m-%d %H:%M', time.gmtime(time.time() + 3 * 3600))
        for e, _, m in ok:
            a_, b_ = (e['old'], e['nw']) if e['f'] == 'ui' else (e.get('_old', e['old']), e.get('_nw', e['nw']))
            H = []
            for t, a1, a2, b1, b2 in difflib.SequenceMatcher(None, a_, b_, autojunk=False).get_opcodes():
                if t == 'equal': continue
                if H and a1 - H[-1][1] < 12: H[-1] = [H[-1][0], a2, H[-1][2], b2]
                else: H.append([a1, a2, b1, b2])
            ch = [{'pre': a_[max(0, a1 - 50):a1], 'old': a_[a1:a2], 'new': b_[b1:b2], 'post': a_[a2:a2 + 50]} for a1, a2, b1, b2 in H[:6]]
            MN.append({'at': now, 'f': e['f'], 'path': e['path'], 'ch': ch, 'nw': b_ if e['f'] != 'ui' else '', 'lb': e.get('lb') or '', 'sec': e.get('sec') or '', 'note': e.get('note') or '', 'msg': m or ''})
        open(MP, 'w', encoding='utf-8').write(json.dumps(MN, ensure_ascii=False, separators=(',', ':')))
    except Exception as x:
        print('mine.json not updated:', x)
    # new fingerprints and a new version, so open copies of the site fetch the corrected files
    ix = open('index.html', encoding='utf-8').read()
    for f in sorted(changed):
        hsh = hashlib.md5(open('data/' + f, encoding='utf-8').read().encode()).hexdigest()[:10]
        ix, n = re.subn(r'("data/' + re.escape(f) + r'": ")[0-9a-f]+(")', lambda m: m.group(1) + hsh + m.group(2), ix)
        if not n:
            ix, n = re.subn(r'const DH=\{', lambda m: 'const DH={"data/' + f + '": "' + hsh + '", ', ix, count=1)
        if not n: print('no fingerprint for', f)
    V = time.strftime('%Y-%m-%d-%H%M', time.gmtime(time.time() + 3 * 3600))   # Riyadh time, as the deploy writes it
    ix = re.sub(r"const APP_VER='[^']*'", "const APP_VER='" + V + "'", ix, count=1)
    if not UIM.js_ok(ix):
        git('checkout', '--', '.')
        done = [(e, False, 'تعذّر النشر: الموقع لم يجتز الفحص بعد التعديل') if g else (e, g, m) for e, g, m in done]
        ok = []
    else:
        open('index.html', 'w', encoding='utf-8').write(ix)
        open('version.json', 'w').write('{"v":"%s"}\n' % V)
        secs = sorted({e.get('sec') or ('ألفاظ الموقع' if e['f'] == 'ui' else e['f']) for e, _, _ in ok})
        notes = [e.get('note') for e, _, _ in ok if e.get('note')]
        msg = 'لوحة المحتوى: ' + '، '.join(secs) + ('\n\n' + '\n'.join(notes) if notes else '')
        git('add', '-A')
        git('-c', 'user.name=لوحة المحتوى', '-c', 'user.email=cms@seeratuh.com', 'commit', '-qm', msg)
        for i in range(4):
            try:
                git('push', '-q', 'origin', 'HEAD'); break
            except subprocess.CalledProcessError:
                git('pull', '-q', '--rebase', 'origin', git('rev-parse', '--abbrev-ref', 'HEAD'))
        else:
            print('push failed'); sys.exit(1)
        sha = git('rev-parse', 'HEAD')

open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a').write('pushed=%s\n' % ('1' if ok else ''))
for e, good, m in done:
    try:
        post('/c/done', {'id': e['id'], 'st': 'ok' if good else 'err', 'msg': m, 'sha': sha if good else ''})
    except Exception as x:
        print('report failed', e['id'], x)
    print(e['id'], 'ok' if good else 'refused: ' + m)

# a word to his phone: how many were published, and each refused one with its reason
try:
    ng = sum(1 for x in done if x[1]); bad = [x for x in done if not x[1]]
    if done:
        t = ('نُشر %d تعديلاً' % ng if ng else '') + ('، ' if ng and bad else '') + ('لم يُنشر %d' % len(bad) if bad else '')
        lines = [((e.get('lb') or e['f']) + ': ' + m)[:160] for e, _, m in bad[:4]]
        body = '\n'.join(lines) if bad else 'كل ما حفظته نُشر في الموقع. التفاصيل في «تعديلاتي» في اللوحة.'
        if bad: body += '\nوللإصرار عليه: «سجل تصحيح النصوص» ← «أُصرّ على تعديلي».'
        post('/c/report', {'t': t.translate(str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')), 'b': body, 'tag': 'pub'})
except Exception as x:
    print('report to phone failed:', x)
