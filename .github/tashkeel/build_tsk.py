# the tashkeel layer: for every text on the site, the marks Shamela's vocalized books give its words.
# Letters are never touched. A word gets marks only where its letters, and both its neighbours, agree with the book.
import json,os,re,pickle,sys,glob,time
sys.path.insert(0,'/tmp/tsk')
from align import Src,align,split_marks,transfer
class _I: name='inv'
INVS=_I()
INV=pickle.load(open('/tmp/tsk/inv.pkl','rb'))
PRINT=json.load(open('/tmp/tsk/pr/print_ok.json')) if os.path.exists('/tmp/tsk/pr/print_ok.json') else {}
from corpus import WORD,MARK
DATA='/tmp/durar_work/sitebuild/data'
LET=re.compile(r'[ء-غف-يٱ]')
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
SKIP={'quran.json','qv.json','coast.json','marks.json','heads.json','tsk.json'}
MINRUN=4
def strings(x):
    if isinstance(x,str):
        if len(WORD.findall(x))>=3: yield x
    elif isinstance(x,list):
        for v in x: yield from strings(v)
    elif isinstance(x,dict):
        for k,v in x.items():
            if isinstance(k,str) and len(WORD.findall(k))>=3: yield k
            yield from strings(v)
def marks_for(text,srcs):
    ws,res=align(text,srcs)
    # where the other edition of the same book reads a word differently (a vowel against a vowel), the word waits for the print
    used=[r[1].name for r in res if r is not None and any(r[0])]
    if used:
        from collections import Counter as _C
        from align import SIB as _SIB
        home=_C(used).most_common(1)[0][0];sib=_SIB.get(home)
        if sib and sib in BY:
            _,res2=align(text,[BY[sib]])
            for i,(r,q) in enumerate(zip(res,res2)):
                if r is None or q is None or not any(r[0]) or not any(q[0]) or r[1].name==sib: continue
                a=[''.join(sorted(m.replace('\u0652',''))) for m in r[0]];b=[''.join(sorted(m.replace('\u0652',''))) for m in q[0]]
                if not all(x==y or not x or not y or set(x)<=set(y) or set(y)<=set(x) for x,y in zip(a,b)):
                    DISPUTE.append((text[ws[i][0]:ws[i][1]],''.join(c+m for (c,_),m in zip(split_marks(text[ws[i][0]:ws[i][1]]),r[0])),''.join(c+m for (c,_),m in zip(split_marks(text[ws[i][0]:ws[i][1]]),q[0])),r[1].name,r[2],sib,q[2],text))
                    res[i]=None
    # a word the site already writes with marks (a verse in the mushaf's spelling) is left as it is
    for i in range(len(res)):
        if MARK.search(text[ws[i][0]:ws[i][1]]): res[i]=None
    # a verse quoted in a text ({…} or ﴿…﴾) is the Quran's: it is not given marks from these books
    for m in re.finditer(r'\{[^}]*\}|﴿[^﴾]*﴾',text):
        for i in range(len(res)):
            if ws[i][0]>=m.start() and ws[i][1]<=m.end(): res[i]=None
    # option (أ), the keeper's choice: a mark is shown only when a second, independent copy gives the same one.
    # Each letter keeps its mark only if another edition, or the same hadith in another book (aligned by the same rules),
    # puts the same mark on it; a sukun one writes and the other leaves out is no difference in reading.
    alts=[align(text,[S])[1] for S in srcs]
    for i,r in enumerate(res):
        if r is None or not any(r[0]): continue
        others=[a[i] for S,a in zip(srcs,alts) if a[i] is not None and any(a[i][0]) and not (a[i][1].name==r[1].name and a[i][2]==r[2])]
        # the print itself, read from the page image (pr/print_ok.json): a second witness like another edition
        pk=f'{r[1].name}:{r[2]}'
        if pk in PRINT:
            t=transfer(split_marks(text[ws[i][0]:ws[i][1]]),split_marks(PRINT[pk]))
            if t is not None: others=others+[(t,None,None)]
        conf=['']*len(r[0])
        for q in others:
            if len(q[0])!=len(r[0]): continue
            for k,(x,y) in enumerate(zip(r[0],q[0])):
                if conf[k]: continue
                cx=''.join(sorted(x.replace('\u0652','')));cy=''.join(sorted(y.replace('\u0652','')))
                if x and cx==cy and (cx or '\u0652' in x): conf[k]=x
        CONF[0]+=sum(1 for m in r[0] if m);CONF[1]+=sum(1 for m in conf if m)
        res[i]=(conf,r[1],r[2]) if any(conf) else None
    # last: a word that every vocalized book marks the same way wherever it stands (30 times at least, never otherwise)
    has=[r is not None and any(r[0]) for r in res]
    for i,r in enumerate(res):
        if has[i]: continue
        # only a gap inside a hadith taken from the books: a book's word on one side at least, within the same clause
        if not ((i>0 and has[i-1]) or (i+1<len(res) and has[i+1])): continue
        w=text[ws[i][0]:ws[i][1]];nx=ws[i+1][2] if i+1<len(ws) else ''
        k=(ws[i][2],nx.startswith('ا') or nx in ('بن','ابن'))
        if k in INV:
            mk=transfer(split_marks(w),split_marks(INV[k]))
            if mk and any(mk): res[i]=(mk,INVS,None)
    _last[0]=(None,None,ws,res)
    li=0;start={}
    for idx,ch in enumerate(text):
        start[idx]=li
        if LET.match(ch): li+=1
    M=['']*li;stat=[0,0,0]   # words, words with a source, words with marks
    for (s,e,_),r in zip(ws,res):
        stat[0]+=1
        if r is None: continue
        stat[1]+=1;k=start[s]
        for (ch,_),m in zip(split_marks(text[s:e]),r[0]):
            if LET.match(ch): M[k]=m;k+=1
        if any(r[0]): stat[2]+=1
    return M,stat,ws,res
