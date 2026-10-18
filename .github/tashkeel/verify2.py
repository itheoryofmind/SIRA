# an independent check of the tashkeel layer (it does not use the aligner):
# 1. every entry, laid on its text, changes no letter: take the marks off and the text is the same, character for character;
# 2. every word given marks is, in the Shamela book named for it, the same word (same letters, or one of the listed spellings
#    of the same word) with exactly those marks; and on each side, either the next word is the book's next word too,
#    or a clause ends there in the site's text and in the book alike.
import json,re,pickle,sys
sys.path.insert(0,'/tmp/tsk')
LET=re.compile(r'[ء-غف-يٱ]');MK=re.compile(r'[ً-ْٰ]')
WORD=re.compile(r'[ء-غف-يٱ][ء-غف-يٱً-ْٰـ]*')
NT=str.maketrans({'ٱ':'ا','ؤ':'ء','ئ':'ء'})
from align import CAN   # only the list of spellings of one word, to be shown to the reader too
def nb(w): return CAN.get(MK.sub('',w).replace('ـ','').translate(NT),MK.sub('',w).replace('ـ','').translate(NT))
T=json.load(open('/tmp/tsk/tsk.json'));TAB=T['t'];MAP=T['m'];PROV=pickle.load(open('/tmp/tsk/prov.pkl','rb'))
books={};INV=pickle.load(open('/tmp/tsk/inv.pkl','rb'))
def book(b):
    if b not in books: books[b]=pickle.load(open(f'/tmp/tsk/c_{b}.pkl','rb'))
    return books[b]
def dec(code,n):
    o=[];i=0
    while i<len(code):
        c=code[i]
        if c=='~': j=code.index('~',i+1);o+=['']*int(code[i+1:j]);i=j+1
        elif c=='.': o.append('');i+=1
        else: o.append(TAB[c]);i+=1
    return o if len(o)==n else None
def lay(s,M):
    o='';li=0
    for i,c in enumerate(s):
        o+=c
        if LET.match(c):
            m=M[li];li+=1
            if m and not (i+1<len(s) and MK.match(s[i+1])): o+=m
    return o
BRE=re.compile(r'[\n.:؟!«"()\[\]{}﴿﴾0-9٠-٩\-–]');ERE=re.compile(r'[\n.،,:؛؟!»"()\[\]{}﴿﴾0-9٠-٩\-–]')
e1=e2=e3=ok=0;ex=[]
for k,(s,prov) in PROV.items():
    n=int(k.split(':')[0]);M=dec(MAP[k],n)
    if M is None: e1+=1;continue
    v=lay(s,M)
    if MK.sub('',v)!=MK.sub('',s): e1+=1;ex.append(('letters',s[:60]));continue
    ws=list(WORD.finditer(s));vw=list(WORD.finditer(v))
    for i,b,j in prov:
        if b=='inv':
            site=ws[i].group(0);marked=vw[i].group(0);nx=nb(ws[i+1].group(0)) if i+1<len(ws) else ''
            ref=INV.get((nb(site),nx.startswith('ا') or nx in ('بن','ابن')))
            if ref is None or MK.findall(ref)!=MK.findall(marked) and len(MK.sub('',ref))==len(site): e2+=1;ex.append(('inv',marked,ref))
            else: ok+=1
            continue
        C=book(b);W=C['W']
        site=ws[i].group(0);marked=vw[i].group(0)
        if nb(site)!=nb(W[j]) and CAN.get(nb(site),nb(site))!=CAN.get(nb(W[j]),nb(W[j])): e2+=1;ex.append(('word',site,W[j]));continue
        # the marks: the same as the book's, letter by letter (over the letters both write)
        from align import split_marks,transfer
        tb=transfer(split_marks(site),split_marks(W[j]));tm=[m for _,m in split_marks(marked)]
        if tb is None or any(m and m!=b for m,b in zip(tm,tb)):
            e2+=1;ex.append(('marks',marked,W[j]));continue
        L= i>0 and j>0 and nb(ws[i-1].group(0))==nb(W[j-1])
        L= L or ((i==0 or BRE.search(s[ws[i-1].end():ws[i].start()])) and C['B'][j])
        R= i+1<len(ws) and j+1<len(W) and nb(ws[i+1].group(0))==nb(W[j+1])
        R= R or ((i==len(ws)-1 or ERE.search(s[ws[i].end():ws[i+1].start()])) and C['E'][j])
        if not R and L and i>0 and nb(ws[i-1].group(0))==nb(W[j-1]):
            nx=[nb(ws[i+1].group(0))] if i+1<len(ws) else []
            if j+1<len(W): nx.append(nb(W[j+1]))
            R=all(not (w.startswith('ا') or w in ('بن','ابن')) for w in nx)
        if not (L and R): e3+=1;ex.append(('context',site,' '.join(W[j-2:j+3])));continue
        ok+=1
print('texts',len(PROV),'| letters changed:',e1,'| word or marks not the book’s:',e2,'| neighbours not the book’s:',e3,'| words confirmed:',ok)
for x in ex[:20]: print(x)
