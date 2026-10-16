# The site's own wording (tile names, headings, buttons) corrected from the edit mode: it lives in the page itself (index.html),
# so a correction replaces the text where it stands whole: as an element's text (>…<) or a quoted string ('…' or "…").
# Every such correction is kept in ui.json next to this file and applied again after each build, so a build never undoes it.
import html, json, os, re, sys

UI = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui.json')

def js1(s): return s.replace('\\', '\\\\').replace("'", "\\'")
def js2(s): return s.replace('\\', '\\\\').replace('"', '\\"')

def apply(text, old, nw):
    # whole: between two tags (spaces next to the tags kept as they are), or a whole quoted string
    n = 0
    for q1, q2, f in ((">", "<", lambda x: html.escape(x, False)), ("'", "'", js1), ('"', '"', js2)):
        pat = re.compile(re.escape(q1) + r'([ \t\n]*)' + re.escape(f(old)) + r'([ \t\n]*)' + re.escape(q2))
        text, c = pat.subn(lambda m: q1 + m.group(1) + f(nw) + m.group(2) + q2, text)
        n += c
    return text, n

def load():
    return json.load(open(UI, encoding='utf-8')) if os.path.exists(UI) else []

if __name__ == '__main__':   # after a build: python3 ui.py index.html
    p = sys.argv[1]; t = open(p, encoding='utf-8').read()
    for e in load(): t, _ = apply(t, e['old'], e['nw'])
    open(p, 'w', encoding='utf-8').write(t)
