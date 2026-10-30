# الفحص الأسبوعي للآيات في الموقعين: كل آية بين { } تُطابَق بالمصحف (نص مجمع الملك فهد في .github/cms/q.json).
# A verse shown in the mushaf's script (data 'u') is the mushaf's words already. Any other verse is checked here and,
# when something is off, becomes a note: its reference names another place in the mushaf, its sura name is unknown,
# or its words are not the mushaf's words. Usage: python3 verses.py <site> <data dir>  -> JSON notes on stdout
import json, re, os, sys, glob, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cms'))
import umatch as U
SK = {}
for su, ay, u, e, nm in U.Q: SK.setdefault(su, []).append((ay, U.skOf(e)))
SKALL = {su: ''.join(x[1] for x in L) for su, L in SK.items()}
NAME = {su: nm for su, ay, u, e, nm in U.Q}
UTH = {(su, ay): u for su, ay, u, e, nm in U.Q}
A = '٠١٢٣٤٥٦٧٨٩'; ar = lambda n: ''.join(A[int(c)] if c.isdigit() else c for c in str(n))
def ref2(s, end):
    """the reference after a verse; a sura name followed by «الآيتان» or «من الآية» is still that sura"""
    r = U.ref_after(s, end)
    if r != 'bad': return r
    t = s[end:end + 90]
    t2 = re.sub(r'\s*(?:الآيتان|الآيات|من الآيتين|من الآيات|من الآية|من الآي|الآية)\s*:', ' آية:', t, count=1)
    return U.ref_after(t2, 0) if t2 != t else r
def where_sk(b):
    out = []
    for su, L in SK.items():
        if b in SKALL[su]:
            acc = ''; 
            for ay, s in L:
                acc += s
                if b in acc: out.append((su, ay)); break
    return out
def propose(s, m, su, a0, a1):
    """a reference whose sura name is missing or misspelt, while its numbers are the verse's place in the mushaf:
    the same reference with the sura's name written in, its numbers and style untouched; (from, to) or None"""
    mr = U.REF.match(s[m.end():m.end() + 90])
    if not mr: return None
    old = mr.group(0); j = old.find('['); k = old.find(']')
    if j < 0 or k < 0: return None
    br = old[j:k + 1]
    mm = re.match(r'\[\s*(سورة)?\s*([^\]:0-9٠-٩]*?)\s*(آية)?\s*:\s*([0-9٠-٩][0-9٠-٩\s\-–،,]*)\]$', br)
    if not mm: return None
    nums = [U.tonum(x) for x in re.findall('[0-9٠-٩]+', mm.group(4))]
    if not nums or not all(a0 - 1 <= n <= a1 + 1 for n in nums): return None
    nw = ('[سورة %s آية: %s]' if mm.group(1) else '[%s: %s]') % (NAME[su], mm.group(4).strip())
    return None if nw == br else (br, nw)
def note(site, f, path, s, m, why, kind, mus=None, mref=None, fix=None):
    # the verse with the reference after it, when there is one
    mr = U.REF.match(s[m.end():m.end() + 90])
    old = s[m.start():m.end() + (len(mr.group(0)) if mr else 0)]
    i = m.start()
    idn = 'wkv_' + hashlib.md5((site + f + json.dumps(path) + old).encode()).hexdigest()[:12]
    r = {'id': idn, 's': site, 'f': f, 'path': path, 'pre': s[max(0, i - 60):i], 'old': old, 'post': s[i + len(old):i + len(old) + 60],
         'sec': 'v', 'v': 1, 'wk': 1, 'side': 1, 'why': why, 'kind': kind, 'sev': 1 if kind in ('ref', 'words') else 2}
    if fix and fix[0] in old: r['fix'] = {'old': old, 'nw': old.replace(fix[0], fix[1], 1), 'what': 'الإحالة «%s» ← «%s»' % fix}
    if mus: r['mus'] = mus
    if mref: r['mref'] = mref
    return r
