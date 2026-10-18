# give a site text the marks of Shamela, word by word: only where the word's letters are the same as the book's
# and both its neighbours are the next words in the book too, inside a run of at least MINRUN such words
import re,difflib
from collections import Counter,defaultdict
from corpus import WORD,MARK,base
SEAT=str.maketrans({'ٱ':'ا','ؤ':'ء','ئ':'ء'})
def norm(w): return base(w).translate(SEAT)   # the letters as written; only the seat of a hamza (ء ؤ ئ) and the wasla sign are not told apart
MINRUN=4
# spellings of one and the same word (the letters read alike): السموات / السماوات, ههنا / هاهنا, ابن / بن …
VAR=[('السماوات','السموات'),('هاهنا','ههنا'),('داوود','داود'),('طاووس','طاوس'),('ابن','بن'),('مائة','مئة'),('مائتين','مئتين'),('مائتي','مئتي'),
     ('رءوف','رءف'),('شيء','شء'),('الفيء','الفء'),('يجيء','يجء'),('فيجيء','فيجء'),('جاءوا','جاءو'),
     ('أولوا','أولو'),('هاذا','هذا'),('لاكن','لكن'),('إسحاق','إسحق'),('الرحمان','الرحمن'),('ذالك','ذلك')]
CAN={}
for a,b in VAR:
    for pre in ('','و','ف','ب','ل'):
        CAN[pre+a]=pre+b;CAN[pre+b]=pre+b
def canon(n): return CAN.get(n,n)
def split_marks(w):
    out=[]
    for ch in w:
        if MARK.match(ch) and out: out[-1][1]+=ch
        elif ch=='ـ': continue
        else: out.append([ch,''])
    return out
class Src:
    def __init__(s,C,name,K=4):
        s.C=C;s.K=K;s.name=name;s.idx=defaultdict(list);N=C['N']=[canon(norm(x)) for x in C['W']]
        for i in range(len(N)-K+1): s.idx[tuple(N[i:i+K])].append(i)
    def short(s,sn):
        if not hasattr(s,'idx2'):
            s.idx2=defaultdict(list);N=s.C['N']
            for i in range(len(N)-1): s.idx2[(N[i],N[i+1])].append(i)
        out=[]
        for i in s.idx2.get((sn[0],sn[1]),()):
            if s.C['N'][i:i+len(sn)]==sn: out.append(i)
        return out
    def anchors(s,sn):
        K=s.K;v=Counter()
        for i in range(len(sn)-K+1):
            L=s.idx.get(tuple(sn[i:i+K]),())
            if 0<len(L)<=60:
                for p in L: v[p-i]+=1
        return v
BRE=re.compile(r'[\n.:؟!«"()\[\]{}﴿﴾0-9٠-٩\-–]');ERE=re.compile(r'[\n.،,:؛؟!»"()\[\]{}﴿﴾0-9٠-٩\-–]')
def sb(text,ws,i): return i==0 or bool(BRE.search(text[ws[i-1][1]:ws[i][0]]))
def se(text,ws,i): return i==len(ws)-1 or bool(ERE.search(text[ws[i][1]:ws[i+1][0]]))
NT=SEAT
def transfer(sl,cl):
    # the marks of the book's word, letter by letter, onto the site's word; a long-vowel letter one of them
    # writes and the other does not (السموات / السماوات) takes no mark
    if len(sl)==len(cl): return [m for _,m in cl]
    a=[c.translate(NT) for c,_ in sl];b=[c.translate(NT) for c,_ in cl]
    out=[];i=j=0
    while i<len(a) or j<len(b):
        if i<len(a) and j<len(b) and a[i]==b[j]: out.append(cl[j][1]);i+=1;j+=1
        elif j<len(b) and b[j] in 'اوي' and (i>=len(a) or a[i]!=b[j]) and len(b)-j>len(a)-i: j+=1
        elif i<len(a) and a[i] in 'اوي' and len(a)-i>len(b)-j: out.append('');i+=1
        elif i<len(a) and j<len(b) and {a[i],b[j]}<= set('ءؤئي'): out.append(cl[j][1]);i+=1;j+=1   # شيء / شئ
        else: return None
    return out if len(out)==len(a) else None
