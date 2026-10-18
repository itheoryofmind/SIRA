# the tashkeel layer: for every text on the site, the marks Shamela's vocalized books give its words.
# Letters are never touched. A word gets marks only where its letters, and both its neighbours, agree with the book.
import json,os,re,pickle,sys,glob,time
sys.path.insert(0,'/tmp/tsk')
from align import Src,align,split_marks,transfer
class _I: name='inv'
INVS=_I()
INV=pickle.load(open('/tmp/tsk/inv.pkl','rb'))
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
PROV={};_last=[None]
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
    pickle.dump(PROV,open('/tmp/tsk/prov.pkl','wb'))
