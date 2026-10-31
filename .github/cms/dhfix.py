# Each data file the page loads is listed in index.html (const DH) with a fingerprint of its text; readers' saved copies are
# renewed only when the fingerprint changes. A file changed in any other way than «لوحة المحتوى» (a fix made by hand, another
# check) would keep its old fingerprint, and readers would go on reading the old text. This finds such files, writes their
# right fingerprints and a new version, and publishes. Run by .github/workflows/cms.yml before the waiting corrections.
import json, re, hashlib, os, time, subprocess
ix = open('index.html', encoding='utf-8').read()
m = re.search(r'const DH=\{([^}]*)\}', ix)
if not m: raise SystemExit(0)
fixed = []
for p, h in re.findall(r'"(data/[^"]+)": "([0-9a-f]+)"', m.group(1)):
    if not os.path.exists(p): continue
    t = open(p, encoding='utf-8').read()
    try: json.loads(t)
    except Exception: continue          # a broken file is never announced to readers
    nh = hashlib.md5(t.encode()).hexdigest()[:10]
    if nh != h:
        ix = ix.replace('"%s": "%s"' % (p, h), '"%s": "%s"' % (p, nh), 1); fixed.append(p)
if not fixed:
    print('fingerprints: all current'); raise SystemExit(0)
V = time.strftime('%Y-%m-%d-%H%M', time.gmtime(time.time() + 3 * 3600))
ix = re.sub(r"const APP_VER='[^']*'", "const APP_VER='" + V + "'", ix, count=1)
open('index.html', 'w', encoding='utf-8').write(ix)
open('version.json', 'w').write('{"v":"%s"}\n' % V)
g = lambda *a: subprocess.run(['git', *a], check=True, capture_output=True, text=True).stdout.strip()
g('add', 'index.html', 'version.json')
g('-c', 'user.name=لوحة المحتوى', '-c', 'user.email=cms@seeratuh.com', 'commit', '-qm', 'تجديد بصمات الملفات: ' + '، '.join(fixed))
for i in range(4):
    try: g('push', '-q', 'origin', 'HEAD'); break
    except subprocess.CalledProcessError: g('pull', '-q', '--rebase', 'origin', g('rev-parse', '--abbrev-ref', 'HEAD'))
print('fingerprints renewed:', fixed)
