# the final marks against the other edition of the same book at the same hadith: where both mark a word, do they agree?
import json,pickle,sys,re
sys.path.insert(0,'/tmp/tsk')
from align import Src,align,bare,split_marks,SIB
from collections import Counter
exec(open('/tmp/tsk/units2.py').read().split("tot=Counter()")[0])
books='711,1681,1726,1435,829,1198,9111,2348,700,1727,735'.split(',')
srcs=[Src(pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb')),b) for b in books];by={S.name:S for S in srcs}
def cm(ms): return [''.join(sorted(m.replace('ْ',''))) for m in ms]
def same(a,b): return all((not x or not y or set(x)<=set(y) or set(y)<=set(x)) for x,y in zip(cm(a),cm(b)))
tot=0;dis=0;ex=[];fromfar=0;allw=0
for f,U in units():
    for s in U:
        ws,res=align(s,srcs)
        used=Counter(r[1].name for r in res if not bare(r))
        if not used: continue
        home=used.most_common(1)[0][0]
        for r in res:
            if not bare(r):
                allw+=1
                if r[1].name!=home and r[1].name!=SIB.get(home): fromfar+=1
        sib=SIB.get(home)
        if not sib: continue
        ws2,res2=align(s,[by[sib]])
        for i,(r,q) in enumerate(zip(res,res2)):
            if bare(r) or bare(q) or r[1].name==sib: continue
            tot+=1
            if not same(r[0],q[0]):
                dis+=1
                if len(ex)<40:
                    w=s[ws[i][0]:ws[i][1]];sl=split_marks(w)
                    ex.append((f,r[1].name+':'+''.join(c+m for (c,_),m in zip(sl,r[0])),sib+':'+''.join(c+m for (c,_),m in zip(sl,q[0])),' '.join(s[ws[max(0,i-3)][0]:ws[min(len(ws)-1,i+3)][1]].split())))
print('marked hadith words',allw,'taken from another book than the hadith’s own',fromfar)
print('words the other edition of the same book also marks:',tot,'differ:',dis,f'({100*dis/max(tot,1):.2f}%)')
for e in ex: print(e)
