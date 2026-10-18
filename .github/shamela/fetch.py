# downloads Shamela pages as they are (raw HTML, nothing changed) into shamela/<book>/<page>.html.gz
import sys,os,gzip,time,urllib.request,urllib.error
book,a,b=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
out=f'shamela/{book}';os.makedirs(out,exist_ok=True)
H={'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1','Accept-Language':'ar'}
miss=0
for p in range(a,b+1):
    f=f'{out}/{p}.html.gz'
    if os.path.exists(f): continue
    for k in range(5):
        try:
            r=urllib.request.urlopen(urllib.request.Request(f'https://shamela.ws/book/{book}/{p}',headers=H),timeout=40);d=r.read();break
        except urllib.error.HTTPError as e:
            if e.code==404: d=None;break
            print('http',e.code,p,flush=True);time.sleep(10*(k+1))
        except Exception as e:
            print('err',p,e,flush=True);time.sleep(10*(k+1))
    else: d=None
    if d is None:
        miss+=1;print('missing',p,flush=True)
        if miss>=30: break
        continue
    miss=0;gzip.open(f,'wb').write(d);time.sleep(.1)
print('done',book,a,b)
