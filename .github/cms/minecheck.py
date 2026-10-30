# كل أسبوع: هل بقيت تعديلات صاحب الموقع (mine.json) كما تركها؟ إن تغيّر شيء منها بعده وصلته رسالة على جواله.
# Run by .github/workflows/mine-check.yml. A place he corrected again later is judged by his latest correction only.
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
MP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mine.json')
if not os.path.exists(MP): sys.exit(0)
MN = json.load(open(MP, encoding='utf-8'))
last = {}
for x in MN:
    if x.get('f') != 'ui' and x.get('nw'): last[(x['f'], json.dumps(x['path']))] = x
D = {}; bad = []
for (f, _), x in last.items():
    if f not in D:
        try: D[f] = json.load(open('data/' + f, encoding='utf-8'))
        except Exception: D[f] = None
    o = D[f]
    try:
        for k in x['path']: o = o[k]
    except Exception: o = None
    if o == x['nw']: continue
    # his change still there with its surroundings (a verse bracket { } added or fixed beside it since does not count)
    nb = lambda t: re.sub('[{}]', '', t)
    if isinstance(o, str) and all(nb(c['pre'][-12:] + c['new'] + c['post'][:12]) in nb(o) for c in x.get('ch') or []): continue
    bad.append(x)
print('checked', len(last), 'changed', len(bad))
if bad:
    import apply_post as AP
    A = '٠١٢٣٤٥٦٧٨٩'; ar = lambda n: ''.join(A[int(c)] if c.isdigit() else c for c in str(n))
    L = [(x.get('lb') or x['f']) for x in bad[:6]]
    AP.post('/c/report', {'t': 'تغيّر %s من تعديلاتك بعدك' % ar(len(bad)), 'b': '، '.join(L) + ('…' if len(bad) > 6 else '') + '\nافتح «تعديلاتي» في اللوحة واضغط «تحقّق من حالها الآن».', 'tag': 'mine'})
