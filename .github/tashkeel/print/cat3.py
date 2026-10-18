# every hadith word the reader sees without marks: why, and where it stands in a book (if anywhere)
import sys,re,pickle,json
sys.path.insert(0,'/tmp/tsk')
sys.argv=[sys.argv[0]]
import build_tsk as B
from align import Src,align
exec(open('/tmp/tsk/units2.py').read().split('tot=Counter()')[0])
books='711,1681,1726,1435,829,1198,9111,2348,700,1727,735'.split(',')
srcs=[Src(pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb')),b) for b in books]
B.BY.update({S.name:S for S in srcs})
from collections import Counter
C=Counter();OUT=[]
for f,U in units():
    for s in U:
        ws0,res0=align(s,srcs)
        nd=len(B.DISPUTE)
        M,stat,ws,res=B.marks_for(s,srcs)
        dw={d[4] for d in B.DISPUTE[nd:]}
        inv=set()
        for m in re.finditer(r'\{[^}]*\}|﴿[^﴾]*﴾|\[[^\]]*\]',s): inv|={i for i,(a,b,_) in enumerate(ws) if a>=m.start() and b<=m.end()}
        for i,((a,b,_),r) in enumerate(zip(ws,res)):
            w=s[a:b]
            if w=='ح' or i in inv or B.MARK.search(w): continue
            if r is not None and any(r[0]): C[(f,'marked')]+=1;continue
            r0=res0[i]
            if r0 is None or not any(r0[0]): cat='nosrc';loc=None
            else:
                cat='dispute' if any(d[1] and True for d in B.DISPUTE[nd:] if d[0]==w) else 'unconf'
                loc=(r0[1].name,r0[2],''.join(c+m for (c,_),m in zip(B.split_marks(w),r0[0])))
            C[(f,cat)]+=1
            OUT.append((f,cat,w,loc,s[max(0,a-60):b+60]))
pickle.dump(OUT,open('/tmp/tsk/pr/resid.pkl','wb'))
T=Counter()
for (f,c),n in C.items(): T[c]+=n
print(T)
L=Counter((o[3][0] if o[3] else '-',o[1]) for o in OUT);print(sorted(L.items(),key=lambda x:-x[1])[:40])
