# words that every vocalized book, everywhere, marks the same way (حَدَّثَنَا): their marks do not depend on the context
import pickle,re,sys
sys.path.insert(0,'/tmp/tsk')
from align import canon,split_marks,norm
from collections import Counter,defaultdict
MK=re.compile(r'[ً-ْٰ]')
books='711,1681,1726,1435,829,1198,9111,2348,700,1727,735'.split(',')
V=defaultdict(Counter)
for b in books:
    C=pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb'));W=C['W'];N=[canon(norm(x)) for x in W]
    for i,w in enumerate(W):
        if not MK.search(w): continue
        nxt=N[i+1] if i+1<len(W) else ''
        wasl=nxt.startswith('ا') or nxt in ('بن','ابن')
        # every letter must carry its marks as this book writes them (a word with some letters bare is not used)
        V[(N[i],wasl)][''.join(ch for ch in w if ch!='ـ')]+=1
def letters(w): return split_marks(w)
def compat(a,b):
    A=letters(a);B=letters(b)
    if len(A)!=len(B): return False
    for (x,m),(y,n) in zip(A,B):
        m=m.replace('\u0652','');n=n.replace('\u0652','')
        if m and n and ''.join(sorted(m))!=''.join(sorted(n)): return False
    return True
def fullness(w): return sum(1 for _,m in letters(w) if m)
INV={};CONF=0
for k,c in V.items():
    n=sum(c.values())
    if n<30: continue
    # the fullest form that the most occurrences have
    best=max(c,key=lambda w:(c[w],fullness(w)))
    full=max((w for w in c if compat(w,best)),key=lambda w:(fullness(w),c[w]))
    bad=sum(v for w,v in c.items() if not compat(w,full))
    if bad==0 and fullness(full)==len([1 for ch,_ in letters(full) if ch not in 'اوىي' ]) or bad==0 and fullness(full)>=len(letters(full))-2:
        INV[k]=full
pickle.dump(INV,open('/tmp/tsk/inv.pkl','wb'))
print(len(INV),'words always marked the same way (30 times at least, no exception)')
print(list(INV.items())[:30])
