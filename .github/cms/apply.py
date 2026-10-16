# لوحة المحتوى: writes the keeper's waiting corrections into the site's files. Run by .github/workflows/cms.yml.
# Each correction names a data file, the place of one text in it, the text as he saw it, and the corrected text.
# It is applied only if the text there is still the one he saw; then the page's file list (index.html) gets the file's new
# fingerprint so readers' saved copies are renewed, and the same text in the search-engine pages is corrected too.
import json, os, sys, re, html, glob, hashlib, time, subprocess, urllib.request

W = os.environ.get('CMS_W', 'https://push.seeratuh.com')
ADMIN = hashlib.sha256(os.environ['CLOUDFLARE_API_TOKEN'].encode()).hexdigest()[:40]

def post(p, o=None):
    r = urllib.request.Request(W + p, data=json.dumps(o or {}).encode(), method='POST',
                               headers={'X-Admin': ADMIN, 'Content-Type': 'application/json', 'User-Agent': 'sira-cms'})
    return json.load(urllib.request.urlopen(r, timeout=60))

def git(*a):
    return subprocess.run(['git', *a], check=True, capture_output=True, text=True).stdout.strip()

def dump(d):
    return json.dumps(d, ensure_ascii=False, separators=(',', ':'))

def verse(t):
    return re.sub(r'\{\s*', '﴿', re.sub(r'\s*\}', '﴾', t))

r = post('/c/pending')
E = sorted(r.get('edits') or [], key=lambda e: e['id'])
if not E:
    print('nothing waiting'); sys.exit(0)

OPEN = {}      # file -> [data, original text]
done = []      # (edit, ok, message)
for e in E:
    f = e['f']
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
    if cur != e['old']:
        done.append((e, False, 'تغيّر النص في هذا الموضع منذ فتحته؛ افتحه من جديد')); continue
    o[last] = e['nw']
    done.append((e, True, ''))

ok = [x for x in done if x[1]]
changed = set()
for f, (d, s) in OPEN.items():
    t = dump(d) + ('\n' if s.endswith('\n') else '')
    if t != s:
        open('data/' + f, 'w', encoding='utf-8').write(t); changed.add(f)

if ok:
    # the Prophet's words marked in a quotation are kept by the quotation's text: follow the corrected text
    gp = 'data/sx_gold.json'
    gs = open(gp, encoding='utf-8').read(); G = json.loads(gs); gch = False
    for e, _, _ in ok:
        if e['old'] in G and e['nw'] not in G:
            G = {(e['nw'] if k == e['old'] else k): v for k, v in G.items()}; gch = True
    if gch:
        open(gp, 'w', encoding='utf-8').write(dump(G) + ('\n' if gs.endswith('\n') else '')); changed.add('sx_gold.json')
    # the search-engine pages: the same text, where it appears whole
    for p in glob.glob('*/index.html'):
        h = open(p, encoding='utf-8').read(); h0 = h
        for e, _, _ in ok:
            for a, b in {(html.escape(e['old']), html.escape(e['nw'])), (html.escape(verse(e['old'])), html.escape(verse(e['nw'])))}:
                if len(e['old']) >= 8 and a in h:
                    h = h.replace(a, b)
        if h != h0:
            open(p, 'w', encoding='utf-8').write(h)
    # new fingerprints and a new version, so open copies of the site fetch the corrected files
    ix = open('index.html', encoding='utf-8').read()
    for f in sorted(changed):
        hsh = hashlib.md5(open('data/' + f, encoding='utf-8').read().encode()).hexdigest()[:10]
        ix, n = re.subn(r'("data/' + re.escape(f) + r'": ")[0-9a-f]+(")', lambda m: m.group(1) + hsh + m.group(2), ix)
        if not n: print('no fingerprint for', f)
    V = time.strftime('%Y-%m-%d-%H%M', time.gmtime(time.time() + 3 * 3600))   # Riyadh time, as the deploy writes it
    ix = re.sub(r"const APP_VER='[^']*'", "const APP_VER='" + V + "'", ix, count=1)
    open('index.html', 'w', encoding='utf-8').write(ix)
    open('version.json', 'w').write('{"v":"%s"}\n' % V)

    secs = sorted({e.get('sec') or e['f'] for e, _, _ in ok})
    notes = [e.get('note') for e, _, _ in ok if e.get('note')]
    msg = 'لوحة المحتوى: ' + '، '.join(secs) + ('\n\n' + '\n'.join(notes) if notes else '')
    git('add', '-A')
    git('-c', 'user.name=لوحة المحتوى', '-c', 'user.email=cms@seeratuh.com', 'commit', '-qm', msg)
    for i in range(4):
        try:
            git('push', '-q', 'origin', 'HEAD'); break
        except subprocess.CalledProcessError:
            git('pull', '-q', '--rebase', 'origin', 'main')
    else:
        print('push failed'); sys.exit(1)
    sha = git('rev-parse', 'HEAD')
else:
    sha = ''

for e, good, m in done:
    post('/c/done', {'id': e['id'], 'st': 'ok' if good else 'err', 'msg': m, 'sha': sha if good else ''})
    print(e['id'], 'ok' if good else 'refused: ' + m)
open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a').write('pushed=%s\n' % ('1' if ok else ''))
