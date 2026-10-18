# a review task for one agent: the pages' strips and, for each page, its words to read in reading order (targets and a few controls, unlabeled)
import json,pickle,random,os,sys,re
book,pages_file,start,end,name,imgdir=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),sys.argv[5],sys.argv[6]
random.seed(name)
A=json.load(open(f'/tmp/tsk/pr/m{book}_all.json'))['T'];M=json.load(open('/tmp/tsk/pr/pdfmap.json'))[book]
C=pickle.load(open(f'/tmp/tsk/c_{book}.pkl','rb'));W,P,N=C['W'],C['P'],C['N']
pages=json.load(open(pages_file))[start:end]
strips=sorted(os.listdir(imgdir))
MK=re.compile(r'[ً-ْٰ]')
items=[];key={};lines=[]
byp={}
for i,p in enumerate(P):
    if p in set(pages): byp.setdefault(p,[]).append(i)
k=0
for p in pages:
    I=byp[p];tg=set(A[str(p)]);ctl=[i for i in I if i not in tg and len(N[i])>=3 and MK.search(W[i])];ctl=set(random.sample(ctl,min(2,len(ctl))))
    u,n=M[str(p)];base=os.path.basename(u)[:-4]
    S=[s for s in strips if s.startswith(f'{base}_{n}_')]+[s for s in strips if s.startswith(f'{base}_{n+1}_')][:3]
    lines.append(f"\n=== صفحة {p} — الصور: "+' '.join(S))
    for i in sorted(tg|ctl):
        k+=1;ctx=' '.join(N[max(I[0],i-4):i])+' [[ '+N[i]+' ]] '+' '.join(N[i+1:min(I[-1]+1,i+5)])
        items.append([p,i,ctx]);key[f'{p}:{i}']={'kind':'target' if i in tg else 'control','shamela':W[i],'cat':'unconf' if i in tg else ''}
        lines.append(f"{k}. {ctx}")
open(f'/tmp/tsk/pr/{name}_task.txt','w').write('\n'.join(lines))
json.dump({'items':items},open(f'/tmp/tsk/pr/{name}.json','w'),ensure_ascii=False)
json.dump(key,open(f'/tmp/tsk/pr/{name}_key.json','w'),ensure_ascii=False)
print(name,len(pages),'pages',k,'items')
