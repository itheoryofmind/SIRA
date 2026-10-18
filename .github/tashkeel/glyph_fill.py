# a ligature (ﷺ ﵁ ﷿ …) that a book never writes out takes the marks the vocalized books give these words when they write them out
import pickle,sys
sys.path.insert(0,'/tmp/tsk')
from align import Src
books='711,1681,1726,1435,829,1198,9111,2348,700,1727,735'.split(',')
srcs=[Src(pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb')),b) for b in books]
# a ligature (ﷺ ﵁ ﷿ …) that a book never writes out takes the marks the vocalized books give these words when they write them out
from corpus import GLYPH,MARK as _MK
from collections import Counter as _C
from align import norm as _norm
FORM={}
for g,x in GLYPH.items():
    xs=[_norm(w) for w in x.split()];k=len(xs);seen=_C()
    for S in srcs:
        W=S.C['W'];G=S.C['G'];N=S.C['N']
        for i in range(len(W)-k+1):
            if not G[i] and N[i:i+k]==xs and all(_MK.search(w) for w in W[i:i+k]): seen[tuple(W[i:i+k])]+=1
    if seen: FORM[tuple(xs)]=seen.most_common(1)[0][0]
# these are prayers, read one way only (the ligature stands for the prayer): the forms the books give them, nominative where a noun ends them
FIX={'عليها السلام':'عَلَيْهَا السَّلَامُ','عليه السلام':'عَلَيْهِ السَّلَامُ','عليهم السلام':'عَلَيْهِمُ السَّلَامُ','عليهما السلام':'عَلَيْهِمَا السَّلَامُ','جل جلاله':'جَلَّ جَلَالُهُ','رحمهم الله':'رَحِمَهُمُ اللَّهُ'}
from align import norm as _n2
for k,v in FIX.items(): FORM[tuple(_n2(w) for w in k.split())]=tuple(v.split())
for S in srcs:
    W=S.C['W'];G=S.C['G'];N=S.C['N']
    for i in range(len(W)):
        if G[i] and not _MK.search(W[i]):
            for xs,v in FORM.items():
                k=len(xs)
                for q in range(k):
                    if i-q>=0 and N[i-q:i-q+k]==list(xs) and all(G[i-q:i-q+k]):
                        W[i]=v[q];break
                else: continue
                break
for S in srcs:
    C=dict(S.C);C['N']=[__import__('corpus').norm(w) for w in C['W']]
    pickle.dump(C,open(f'/tmp/tsk/c_{S.name}.pkl','wb'))
print('formulas',len(FORM),[' '.join(v) for v in FORM.values()])
