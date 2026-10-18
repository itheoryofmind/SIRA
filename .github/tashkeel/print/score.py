import json,re,sys
D=K=O=None
if __name__=="__main__": D=json.load(open(sys.argv[1]));K=json.load(open(sys.argv[2]));O=json.load(open(sys.argv[3]))
MK='ًٌٍَُِّْٰ'
def norm(w):
    w=re.sub(r'اً$','ًا',w);w=w.replace('ٰ','َ').replace('ٖ','ِ').replace('ٱ','ا').replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ى','ي').replace('ـ','')
    L=[]
    for ch in w:
        if ch in MK:
            if L: L[-1][1]+=ch
        elif 'ء'<=ch<='ي': L.append([ch,''])
    return [(a,''.join(sorted(b.replace('ْ','')))) for a,b in L]
def cmp(a,b):
    A,B=norm(a),norm(b)
    if [x for x,_ in A]!=[x for x,_ in B]: return 'letters'
    bad=0;miss=0
    for (x,m1),(y,m2) in zip(A,B):
        if m1 and m2 and m1!=m2: bad+=1
        elif m1 and not m2: miss+=1
    return 'diff' if bad else ('agree' if not miss else 'agree-partial')
if __name__=="__main__":
    from collections import Counter
    C=Counter();ex=[]
    for (p,i,ctx),o in zip(D['items'],O):
        k=K[f'{p}:{i}'];r=cmp(k['shamela'],o['print'])
        C[(k['kind'],k['cat'],r,o['conf'])]+=1
        if r!='agree': ex.append((k['kind'],k['cat'],r,k['shamela'],o['print'],o.get('note','')[:80]))
    for x in sorted(C.items()): print(x)
    for e in ex: print(e)
