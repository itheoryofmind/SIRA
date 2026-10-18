# a Shamela book (online, vocalized) as one stream of words: each word keeps its marks; letters normalized only for matching
import gzip,re,html,os,glob,pickle,sys
MARK=re.compile(r'[ً-ْٰ]')
AR=r'ء-غف-يٱ'
WORD=re.compile(r'[%s][%sً-ْٰـ]*'%(AR,AR))
def base(w): return MARK.sub('',w).replace('ـ','')
NT=str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي','ؤ':'ء','ئ':'ء'})
def norm(w): return base(w).translate(NT)
GLYPH={'ﷺ':'صلى الله عليه وسلم','\uFD40':'رحمه الله','\uFD41':'رضي الله عنه','\uFD42':'رضي الله عنها','\uFD43':'رضي الله عنهم','\uFD44':'رضي الله عنهما','\uFD45':'رضي الله عنهن','\uFD47':'عليه السلام','\uFD48':'عليهم السلام','\uFD49':'عليهما السلام','\uFD4A':'عليه الصلاة والسلام','\uFD4D':'عليها السلام','\uFD4E':'تبارك وتعالى','\uFD4F':'رحمهم الله','\uFDFB':'جل جلاله','\uFDFF':'عز وجل'}
def page_main(h):
    m=re.search(r'<div class="nass[^"]*"[^>]*>(.*?)<div id="appended',h,re.S)
    if not m: return None
    t=m.group(1)
    t=t.split('<hr><p class="hamesh">')[0]
    t=re.sub(r'<a href="#p\d+"[^>]*>.*?</a>','',t,flags=re.S)
    t=re.sub(r'<br\s*/?>|</p>',' \n ',t);t=re.sub(r'<[^>]+>',' ',t);t=html.unescape(t)
    t=re.sub(r'⦗[^⦘]*⦘',' ',t)
    for g,x in GLYPH.items(): t=t.replace(g,' \u2060'+x+'\u2060 ')
    return t
def build(book,dirs):
    files={}
    for d in dirs:
        for f in glob.glob(f'{d}/shamela/{book}/*.html.gz')+glob.glob(f'{d}/*.html.gz'): files[int(os.path.basename(f).split('.')[0])]=f
    W=[];P=[];G=[];B=[];E=[]   # words with marks, page of each, and whether the word came from a ligature (ﷺ, ﵁ …)
    for p in sorted(files):
        t=page_main(gzip.open(files[p]).read().decode('utf-8','replace'))
        if t is None: continue
        t='\n'+t+'\n';g=False;prev=0;first=True
        for m in re.finditer(r'\u2060|'+WORD.pattern,t):
            if m.group(0)=='\u2060': g=not g;continue
            gap=t[prev:m.start()].replace('\u2060',' ')
            if not first: E[-1]=bool(re.search(r'[\n.،,:؛؟!»"()\[\]{}﴿﴾0-9٠-٩\-–]',gap))
            B.append(bool(re.search(r'[\n.:؟!«"()\[\]{}﴿﴾0-9٠-٩\-–]',gap)));E.append(True);first=False
            W.append(m.group(0));P.append(p);G.append(g);prev=m.end()
    # «ثلاثمائة» written as one word: as two, as the site writes it (ثلاث مائة), each with its own marks
    NUMRE=re.compile(r'^([وف]?(?:ثلاث|أربع|خمس|ست|سبع|ثمان|تسع))(مائة|مئة|مائتي|مائتين)$')
    W2=[];P2=[];G2=[];B2=[];E2=[]
    for w,p_,g,b,e in zip(W,P,G,B,E):
        m=NUMRE.match(base(w))
        if m:
            k=len(m.group(1));cut=0;cnt=0
            for q,ch in enumerate(w):
                if not MARK.match(ch) and ch!='\u0640':
                    if cnt==k: cut=q;break
                    cnt+=1
            W2+= [w[:cut],w[cut:]];P2+=[p_,p_];G2+=[g,g];B2+=[b,False];E2+=[False,e]
        else: W2.append(w);P2.append(p_);G2.append(g);B2.append(b);E2.append(e)
    W,P,G,B,E=W2,P2,G2,B2,E2
    N=[norm(w) for w in W]
    # a ligature has no marks: give its words the marks this same book gives the same words when it writes them out
    from collections import Counter,defaultdict
    for g,x in GLYPH.items():
        xs=x.split();k=len(xs);seen=Counter()
        nx=[norm(w) for w in xs]
        for i in range(len(W)-k+1):
            if not G[i] and N[i:i+k]==nx and all(MARK.search(w) for w in W[i:i+k]): seen[tuple(W[i:i+k])]+=1
        best=seen.most_common(1)[0][0] if seen else None
        if best:
            for i in range(len(W)-k+1):
                if G[i] and N[i:i+k]==nx:
                    for q in range(k): W[i+q]=best[q]
    assert len(B)==len(W)==len(E),(len(B),len(W),len(E))
    return dict(book=book,W=W,P=P,N=N,G=G,B=B,E=E)
if __name__=='__main__':
    book=sys.argv[1];dirs=sys.argv[2:]
    C=build(book,dirs);pickle.dump(C,open(f'/tmp/tsk/c_{book}.pkl','wb'));print(book,len(C['W']),'words',len(set(C['P'])),'pages')