def free_end(sn,i,N,j):
    # the last letter of a word is not touched by the next word when that word does not begin with a joining alif
    # (التقاء الساكنين: عَنِ الْ…، مِنَ الْ…) and is not «بن» between two names (أنسِ بنِ مالك)
    nx=[sn[i+1]] if i+1<len(sn) else []
    if j+1<len(N): nx.append(N[j+1])
    return all(not (w.startswith('ا') or w in ('بن','ابن')) for w in nx)
CHAIN={'بن','ابن','بنت','ابنة','ابي','أبي','أبو','أبا','عبد','ذو','ذي','ذا','ام','أم','مولي','مولى'}
def bare(r): return r is None or not any(r[0])
SIB={'1681':'735','735':'1681','711':'1727','1727':'711'}
def align(text,srcs,minrun=MINRUN):
    """the hadith's own place first: the book (and its other edition) that holds most of this text, where the whole
    context is the hadith itself; then, for what is left, other places, but only inside a long stretch that reaches back
    to the beginning of a clause (the case of a word can hang on words well before it: «عبدُ الله بنُ يوسف»)"""
    ws=[(m.start(),m.end(),canon(norm(m.group(0)))) for m in WORD.finditer(text)]
    n=len(ws);sn=[w[2] for w in ws];res=[None]*n
    if 2<=n<4:
        for S in srcs:
            if not any(bare(r) for r in res): break
            L=S.short(sn)
            cands={}
            for j in L:
                if S.C['B'][j] and S.C['E'][j+n-1]:
                    mk=[]
                    for q in range(n):
                        t=transfer(split_marks(text[ws[q][0]:ws[q][1]]),split_marks(S.C['W'][j+q]))
                        if t is None: mk=None;break
                        mk.append(tuple(t))
                    if mk: cands.setdefault(tuple(mk),j)
            if len(cands)==1:
                mk,j=next(iter(cands.items()))
                for q in range(n):
                    if bare(res[q]) and any(mk[q]): res[q]=(list(mk[q]),S,j+q)
        return ws,res
    if n<4: return ws,res
    votes={S.name:S.anchors(sn) for S in srcs}
    by={S.name:S for S in srcs}
    score={b:(v.most_common(1)[0][1] if v else 0) for b,v in votes.items()}
    home=max(score,key=lambda b:score[b]) if score else None
    order=[]
    if home and score[home]>=2:
        # of the two editions of one book, the one copied from a fully vocalized print first (Sultaniyya; the Turkish Muslim)
        pair=[home]+([SIB[home]] if SIB.get(home) in by else [])
        pair.sort(key=lambda b:0 if b in ('1681','711') else 1)
        for b in pair:
            if votes[b]: order.append((by[b],'home'))
    for S in sorted(srcs,key=lambda S:-score[S.name]):
        order.append((S,'far'))
    for S,mode in order:
        fx=None
        if mode=='home':
            v=votes[S.name]
            if not v: continue
            fx=v.most_common(1)[0][0]
        segs=[];a=None
        for i in range(n+1):
            need=i<n and bare(res[i])
            if need and a is None: a=i
            if not need and a is not None: segs.append((a,i));a=None
        for a,b in segs:
            _match(S,sn,ws,res,max(0,a-2),min(n,b+2),text,minrun,0,mode,fx)
    return ws,res
