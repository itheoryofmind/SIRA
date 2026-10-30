# the signed call to push.seeratuh.com, shared by the site's workflows (the same as apply.py's)
import json, os, hashlib, urllib.request
W = os.environ.get('CMS_W', 'https://push.seeratuh.com')
def auth():
    u, t = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'), os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    if u and t:
        r = urllib.request.Request(u + '&audience=seeratuh-cms', headers={'Authorization': 'bearer ' + t})
        return {'X-OIDC': json.load(urllib.request.urlopen(r, timeout=30))['value']}
    return {'X-Admin': hashlib.sha256(os.environ['CLOUDFLARE_API_TOKEN'].encode()).hexdigest()[:40]}
def post(p, o=None):
    r = urllib.request.Request(W + p, data=json.dumps(o or {}).encode(), method='POST',
                               headers={**auth(), 'Content-Type': 'application/json', 'User-Agent': 'site-cms'})
    return json.load(urllib.request.urlopen(r, timeout=60))
