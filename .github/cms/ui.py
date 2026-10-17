# The site's own wording (tile names, headings, buttons) corrected from the edit mode: it lives in the page itself (index.html),
# so a correction replaces the text where it stands whole: as an element's text (>…<) or a quoted string ('…' or "…").
# Every such correction is kept in ui.json next to this file and applied again after each build, so a build never undoes it.
import html, json, os, re, sys

UI = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui.json')


BAD = re.compile(r'["\'`\\<>]|\$\{')

def apply(text, old, nw):
    """the wording where it stands whole: as the text between two tags outside the scripts, or as a whole quoted string
    inside the scripts (never inside a tag's attributes, never in a template string); a correction containing quotes,
    backslashes, angle brackets or ${ is refused, so it can never become markup or code"""
    if not old.strip() or BAD.search(nw) or BAD.search(old): return text, 0
    n = 0; out = []; k = 0
    for m in re.finditer(r'(<script[^>]*>)(.*?)(</script>)', text, re.S):
        out.append(('h', text[k:m.start(2)])); out.append(('j', m.group(2))); k = m.end(2)
    out.append(('h', text[k:]))
    eo, en = html.escape(old, False), html.escape(nw, False)
    ht = re.compile(r'>([ \t\n\u00a0]*)' + re.escape(eo) + r'([ \t\n\u00a0]*)<')
    js = [re.compile(q + r'([ ]*)' + re.escape(old) + r'([ ]*)' + q) for q in ("'", '"')]
    res = []
    for kind, seg in out:
        if kind == 'h':
            seg, c = ht.subn(lambda m: '>' + m.group(1) + en + m.group(2) + '<', seg); n += c
        else:
            for q, pat in zip(("'", '"'), js):
                seg, c = pat.subn(lambda m: q + m.group(1) + nw.replace('\n', ' ') + m.group(2) + q, seg); n += c
        res.append(seg)
    return ''.join(res), n

def load():
    return json.load(open(UI, encoding='utf-8')) if os.path.exists(UI) else []

if __name__ == '__main__':   # after a build: python3 ui.py index.html
    p = sys.argv[1]; t = open(p, encoding='utf-8').read()
    for e in load(): t, _ = apply(t, e['old'], e['nw'])
    open(p, 'w', encoding='utf-8').write(t)

def js_ok(text):
    """every script of the page still parses (node --check), so a correction can never break the site"""
    import subprocess, tempfile
    for m in re.finditer(r'<script([^>]*)>(.*?)</script>', text, re.S):
        ty = re.search(r'type="([^"]*)"', m.group(1)); ty = ty.group(1) if ty else ''
        if 'json' in ty:
            try: json.loads(m.group(2)); continue
            except ValueError: return False
        if ty and ty not in ('text/javascript', 'module'): continue
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t: t.write(m.group(2)); n = t.name
        r = subprocess.run(['node', '--check', n], capture_output=True, text=True); os.unlink(n)
        if r.returncode: return False
    return True
