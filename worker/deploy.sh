#!/usr/bin/env bash
# deploys the «من شمائله» notifier to Cloudflare (push.seeratuh.com); run by .github/workflows/push-worker.yml
set -euo pipefail
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?add the CLOUDFLARE_API_TOKEN secret in the repository settings}"
api(){ curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }
ACC="${CLOUDFLARE_ACCOUNT_ID:-}"
[ -n "$ACC" ] || ACC=$(api https://api.cloudflare.com/client/v4/accounts | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"][0]["id"])')
echo "account found"
NS=$(api "https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces?per_page=100" | python3 -c 'import sys,json;r=[n["id"] for n in json.load(sys.stdin)["result"] if n["title"]=="sira-push"];print(r[0] if r else "")')
if [ -z "$NS" ]; then
  NS=$(api -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces" -d '{"title":"sira-push"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["id"])')
  echo "store created"
fi
cat > wrangler.toml <<T
name = "sira-push"
main = "src/index.js"
compatibility_date = "2024-09-01"
account_id = "$ACC"
workers_dev = false
routes = [{ pattern = "push.seeratuh.com", custom_domain = true }]
[[kv_namespaces]]
binding = "PUSH"
id = "$NS"
[triggers]
crons = ["0 3 * * *", "0 6 * * 5"]   # every day 6:00 in Riyadh; Friday 9:00
T
CLOUDFLARE_ACCOUNT_ID="$ACC" npx --yes wrangler@3 deploy
# check it answers (the certificate of a new domain can take a minute or two)
for i in $(seq 1 30); do
  if out=$(curl -fsS https://push.seeratuh.com/health 2>/dev/null); then echo "live: $out"; curl -fsS https://push.seeratuh.com/key >/dev/null && echo "key ok"; exit 0; fi
  sleep 10
done
echo "deployed, but push.seeratuh.com did not answer yet"; exit 1
