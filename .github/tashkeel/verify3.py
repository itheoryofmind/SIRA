# an independent check of option (أ): every mark shown must stand on the same letter of the same word in a second place
# of the books (another edition, or the same words in another book), beside at least one of the same neighbours
import json,re,pickle,sys
sys.path.insert(0,'/tmp/tsk')
from align import split_marks,transfer,canon,norm
from collections import defaultdict
exec(open('/tmp/tsk/verify2.py').read().split("e1=e2=e3=ok=0")[0])
books_='711,1681,1726,1435,829,1198,9111,2348,700,1727,735'.split(',')
IDX=defaultdict(list)
for b in books_:
    C=book(b);N=[canon(norm(w)) for w in C['W']];C['NN']=N
    for i,w in enumerate(N): IDX[w].append((b,i))
INVD=pickle.load(open('/tmp/tsk/inv.pkl','rb'))
import os
PRINT=json.load(open('/tmp/tsk/pr/print_ok.json')) if os.path.exists('/tmp/tsk/pr/print_ok.json') else {}
marks=conf=0;bad=[];DROP={}
for k,(s,prov) in PROV.items():
    n=int(k.split(':')[0]);M=dec(MAP[k],n);v=lay(s,M)
    ws=list(WORD.finditer(s));vw=list(WORD.finditer(v))
    for i,b,j in prov:
        site=ws[i].group(0);sl=split_marks(site);vl=split_marks(vw[i].group(0))
        shown=[m if not o else '' for (_,m),(_,o) in zip(vl,sl)]
        if not any(shown): continue
        w=canon(norm(site));p=canon(norm(ws[i-1].group(0))) if i else None;q=canon(norm(ws[i+1].group(0))) if i+1<len(ws) else None
        need=[k2 for k2,m in enumerate(shown) if m]
        ok=set()
        if b=='inv': ok=set(need)
        if f'{b}:{j}' in PRINT:
            t=transfer(sl,split_marks(PRINT[f'{b}:{j}']))
            if t is not None:
                for k2 in need:
                    a=''.join(sorted(shown[k2].replace('ْ','')));c=''.join(sorted(t[k2].replace('ْ','')))
                    if a==c and (a or t[k2]): ok.add(k2)
        for (bb,jj) in IDX.get(w,()):
            if b!='inv' and bb==b and jj==j: continue
            N=book(bb)['NN']
            if not ((p is not None and jj>0 and N[jj-1]==p) or (q is not None and jj+1<len(N) and N[jj+1]==q)): continue
            t=transfer(sl,split_marks(book(bb)['W'][jj]))
            if t is None: continue
            for k2 in need:
                a=''.join(sorted(shown[k2].replace('ْ','')));c=''.join(sorted(t[k2].replace('ْ','')))
                if a==c and (a or t[k2]): ok.add(k2)
            if len(ok)==len(need): break
        marks+=len(need);conf+=len(ok)
        if len(ok)<len(need):
            # the letter index (over the whole text) of each mark not found again
            li=sum(1 for c in s[:ws[i].start()] if LET.match(c));q2=0
            for k2,(ch,_) in enumerate(sl):
                if LET.match(ch):
                    if k2 in need and k2 not in ok: DROP.setdefault(k,set()).add(li+q2)
                    q2+=1
        if len(ok)<len(need) and len(bad)<25: bad.append((vw[i].group(0),' '.join(s[ws[max(0,i-2)].start():ws[min(len(ws)-1,i+2)].end()].split())))
print('marks shown',marks,'found again in a second place',conf,f'({100*conf/max(marks,1):.3f}%)')
for x in bad: print(x)

# what was not found again comes off the layer
TABR={v:k for k,v in TAB.items()}
CH=[chr(c) for c in list(range(0x41,0x5B))+list(range(0x61,0x7B))+list(range(0x30,0x3A))+list(range(0xC0,0x250))]
def enc(M):
    out=[];run=0
    def fl():
        nonlocal run
        if run==1: out.append('.')
        elif run==2: out.append('..')
        elif run>2: out.append(f'~{run}~')
        run=0
    for m in M:
        if not m: run+=1;continue
        fl()
        if m not in TABR:
            c=next(x for x in CH if x not in TAB);TAB[c]=m;TABR[m]=c
        out.append(TABR[m])
    fl();return ''.join(out)
n0=0
for k,idx in DROP.items():
    n=int(k.split(':')[0]);M=dec(MAP[k],n)
    for x in idx: M[x]='';n0+=1
    if any(M): MAP[k]=enc(M)
    else: del MAP[k]
json.dump({'t':TAB,'m':MAP},open('/tmp/tsk/tsk.json','w'),ensure_ascii=False,separators=(',',':'))
print('marks taken off',n0)