def _match(S,sn,ws,res,a,b,text,minrun,depth,mode='home',fixed=None):
    if b-a<min(S.K,len(sn)) or depth>8: return
    if fixed is not None:
        # the hadith's own place: the segment's best spot near it (the book may add or drop words on the way)
        v=S.anchors(sn[a:b]);n=len(sn)
        cand=[(o,c) for o,c in v.most_common(20) if fixed-60<=o+a-a<=fixed+a+n+200 and abs((o)-(fixed+a))<=max(60,n)][:2] or [(fixed+a,1)]
    else:
        v=S.anchors(sn[a:b])
        if not v: return
        cand=v.most_common(3)
    for o,c in cand:
        if c<1: break
        N=S.C['N'];lo=max(0,o-20);hi=min(len(N),o+(b-a)+60+(b-a)//3)
        sm=difflib.SequenceMatcher(None,sn[a:b],N[lo:hi],autojunk=False)
        pairs=[]
        for blk in sm.get_matching_blocks():
            for k in range(blk.size): pairs.append((a+blk.a+k,lo+blk.b+k))
        # runs of consecutive pairs
        runs=[];cur=[]
        for p in pairs:
            if cur and p[0]==cur[-1][0]+1 and p[1]==cur[-1][1]+1: cur.append(p)
            else:
                if cur: runs.append(cur)
                cur=[p]
        if cur: runs.append(cur)
        got=0
        for run in runs:
            whole=(run[0][0]==0 and run[-1][0]==len(sn)-1)
            if len(run)<minrun and not whole: continue
            if mode=='far':
                # another place: the stretch must begin where a clause begins, in the text and in the book alike,
                # so that nothing a word's case hangs on is outside it; and be long enough to be the same words
                i0,j0=run[0]
                if not (sb(text,ws,i0) and S.C['B'][j0]) or len(run)<6: continue
            CB=S.C['B'];CE=S.C['E']
            # where a run begins in the middle of a clause, the case of its first words may hang on a word before it
            # (عن عبدِ اللهِ بنِ يوسف / حدثنا عبدُ اللهِ بنُ يوسف): leave the first word, and a name chain that goes on from it
            skip=0
            if not (sb(text,ws,run[0][0]) and CB[run[0][1]]):
                skip=1
                while skip<len(run):
                    w=sn[run[skip][0]];pw=sn[run[skip-1][0]]
                    if w in CHAIN or pw in CHAIN or (w.startswith('ال') and w.endswith('ي')) or w.startswith('وال') and w.endswith('ي'): skip+=1
                    else: break
            for q,(i,j) in enumerate(run):
                if q<skip: continue
                # a word at the edge of a run: its neighbour there is not the book's (or the text ends there),
                # so it is taken only if a clause ends there in the text and in the book alike
                if q==0 and not (sb(text,ws,i) and CB[j]): continue
                if q==len(run)-1 and not (se(text,ws,i) and CE[j]) and not (q>0 and free_end(sn,i,S.C['N'],j)): continue
                if not bare(res[i]): continue
                cw=S.C['W'][j];sl=split_marks(text[ws[i][0]:ws[i][1]]);cl=split_marks(cw)
                mk=transfer(sl,cl)
                if mk is None: continue
                r=(mk,S,j)
                if res[i] is None or any(r[0]): res[i]=r;got+=1
        if got==0 and depth>0: return
        break
    # what is still open inside: another place in the book
    i=a
    while i<b:
        if bare(res[i]):
            k=i
            while k<b and bare(res[k]): k+=1
            if k-i>=S.K and (k-i)<(b-a) and fixed is None: _match(S,sn,ws,res,max(0,i-1),min(len(sn),k+1),text,minrun,depth+1,mode)
            i=k
        else: i+=1
def render(text,ws,res):
    out=[];k=0
    for (s,e,_),r in zip(ws,res):
        out.append(text[k:s]);w=text[s:e]
        if r is None: out.append(w)
        else: out.append(''.join(ch+m for (ch,_),m in zip(split_marks(w),r[0])))
        k=e
    out.append(text[k:]);return ''.join(out)