PROV={};_last=[None];DISPUTE=[];BY={};CONF=[0,0]
TAB={}
def enc(M):
    out=[];run=0
    def flush():
        nonlocal run
        if run==1: out.append('.')
        elif run==2: out.append('..')
        elif run>2: out.append(f'~{run}~')
        run=0
    for m in M:
        if not m: run+=1;continue
        flush()
        if m not in TAB: TAB[m]=CH[len(TAB)]
        out.append(TAB[m])
    flush();return ''.join(out)
CH=[chr(c) for c in list(range(0x41,0x5B))+list(range(0x61,0x7B))+list(range(0x30,0x3A))+list(range(0xC0,0x250))]
if __name__=='__main__':
    books=sys.argv[1].split(',')
    srcs=[]
    for b in books:
        C=pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb'));S=Src(C,b);srcs.append(S)
    BY.update({S.name:S for S in srcs})
    files=sys.argv[2].split(',') if len(sys.argv)>2 and sys.argv[2]!='all' else sorted(f for f in os.listdir(DATA) if f.endswith('.json') and f not in SKIP)
    OUT={};REP={}
    for f in files:
        t0=time.time();d=json.load(open(f'{DATA}/{f}'));st=[0,0,0];seen=set()
        for s in strings(d):
            if s in seen: continue
            seen.add(s)
            M,stat,_,_=marks_for(s,srcs)
            for q in range(3): st[q]+=stat[q]
            if stat[2]:
                OUT[key(s)]=enc(M)
                _,_,ws_,res_=_last[0]
                PROV[key(s)]=(s,[(i,r[1].name,r[2]) for i,r in enumerate(res_) if r is not None and any(r[0])])
            if '\n' in s:
                for line in s.split('\n'):
                    if len(WORD.findall(line))>=3:
                        M2,s2,_,_=marks_for(line,srcs)
                        if s2[2]:
                            OUT[key(line)]=enc(M2);_,_,ws_,res_=_last[0]
                            PROV[key(line)]=(line,[(i,r[1].name,r[2]) for i,r in enumerate(res_) if r is not None and any(r[0])])
        REP[f]=st;print(f,st,f'{time.time()-t0:.0f}s',flush=True)
    json.dump({'t':{v:k for k,v in TAB.items()},'m':OUT},open('/tmp/tsk/tsk.json','w'),ensure_ascii=False,separators=(',',':'))
    json.dump(REP,open('/tmp/tsk/report.json','w'),ensure_ascii=False)
    pickle.dump(PROV,open('/tmp/tsk/prov.pkl','wb'));pickle.dump(DISPUTE,open('/tmp/tsk/dispute.pkl','wb'));print('disputed words held back',len(DISPUTE),'| marks confirmed',CONF[1],'of',CONF[0])
