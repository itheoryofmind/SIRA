# the weekly check of the two sites' text, as readers get it, against the fingerprints kept when it was verified (data/fx_snap.json);
# the result goes to the keeper's panel (push.seeratuh.com/c/fx), which tells him only if something differs from what was verified
import json,sys,os,hashlib,urllib.request,urllib.error,time,traceback
def h(s):
    x=0x811c9dc5;b=s.encode('utf-16-le')
    for i in range(0,len(b),2):
        x^=b[i]|(b[i+1]<<8);x=(x*16777619)&0xffffffff
    return format(x,'x')
def walk(o,p,out):
    if isinstance(o,str): out.append((p,o))
    elif isinstance(o,list):
        for i,v in enumerate(o): walk(v,p+[i],out)
    elif isinstance(o,dict):
        for k in sorted(o): walk(o[k],p+[k],out)
def get(u):
    for k in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(u+'?fx='+str(time.time()),headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'}),timeout=60).read()
        except Exception as e: err=e;time.sleep(15)
    raise err
ADMIN=hashlib.sha256(os.environ['CLOUDFLARE_API_TOKEN'].encode()).hexdigest()[:40]
def run():
    for s,site in (('sira','https://seeratuh.com/'),('durar','https://dorarnajdiah.com/')):
        snap=json.loads(get(site+'data/fx_snap.json'));ch=[];miss=0;total=0
        for f,S in snap['files'].items():
            total+=len(S)
            try: D=json.loads(get(site+'data/'+f))
            except Exception: miss+=1;continue
            L=[];walk(D,[],L)
            if len(L)!=len(S): ch.append({'f':f,'p':['*']});continue
            for (p,t),x in zip(L,S):
                if h(t)!=x: ch.append({'f':f,'p':p})
        body=json.dumps({'s':s,'total':total,'changed':ch[:500],'miss':miss}).encode()
        try: r=urllib.request.urlopen(urllib.request.Request('https://push.seeratuh.com/c/fx',data=body,headers={'X-Admin':ADMIN,'Content-Type':'application/json','User-Agent':'Mozilla/5.0 (fidelity check)'}),timeout=60).read().decode()
        except urllib.error.HTTPError as e: r='HTTP %s %s'%(e.code,e.read()[:200])
        print('::notice::'+s,'texts',total,'changed',len(ch),'files not read',miss,'->',r)
try: run()
except Exception as e:
    print('::error::'+repr(e)[:300]);raise
