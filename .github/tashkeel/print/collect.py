# the print's own readings, as transcribed (blind) from the page images, kept for the words whose letters match the book's
import json,sys,os,re
sys.path.insert(0,'/tmp/tsk/pr')
from score import norm
P='/tmp/tsk/pr/print_ok.json';OK=json.load(open(P)) if os.path.exists(P) else {}
book=sys.argv[1]
for task,out in zip(sys.argv[2::2],sys.argv[3::2]):
    D=json.load(open(task));O=json.load(open(out));n=0
    import pickle
    W=pickle.load(open(f'/tmp/tsk/c_{book}.pkl','rb'))['W']
    for (p,i,ctx),o in zip(D['items'],O):
        if o.get('conf')!='clear' or not o.get('print'): continue
        if [x for x,_ in norm(o['print'])]!=[x for x,_ in norm(W[i])]: continue
        OK[f'{book}:{i}']=re.sub(r'اً$','ًا',o['print']).replace('ٰ','َ').replace('ٖ','ِ');n+=1
    print(task,n)
json.dump(OK,open(P,'w'),ensure_ascii=False)
print('print readings kept',len(OK))
