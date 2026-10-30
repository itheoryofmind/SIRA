# the question every ten minutes before the weekly check: run now? (asked from the panel, or Friday morning with the automatic run on)
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'cms'))
import apply_post as AP
c = AP.post('/c/wkctl'); ctl, st = c.get('ctl') or {}, c.get('st') or {}
riyadh = time.gmtime(time.time() + 3 * 3600)
asked = (ctl.get('run') or 0) > (st.get('start') or 0)
last = st.get('start') or st.get('first')
if not last:   # the very first question: the automatic run counts from today, so it does not start on its own the day it is set up
    AP.post('/c/wkst', {'first': int(time.time() * 1000)}); last = time.time() * 1000
due = ctl.get('auto', True) and riyadh.tm_wday == 4 and riyadh.tm_hour >= 5 and time.time() * 1000 - last > 5 * 86400e3
go = asked or due
print('go' if go else 'not now', json.dumps(ctl), json.dumps(st, ensure_ascii=False)[:300])
open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a').write('go=%s\n' % ('1' if go else ''))