TMK = re.compile(r'\s*۝[٠-٩]+\s*')
def nm(t): return ' '.join(x for x in TMK.sub(' ', t).split() if x != '\u06de')
def tafsir(site, f, d, pg, e, notes):
    """a verse shown in the mushaf's script: is the place kept for its tafsir button and aya number the place of these very words?"""
    su, a0, a1 = e[3], e[4], e[5]
    ok = isinstance(su, int) and isinstance(a0, int) and isinstance(a1, int) and a0 <= a1 and (su, a0) in UTH and (su, a1) in UTH
    if ok:
        rng = ' '.join(nm(UTH[(su, a)]) for a in range(a0, a1 + 1))
        ok = nm(e[2]) in rng and all(a0 <= U.tonum(x) <= a1 for x in re.findall('۝([٠-٩]+)', e[2]))
    if ok: return
    P = d['p'][int(pg)]; s = P[e[0] + 1] if e[0] + 1 < len(P) and isinstance(P[e[0] + 1], str) else ''
    body, ref, m = None, None, None
    if e[1] == 's' and len(e) > 7: body = s[e[6]:e[7]]
    elif isinstance(e[1], int) and e[1] >= 0:
        ops = [i for i, c in enumerate(s) if c == '{']
        if e[1] < len(ops):
            m = re.compile(r'\{([^{}]*)\}').match(s, ops[e[1]])
            if m: body = m.group(1); ref = ref2(s, m.end())
    h = None
    if body:
        b2 = body.replace('"', '').strip()
        h = U.find(b2, ref[0], ref[1]) if isinstance(ref, tuple) else U.find(b2)
    idx = d['u'][pg].index(e)
    old = json.dumps(e, ensure_ascii=False, separators=(',', ':'))
    r = {'id': 'wkv_' + hashlib.md5((site + f + pg + old).encode()).hexdigest()[:12], 's': site, 'f': f, 'path': ['p', int(pg), e[0] + 1],
         'pre': s[max(0, (m.start() if m else 0) - 60):(m.start() if m else 0)], 'old': (m.group(0) if m else (body or '')), 'post': s[(m.end() if m else 0):(m.end() if m else 0) + 60],
         'sec': 'v', 'v': 1, 'wk': 1, 'side': 1, 'kind': 'tafsir', 'sev': 1,
         'why': 'زر «تفسير» ورقم الآية لهذه الآية يشيران إلى %s %s، ونص الآية المعروض ليس نص ذلك الموضع' % (NAME.get(su, '?'), ar(a0) + ('-' + ar(a1) if a1 != a0 else '')) + ('؛ وموضعها الصحيح: %s %s' % (NAME[h[1]], ar(h[2]) + ('-' + ar(h[3]) if h[3] != h[2] else '')) if h else '؛ ولم يتحدد موضعها الصحيح آلياً (لفظها في أكثر من موضع)')}
    if h:
        new = list(e); new[2], new[3], new[4], new[5] = h[0], h[1], h[2], h[3]
        r['mus'] = h[0]; r['mref'] = NAME[h[1]] + ': ' + ar(h[2]) + ('-' + ar(h[3]) if h[3] != h[2] else '')
        r['fix'] = {'u': ['u', pg, idx], 'old': old, 'nw': json.dumps(new, ensure_ascii=False, separators=(',', ':')), 'what': 'زر التفسير ورقم الآية ← %s' % r['mref']}
    notes.append(r)
