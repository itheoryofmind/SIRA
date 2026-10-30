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
def where_sk(b):
    out = []
    for su, L in SK.items():
        if b in SKALL[su]:
            acc = ''; 
            for ay, s in L:
                acc += s
                if b in acc: out.append((su, ay)); break
    return out
def note(site, f, path, s, m, why, kind, mus=None, mref=None):
    old = s[m.start():m.end() + 60]
    j = old.find(']'); old = old[:j + 1] if 0 <= j < 80 else s[m.start():m.end()]
    i = m.start()
    idn = 'wkv_' + hashlib.md5((site + f + json.dumps(path) + old).encode()).hexdigest()[:12]
    r = {'id': idn, 's': site, 'f': f, 'path': path, 'pre': s[max(0, i - 60):i], 'old': old, 'post': s[i + len(old):i + len(old) + 60],
         'sec': 'v', 'v': 1, 'wk': 1, 'side': 1, 'why': why, 'kind': kind, 'sev': 1 if kind in ('ref', 'words') else 2}
    if mus: r['mus'] = mus
    if mref: r['mref'] = mref
    return r
def run(site, root):
    notes = []
    for fp in sorted(glob.glob(os.path.join(root, 't*.json'))):
        f = os.path.basename(fp)
        try: d = json.load(open(fp, encoding='utf-8'))
        except Exception: continue
        if 'p' not in d: continue
        UU = d.get('u') or {}
        for pg, P in enumerate(d['p']):
            if not isinstance(P, list): continue
            have = {(r[0], r[1]): r for r in (UU.get(str(pg)) or []) if isinstance(r[1], int) and r[2]}
            for idx, s in enumerate(P):
                if not isinstance(s, str) or '{' not in s: continue
                for m in re.finditer(r'\{([^{}]*)\}', s):
                    k = s[:m.start()].count('{')
                    if (idx - 1, k) in have:
                        # shown in the mushaf's script: its words are the mushaf's; is the reference after it the same place?
                        r = have[(idx - 1, k)]; ref = U.ref_after(s, m.end())
                        if isinstance(ref, tuple) and len(r) > 5 and r[3]:
                            su, nums = ref; a0, a1 = r[4], r[5]
                            if su != r[3] or (nums and not (min(nums) - 1 <= a1 and a0 <= max(nums) + 1)):
                                notes.append(note(site, f, ['p', pg, idx], s, m, 'الإحالة بعد الآية: %s %s، والآية في المصحف: %s %s' % (NAME.get(su, ''), '-'.join(ar(n) for n in nums), NAME[r[3]], ar(a0) + ('-' + ar(a1) if a1 != a0 else '')), 'ref', None, NAME[r[3]] + ': ' + ar(a0) + ('-' + ar(a1) if a1 != a0 else '')))
                        elif ref == 'bad':
                            notes.append(note(site, f, ['p', pg, idx], s, m, 'اسم السورة في الإحالة بعد الآية غير معروف', 'name'))
                        continue
                    body = m.group(1); b = U.skOf(re.sub(r'\[[^\]]*\]|\([^)]*\)', '', body))
                    if len(b) < 6 or U.SKIP.search(body): continue
                    ref = U.ref_after(s, m.end()); path = ['p', pg, idx]
                    if ref == 'bad':
                        notes.append(note(site, f, path, s, m, 'اسم السورة في الإحالة بعد الآية غير معروف، فلم تُطابَق الآية بالمصحف', 'name')); continue
                    at = where_sk(b)
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
                            notes.append(note(site, f, path, s, m, 'الإحالة بعد الآية: %s %s، والآية في المصحف: %s %s' % (NAME[su], '-'.join(ar(n) for n in nums), NAME[x[0]], ar(x[1])), 'ref', UTH.get(x), NAME[x[0]] + ': ' + ar(x[1])))
                        else:
                            mus = ' '.join(UTH.get((su, a), '') for a in range(min(nums), max(nums) + 1)) if nums and max(nums) - min(nums) < 6 else None
                            notes.append(note(site, f, path, s, m, 'لفظ الآية في الموقع لا يوجد في المصحف بهذا الترتيب (كلمة زائدة أو ناقصة أو مختلفة)، والإحالة: %s %s' % (NAME[su], '-'.join(ar(n) for n in nums)), 'words', mus, NAME[su] + ': ' + '-'.join(ar(n) for n in nums) if nums else None))
                    elif not at and len(body.split()) >= 4:
                        notes.append(note(site, f, path, s, m, 'نص بين قوسي الآية لا يوجد في المصحف بهذا الترتيب، وليس بعده إحالة', 'words'))
    return notes
if __name__ == '__main__':
    N = run(sys.argv[1], sys.argv[2])
    json.dump(N, sys.stdout, ensure_ascii=False)
