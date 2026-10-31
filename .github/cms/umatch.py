# رسم المصحف للآيات: every verse between { } in a book page whose words are, word for word, a run of the mushaf's words is given
# the King Fahd Complex's Uthmani text (data 'u'), the way the page shows it. A verse that is not the mushaf's words exactly stays
# in the book's own words. When a reference follows the verse ([سورة X آية: n]), the verse must be found in that sura near that aya;
# otherwise it is left in the book's words (a sign that something differs, which the panel shows).
# Usage: python3 umatch.py data/t3.json [page ...]     (run by apply.py after each correction, and by hand for whole files)
import json,re,os,sys
HERE=os.path.dirname(os.path.abspath(__file__))
Q=json.load(open(os.path.join(HERE,'q.json'),encoding='utf-8'))   # [sura, aya, uthmani, imla'i, sura name]
TM=re.compile(r'\s*۝[٠-٩]+\s*$')
def skOf(t):   # the same as the page's own check (index.html, richInline)
    t=re.sub('[ؐ-ًؚ-ٰٟۖ-ۭـ]','',t)
    t=re.sub('[^ء-يٱ]','',t)
    t=re.sub('[اأإآٱءؤئوىيةهت]','',t)
    return re.sub(r'(.)\1+',r'\1',t)
def wN(t): return len([x for x in t.split() if re.search('[ء-يٱ]',re.sub('[ً-ٰٟـۖ-ۭ]','',x))])
def wB(t):
    w=[x for x in re.split('[^ء-يٱً-ٰٟـ]+',t) if re.search('[ء-يٱ]',x)]
    n=0;i=0
    while i<len(w):
        x=re.sub('[ً-ٰٟـ]','',w[i])
        if x in ('يا','ها','ويا','فيا','أيا') and i+1<len(w): i+=1
        n+=1;i+=1
    return n,len(w)
def uBad(o,u):
    if skOf(o)!=skOf(u): return True
    a,c=wB(o); m=wN(u); return m!=a and m!=c
# per sura: the imla'i words, each with the Uthmani group it belongs to
SW={}   # sura -> list of [imla'i word, aya, group id]
GR={}   # sura -> list of groups: (uthmani words, aya, last group of its aya?)
MARK={}
for su,ay,u,e,nm in Q:
    m=re.search(r'۝[٠-٩]+',u); MARK[(su,ay)]=m.group() if m else ''
    U=[x for x in TM.sub('',u).split() if x!='\u06de']; E=e.split()
    L=SW.setdefault(su,[]); G=GR.setdefault(su,[])
    i=k=0; ok=True; grp=[]
    while i<len(E) and k<len(U):
        ie,ku=i+1,k+1
        while skOf(' '.join(E[i:ie]))!=skOf(' '.join(U[k:ku])):
            a,b=len(skOf(' '.join(E[i:ie]))),len(skOf(' '.join(U[k:ku])))
            if a<=b and ie<len(E): ie+=1
            elif ku<len(U): ku+=1
            elif ie<len(E): ie+=1
            else: ok=False; break
            if ie-i>5 or ku-k>5: ok=False; break
        if not ok: break
        grp.append((E[i:ie],U[k:ku])); i,k=ie,ku
    if not ok or i<len(E) or k<len(U):
        grp=[(E,U)]   # the aya as one block: matched only whole
    for gi,(es,us) in enumerate(grp):
        gid=len(G); G.append((' '.join(us),ay,gi==len(grp)-1))
        for w in es: L.append([w,ay,gid])
REF=re.compile(r'^\s*(?:الآية|الآيات|الاية)?\s*[\[\(]\s*(?:سورة\s+)?([^\]\):0-9٠-٩\[\(]{1,25}?)\s*(?:آية|الآية|آيه)?\s*(?::\s*([^\]\)]*))?[\]\)]')
def nkey(n):
    n=re.sub(r'^(سورة\s+)','',n.strip()); n=re.sub('[ً-ٰٟ]','',n)
    n=re.sub('[إأآٱ]','ا',n).replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي')
    return re.sub(r'[^ء-ي]','',n)
