# الفحص الأسبوعي لمتون الأحاديث: كل أسبوع دفعة من أحاديث موقع السيرة (ملفات data/sx_*.json) تُقارَن بالموسوعة الحديثية
# في موقع الدرر السنية (dorar.net). The site's matn (the Prophet's words between « ») is looked up by its first words;
# when the encyclopedia has a narration that is the same words but for one, two or three, the difference becomes a note
# for the keeper (a narration that differs more is another riwaya, not a mistake, and is left alone).
import json, re, os, sys, glob, time, hashlib, difflib, html, urllib.request, urllib.parse
API = 'https://dorar.net/dorar_api.json?skey='
def nz(w):
    w = re.sub('[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', w)
    for a, b in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ٱ', 'ا'), ('ى', 'ي'), ('ة', 'ه'), ('ؤ', 'و'), ('ئ', 'ي'), ('ء', '')): w = w.replace(a, b)
    return re.sub('[^ء-ي]', '', w)
def words(t): return [x for x in (nz(w) for w in re.split(r'\s+', t.replace('ﷺ', ' صلى الله عليه وسلم '))) if x]
def matn(h):
    t = h.get('s') or h.get('x') or ''
    q = [m.group(1) for m in re.finditer(r'«([^«»]{15,})»', t)]
    q = [x for x in q if len(words(x)) >= 6]
    return max(q, key=len) if q else None
def query(text):
    w = [x for x in re.split(r'\s+', re.sub('[ً-ٰٟ]', '', text)) if re.search('[ء-ي]', x)][:8]
    u = API + urllib.parse.quote(' '.join(w))
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (site fidelity check, weekly, seeratuh.com)'}), timeout=40).read()
    j = json.loads(r.decode('utf-8'))
    H = (j.get('ahadith') or {}).get('result') or ''
    out = []
    for blk in re.split(r'<div class="hadith"', H)[1:]:
        tx = html.unescape(re.sub(r'<[^>]+>', '', blk.split('</div>', 1)[0].split('>', 1)[-1])).strip()
        info = html.unescape(re.sub(r'<[^>]+>', ' ', blk.split('</div>', 1)[1] if '</div>' in blk else ''))
        info = re.sub(r'\s+', ' ', info).strip()
        out.append((tx, info[:300]))
    return out
def compare(site, results):
    sw = words(site); best = None
    for tx, info in results:
        rw = words(tx)
        if len(rw) < len(sw) * 0.7: continue
        sm = difflib.SequenceMatcher(None, sw, rw, autojunk=False)
        # the site's matn inside the narration: the matching run from its first word to its last
        bl = [b for b in sm.get_matching_blocks() if b.size]
        if not bl: continue
        a0, b0 = bl[0].a, bl[0].b; a1, b1 = bl[-1].a + bl[-1].size, bl[-1].b + bl[-1].size
        cov = sum(b.size for b in bl) / len(sw)
        diff = [(t, sw[i1:i2], rw[j1:j2]) for t, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sw[a0:a1], rw[b0:b1], autojunk=False).get_opcodes() if t != 'equal']
        if a0 > 0 or a1 < len(sw): diff = [('x', sw[:a0] + sw[a1:], [])] + diff
        k = (cov, -len(diff))
        if best is None or k > best[0]: best = (k, tx, info, diff, cov)
    return best
def run(root, start, n, sleep=1.5):
    H = []
    for fp in sorted(glob.glob(os.path.join(root, 'sx_*.json'))):
        f = os.path.basename(fp)
        if f in ('sx_gold.json',): continue
        try: d = json.load(open(fp, encoding='utf-8'))
        except Exception: continue
        if not isinstance(d, dict) or not isinstance(d.get('h'), list): continue
        for i, h in enumerate(d['h']):
            if not isinstance(h, dict): continue
            m = matn(h)
            if m: H.append((f, i, 's' if h.get('s') and m in h['s'] else 'x', m, h.get('p'), h.get('no')))
    seen = set(); U = []
    for x in H:
        k = ' '.join(words(x[3]))
        if k in seen: continue
        seen.add(k); U.append(x)
    notes = []; done = 0; nores = 0; errs = 0
    for j in range(n):
        if not U: break
        f, i, fld, m, p, no = U[(start + j) % len(U)]
        try: R = query(m)
        except Exception as e: errs += 1; time.sleep(sleep * 3); continue
        done += 1; time.sleep(sleep)
        if not R: nores += 1; continue
        b = compare(m, R)
        if not b: continue
        (cov, nd), tx, info, diff, cv = b
        # a word written differently (a letter dropped, changed or added), not a word more or less: that is how a copying slip
        # looks; whole words added or missing are usually another narration, and are left alone
        typo = diff and len(diff) <= 2 and all(t == 'replace' and len(a) == len(c) and all(difflib.SequenceMatcher(None, x, y).ratio() >= 0.6 for x, y in zip(a, c)) for t, a, c in diff)
        if cv >= 0.85 and typo:
            idn = 'wkh_' + hashlib.md5((f + str(i) + m).encode()).hexdigest()[:12]
            notes.append({'id': idn, 's': 'sira', 'f': f, 'path': ['h', i, fld], 'pre': '«', 'old': m, 'post': '»', 'b': 'sx', 'p': p if isinstance(p, int) else 0, 'hno': no, 'sec': 'h', 'wk': 1, 'side': 1, 'sev': 2,
                          'why': 'الموسوعة الحديثية في الدرر السنية (dorar.net) فيها هذا الحديث بلفظ يختلف في كلمة أو كلمتين: «' + tx[:400] + '» — ' + info + '. وقد يكون الفرق اختلاف رواية أو طبعة، فقارن بصورة المطبوع قبل أن تقرر.',
                          'dorar': tx[:600], 'dorar_info': info})
    return {'total': len(U), 'checked': done, 'nores': nores, 'errs': errs, 'next': (start + n) % max(1, len(U)), 'notes': notes}
if __name__ == '__main__':
    r = run(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
    json.dump(r, sys.stdout, ensure_ascii=False)