def run(site, root):
    notes = []
    for fp in sorted(glob.glob(os.path.join(root, 't*.json'))):
        f = os.path.basename(fp)
        try: d = json.load(open(fp, encoding='utf-8'))
        except Exception: continue
        if 'p' not in d: continue
        UU = d.get('u') or {}
        for pg, L in UU.items():
            for e in L:
                if len(e) > 5 and e[2] and e[3]: tafsir(site, f, d, pg, e, notes)
        for pg, P in enumerate(d['p']):
            if not isinstance(P, list): continue
            have = {(r[0], r[1]): r for r in (UU.get(str(pg)) or []) if isinstance(r[1], int) and r[2]}
            for idx, s in enumerate(P):
                if not isinstance(s, str) or '{' not in s: continue
                for m in re.finditer(r'\{([^{}]*)\}', s):
                    k = s[:m.start()].count('{')
                    if (idx - 1, k) in have:
                        # shown in the mushaf's script: its words are the mushaf's; is the reference after it the same place?
                        r = have[(idx - 1, k)]; ref = ref2(s, m.end())
                        if isinstance(ref, tuple) and len(r) > 5 and r[3]:
                            su, nums = ref; a0, a1 = r[4], r[5]
                            if su != r[3] or (nums and not (min(nums) - 1 <= a1 and a0 <= max(nums) + 1)):
                                notes.append(note(site, f, ['p', pg, idx], s, m, 'الإحالة بعد الآية: %s %s، والآية في المصحف: %s %s' % (NAME.get(su, ''), '-'.join(ar(n) for n in nums), NAME[r[3]], ar(a0) + ('-' + ar(a1) if a1 != a0 else '')), 'ref', r[2], NAME[r[3]] + ': ' + ar(a0) + ('-' + ar(a1) if a1 != a0 else '')))
                        elif ref == 'bad':
                            notes.append(note(site, f, ['p', pg, idx], s, m, 'اسم السورة في الإحالة بعد الآية ناقص أو غير معروف، والآية في المصحف: %s %s' % (NAME[r[3]], ar(r[4]) + ('-' + ar(r[5]) if r[5] != r[4] else '')) if len(r) > 5 and r[3] else 'اسم السورة في الإحالة بعد الآية ناقص أو غير معروف', 'name', r[2], None, propose(s, m, r[3], r[4], r[5]) if len(r) > 5 and r[3] else None))
                        continue
                    body = m.group(1); b = U.skOf(re.sub(r'\[[^\]]*\]|\([^)]*\)', '', body))
                    if len(b) < 6 or U.SKIP.search(body): continue
                    ref = ref2(s, m.end()); path = ['p', pg, idx]
                    at = where_sk(b)
                    if ref == 'bad':
                        x = at[0] if len(at) == 1 else None
                        notes.append(note(site, f, path, s, m, 'اسم السورة في الإحالة بعد الآية ناقص أو غير معروف' + ('، والآية في المصحف: %s %s' % (NAME[x[0]], ar(x[1])) if x else ''), 'name', UTH.get(x) if x else None, None, propose(s, m, x[0], x[1], x[1]) if x else None)); continue
                    if ref:
                        su, nums = ref
                        if any(x[0] == su and (not nums or min(nums) - 1 <= x[1] <= max(nums) + 1) for x in at):
                            # the place is right; the words differ only in spelling, or in a letter the skeleton does not see
                            h = U.find(body, su, nums)
                            if not h and nums:
                                # the same letters as the mushaf's words there (found twice in the mushaf, so not given its script): no note
                                T = ' '.join(x for x in (U.nz(w) for w in body.split()) if x)
                                Rg = ' '.join(U.nz(x[0]) for x in U.SW[su] if min(nums) - 1 <= x[1] <= max(nums) + 1)
                                Tw, Rw = T.split(), Rg.split()
                                # a quotation may leave out the و or ف that opens the verse's first word
                                if Tw and any(Rw[i:i + len(Tw)][1:] == Tw[1:] and Rw[i] in (Tw[0], 'و' + Tw[0], 'ف' + Tw[0]) for i in range(len(Rw) - len(Tw) + 1)): h = True
                            if not h:
                                a0 = min(nums) if nums else None
                                notes.append(note(site, f, path, s, m, 'الآية في موضعها من المصحف، لكن لفظها في الموقع لا يطابق المصحف حرفاً بحرف (همزة أو ألف أو حرف)، فتظهر بلا رسم المصحف', 'spell',
                                                  ' '.join(UTH.get((su, a), '') for a in range(min(nums), max(nums) + 1)) if nums and max(nums) - min(nums) < 6 else None, NAME[su] + ': ' + '-'.join(ar(n) for n in nums) if nums else None))
                            continue
                        if at:
                            x = at[0]
                            notes.append(note(site, f, path, s, m, 'الإحالة بعد الآية: %s %s، والآية في المصحف: %s %s' % (NAME[su], '-'.join(ar(n) for n in nums), NAME[x[0]], ar(x[1])) + ('' if len(at) == 1 else ' (وهذا اللفظ في المصحف في أكثر من موضع)'), 'ref', UTH.get(x), NAME[x[0]] + ': ' + ar(x[1])))
                        else:
                            mus = ' '.join(UTH.get((su, a), '') for a in range(min(nums), max(nums) + 1)) if nums and max(nums) - min(nums) < 6 else None
                            notes.append(note(site, f, path, s, m, 'لفظ الآية في الموقع لا يوجد في المصحف بهذا الترتيب (كلمة زائدة أو ناقصة أو مختلفة)، والإحالة: %s %s' % (NAME[su], '-'.join(ar(n) for n in nums)), 'words', mus, NAME[su] + ': ' + '-'.join(ar(n) for n in nums) if nums else None))
                    elif not at and len(body.split()) >= 4:
                        notes.append(note(site, f, path, s, m, 'نص بين قوسي الآية لا يوجد في المصحف بهذا الترتيب، وليس بعده إحالة', 'words'))
    return notes
if __name__ == '__main__':
    N = run(sys.argv[1], sys.argv[2])
    json.dump(N, sys.stdout, ensure_ascii=False)