NM={}
for su,ay,u,e,nm in Q: NM[nkey(nm)]=su
for alt,k in [('الانعام',6),('الاسراء',17),('بني اسرائيل',17),('المؤمن',40),('حم السجدة',41),('القتال',47),('براءة',9),('الدهر',76),('هل أتى',76),('تبارك',67),('الزلزال',99),('اقرأ',96),('الاخلاص',112),('تبت',111),('لهب',111),('سبأ',34),('النبأ',78),('الرحمن',55),('ابراهيم',14)]:
    NM.setdefault(nkey(alt),k)
def tonum(s): return int(s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩','0123456789')))
def ref_after(s,end):
    m=REF.match(s[end:end+90])
    if not m: return None
    su=NM.get(nkey(m.group(1)))
    if not su: return 'bad'
    nums=[tonum(x) for x in re.findall('[0-9٠-٩]+',m.group(2) or '')]
    return (su,nums)
def nz(w):
    """a word as written, with only its vowel marks and the spelling of hamza, alif maqsura and ta marbuta set aside"""
    w=re.sub('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]','',w)
    w=re.sub('[آٱ]','ا',w).replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي').replace('ء','')
    return re.sub('[^\u0621-\u064A]','',w)
# per sura: each imla'i word as nz() gives it, run together, with where each word starts
CAT={}
for s_,L in SW.items():
    ks=[nz(x[0]) for x in L]; st=[];p=0
    for k in ks: st.append(p); p+=len(k)
    CAT[s_]=(''.join(ks),st,{v:i for i,v in enumerate(st)})
def nz2(w): return nz(re.sub('[أإ]','ا',w))
CAT2={}
def cat2(s_):
    if s_ not in CAT2:
        ks=[nz2(x[0]) for x in SW[s_]]; st=[];p=0
        for k in ks: st.append(p); p+=len(k)
        CAT2[s_]=(''.join(ks),st,{v:i for i,v in enumerate(st)})
    return CAT2
def find(text,su=None,nums=None):
    """the Uthmani text for the book's words, or None; returns (uth, sura, a0, a1)"""
    h=find1(text,su,nums)
    if h: return h
    # the book writes a hamza on an alif differently from the mushaf (واتبعوا / وأتبعوا): accepted only where the reference after
    # the verse names its sura and ayas, and the words are found there and nowhere else in that sura
    if su and nums:
        cat2(su); h=find1(text,su,nums,nz2,CAT2)
        if h: return h
    # the mushaf's own spelling of a ta marbuta as ت (شجرت، رحمت، نعمت): tried as ة too, a few words at most
    ws=re.split(r'(\s+)',text); tx=[i for i,w in enumerate(ws) if re.search('ت[\u064B-\u065F\u0670]*$',w)]
    if not tx or len(tx)>4: return None
    import itertools
    for n in range(1,len(tx)+1):
        for c in itertools.combinations(tx,n):
            w2=list(ws)
            for i in c: w2[i]=re.sub('ت([\u064B-\u065F\u0670]*)$',r'ة\1',w2[i])
            h=find1(''.join(w2),su,nums)
            if h and not uBad(text,h[0]): return h
    return None
def find1(text,su=None,nums=None,NZ=None,CT=None):
    NZ=NZ or nz; CT=CT or CAT
    ws=[w for w in re.split(r'\s+',text) if NZ(w)]
    T=''.join(NZ(w) for w in ws)
    if len(T)<3: return None
    suras=[su] if su else list(SW)
    hits=[]
    for s_ in suras:
        L=SW[s_]; G=GR[s_]; C,ST,AT=CT[s_]
        i=C.find(T)
        while i>=0 and len(hits)<=3:
            stw=AT.get(i)
            if stw is not None and (i+len(T)==len(C) or (i+len(T)) in AT):
                e=(AT[i+len(T)]-1) if (i+len(T)) in AT else len(L)-1
                ok=not (stw>0 and L[stw-1][2]==L[stw][2]) and not (e+1<len(L) and L[e+1][2]==L[e][2])
                a0,a1=L[stw][1],L[e][1]
                if ok and nums and not (min(nums)-1<=a0 and a1<=max(nums)+1): ok=False
                if ok:
                    gids=sorted(set(x[2] for x in L[stw:e+1])); parts=[]
                    for g in gids:
                        us,ay,last=G[g]; parts.append(us)
                        if last: parts.append(MARK[(s_,ay)])
                    hits.append((' '.join(p for p in parts if p),s_,a0,a1))
            i=C.find(T,i+1)
        if len(hits)>3: break
    if not hits: return None
    if len(set(h[0] for h in hits))>1: return None       # the same words in more than one place, written differently
    h=hits[0]
    if uBad(text,h[0]): return None
    return h
def uthOf(s_,a,b):
    """the mushaf's words for the imla'i words a..b of sura s_ (with the aya marks), or None when a mushaf word is split there"""
    L=SW[s_]; G=GR[s_]
    if a>b or (a>0 and L[a-1][2]==L[a][2]) or (b+1<len(L) and L[b+1][2]==L[b][2]): return None
    parts=[]
    for g in sorted(set(x[2] for x in L[a:b+1])):
        us,ay,last=G[g]; parts.append(us)
        if last: parts.append(MARK[(s_,ay)])
    return ' '.join(p for p in parts if p)
def split(ta,tb,su=None,nums=None):
    """a verse written in two pieces (the end of one page and the start of the next): found whole, then cut where the first
    piece ends; returns (sura, aya from, aya to, mushaf words of the first piece, its last aya, of the second, its first aya) or None"""
    whole=find1(ta+' '+tb,su,nums)
    if not whole: return None
    s_=whole[1]; L=SW[s_]; C,ST,AT=CAT[s_]
    T=''.join(nz(w) for w in re.split(r'\s+',ta+' '+tb) if nz(w)); Ta=''.join(nz(w) for w in re.split(r'\s+',ta) if nz(w))
    if not Ta or len(Ta)>=len(T): return None
    i=C.find(T); hits=[]
    while i>=0:
        if i in AT and (i+len(T)==len(C) or (i+len(T)) in AT) and (i+len(Ta)) in AT:
            a=AT[i]; m=AT[i+len(Ta)]; b=(AT[i+len(T)]-1) if (i+len(T)) in AT else len(L)-1
            ua,ub=uthOf(s_,a,m-1),uthOf(s_,m,b)
            if ua and ub and L[a][1]==whole[2] and L[b][1]==whole[3]: hits.append((s_,whole[2],whole[3],ua,L[m-1][1],ub,L[m][1]))
        i=C.find(T,i+1)
    if not hits or len(set(h[3:] for h in hits))>1: return None
    h=hits[0]
    if uBad(ta,h[3]) or uBad(tb,h[5]): return None
    return h
SKIP=re.compile(r'\.\.\.|…|\bالآية\b|إلى قوله|الى قوله|[\[\]\(\)«»"]|\d')
def page(d,pg,force=False):
    """fills the verse marks of one page; returns how many were added"""
    P=d['p'][pg]
    if not isinstance(P,list): return 0
    U=d.setdefault('u',{}); L=U.get(str(pg)) or []
    # an entry whose words are no longer the page's words (the text was corrected since) is taken away; it is made again below if it can be
    def btext(it,k):
        if it+1>=len(P) or not isinstance(P[it+1],str): return None
        s=P[it+1]
        if k==-1:
            j=s.find('}'); return s[:j] if j>=0 and '{' not in s[:j] else (s if '{' not in s and '}' not in s else None)
        ms=list(re.finditer(r'\{([^{}]*)(\}|$)',s))
        return ms[k].group(1) if k<len(ms) else None
    keep=[]
    for r in L:
        if isinstance(r[1],int) and r[2]:
            t=btext(r[0],r[1])
            if t is None or uBad(t,r[2]): continue
        keep.append(r)
    dropped=len(L)-len(keep)
    if dropped: L=keep; U[str(pg)]=L
    have={(r[0],r[1]) for r in L if isinstance(r[1],int) and r[2]}
    add=[]
    for idx,s in enumerate(P):
        if not isinstance(s,str) or '{' not in s: continue
        it=idx-1; k=-1
        for m in re.finditer(r'\{([^{}]*)\}',s):
            k=s[:m.start()].count('{')     # this brace's ordinal in the paragraph
            if (it,k) in have: continue
            body=m.group(1)
            if SKIP.search(body) or len(body.split())<2: continue
            r=ref_after(s,m.end())
            if r=='bad': continue
            h=find(body,*(r if r else (None,None)))
            if h: add.append([it,k,h[0],h[1],h[2],h[3]])
    # a verse begun at the end of this page and ending on the next one: matched whole (both halves together, with the reference
    # after its end), then this half's own words from the mushaf; the next page's half follows from it when that page is matched
    last=[(idx,s) for idx,s in enumerate(P) if isinstance(s,str)][-1:]
    if last and pg+1<len(d['p']) and isinstance(d['p'][pg+1],list):
        idx,s=last[0]; o=s.rfind('{')
        if o>s.rfind('}'):
            it=idx-1; kk=s.count('{')-1; body=s[o+1:]
            nx=[x for x in d['p'][pg+1] if isinstance(x,str)][:1]
            if (it,kk) not in have and nx and not SKIP.search(body) and nz(body):
                ns=nx[0]; j=ns.find('}')
                if j>0 and '{' not in ns[:j] and not SKIP.search(ns[:j]):
                    r=ref_after(ns,j+1)
                    if r!='bad':
                        sp=split(body,ns[:j],*(r if r else (None,None)))
                        if sp: add.append([it,kk,sp[3],sp[0],sp[1],sp[2]])
    # a verse begun on the previous page and ending in the first paragraph here: the rest in the mushaf's script too
    first=[(idx,s) for idx,s in enumerate(P) if isinstance(s,str)][:1]
    if first:
        idx,s=first[0]; j=s.find('}')
        if j>0 and '{' not in s[:j] and (idx-1,-1) not in {(r[0],r[1]) for r in L if r[2]}:
            prev=None
            if pg>0 and isinstance(d['p'][pg-1],list):
                pl=[(i,x) for i,x in enumerate(d['p'][pg-1]) if isinstance(x,str)]
                if pl and pl[-1][1].rfind('{')>pl[-1][1].rfind('}'):
                    pi,ps=pl[-1]; kk=ps.count('{')-1
                    prev=[r for r in (U.get(str(pg-1)) or []) if r[0]==pi-1 and r[1]==kk and r[2]]
            body=s[:j]
            if prev and not SKIP.search(body) and nz(body):
                su=prev[0][3]
                r_=ref_after(s,j+1)
                nums=(r_[1] if r_ and r_!='bad' and r_[0]==su else None)
                sp=split(ps[ps.rfind('{')+1:],body,su,nums)
                h=None if sp else find(prev and ps[ps.rfind('{')+1:]+' '+body,su,nums)
                if sp:
                    add.append([idx-1,-1,sp[5],su,sp[1],sp[2]])
                    if prev[0][5] is not None and sp[2]>prev[0][5]: prev[0][5]=sp[2]
                elif h:
                    h2=find(body,su,None)
                    # the rest's own words, from the mushaf, where the whole verse was found
                    if h2 and h2[2]>=prev[0][4]:
                        add.append([idx-1,-1,h2[0],su,prev[0][4],h2[3]])
                        if prev[0][5] is not None and h2[3]>prev[0][5]: prev[0][5]=h2[3]
    if add:
        L=[r for r in L if not ((r[0],r[1]) in {(a[0],a[1]) for a in add})]+add
        L.sort(key=lambda r:(r[0],r[1] if isinstance(r[1],int) else 99))
        U[str(pg)]=L
    page.dropped=getattr(page,'dropped',0)+dropped
    return len(add)
if __name__=='__main__':
    f=sys.argv[1]; s=open(f,encoding='utf-8').read(); d=json.loads(s)
    pages=[int(x) for x in sys.argv[2:]] or range(len(d.get('p',[])))
    n=sum(page(d,p) for p in pages)
    if n:
        t=json.dumps(d,ensure_ascii=False,separators=(',',':'))+('\n' if s.endswith('\n') else '')
        json.loads(t); open(f,'w',encoding='utf-8').write(t)
    print(f,'added',n)
