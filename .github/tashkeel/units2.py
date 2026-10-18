# coverage as the reader will see it: every hadith text laid with data/tsk.json exactly as the page lays it
import json,re,os,sys
from collections import Counter
DATA='/tmp/durar_work/sitebuild/data'
LET=re.compile(r'[ء-غف-يٱ]');MK=re.compile(r'[ً-ْٰ]')
WORD=re.compile(r'[ء-غف-يٱ][ء-غف-يٱً-ْٰـ]*')
T=json.load(open('/tmp/tsk/tsk.json'));TAB=T['t'];MAP=T['m']
def b36(x):
    d='0123456789abcdefghijklmnopqrstuvwxyz';o=''
    while True:
        o=d[x%36]+o;x//=36
        if not x: return o
def key(s):
    h=2166136261;n=0
    for c in s:
        if LET.match(c): n+=1;h=((h^ord(c))*16777619)&0xffffffff
    return f'{n}:{b36(h)}'
def dec(code,n):
    o=[];i=0
    while i<len(code):
        c=code[i]
        if c=='~': j=code.index('~',i+1);o+=['']*int(code[i+1:j]);i=j+1
        elif c=='.': o.append('');i+=1
        else: o.append(TAB[c]);i+=1
    return o if len(o)==n else None
def lay(s,M):
    o='';li=0
    for i,c in enumerate(s):
        o+=c
        if LET.match(c):
            m=M[li];li+=1
            if m and not (i+1<len(s) and MK.match(s[i+1])): o+=m
    return o
def units():
    for f in sorted(os.listdir(DATA)):
        if not f.endswith('.json') or f in ('tsk.json','quran.json','qv.json'): continue
        d=json.load(open(f'{DATA}/{f}'))
        def walk(x):
            if isinstance(x,dict):
                if isinstance(x.get('x'),str) and 'no' in x: yield x['x']
                if x.get('k')=='hd' and isinstance(x.get('t'),list):
                    for t in x['t']:
                        if isinstance(t,str): yield t
                for v in x.values(): yield from walk(v)
            elif isinstance(x,list):
                for v in x: yield from walk(v)
        out=set(walk(d))
        if f=='sx_bab.json':
            for sec in ('bk','ms'):
                for c in d[sec].values():
                    for n,x in c['h']: out.add(x)
            for v in d['msn'].values(): out.update(v)
        if out: yield f,out
tot=Counter();miss=Counter();ex=[]
for f,U in units():
    for s in U:
        k=key(s);M=dec(MAP[k],int(k.split(':')[0])) if k in MAP else None
        v=lay(s,M) if M else s
        ws=list(WORD.finditer(s));vw=list(WORD.finditer(v))
        inb=set();inv=set()
        for m in re.finditer(r'\[[^\]]*\]',s): inb|={i for i,w in enumerate(ws) if w.start()>=m.start() and w.end()<=m.end()}
        for m in re.finditer(r'\{[^}]*\}|﴿[^﴾]*﴾',s): inv|={i for i,w in enumerate(ws) if w.start()>=m.start() and w.end()<=m.end()}
        for i,(w,x) in enumerate(zip(ws,vw)):
            if w.group(0)=='ح' or i in inb: continue
            c='verse' if i in inv else 'hadith';tot[(f,c)]+=1
            if not MK.search(x.group(0)):
                miss[(f,c)]+=1
                if c=='hadith': ex.append((f,w.group(0),' '.join(s[ws[max(0,i-3)].start():ws[min(len(ws)-1,i+3)].end()].split())))
T_=sum(v for (f,c),v in tot.items() if c=='hadith');R=sum(v for (f,c),v in miss.items() if c=='hadith')
print(f'hadith words {T_}, with marks {T_-R} ({100*(T_-R)/T_:.3f}%), without {R}')
print('verse words inside hadiths',sum(v for (f,c),v in tot.items() if c=='verse'),'without',sum(v for (f,c),v in miss.items() if c=='verse'))
for f in sorted({f for f,c in tot}):
    t=tot[(f,'hadith')];r=miss[(f,'hadith')]
    if t and r: print(f'  {f:24} {t:7} without {r:5} ({100*r/t:.2f}%)')
json.dump(ex,open('/tmp/tsk/resid_units.json','w'),ensure_ascii=False)
