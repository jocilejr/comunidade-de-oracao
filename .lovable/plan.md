

# Fix: "invalid input syntax for type json" in queryWithRLS

## Problem
The `set_config('request.jwt.claims', $1, true)` call fails because PostgreSQL infers the `$1` parameter as `json` type instead of `text`. The `set_config` function expects `text`.

## Fix
One line change in `self-host/api-server.js` — explicitly cast the parameter to `text`:

```javascript
// Line 55: Change from:
await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
// To:
await client.query(`SELECT set_config('request.jwt.claims', $1::text, true)`, [
```

## After deploying
Copy the updated file and restart:
```bash
cp /root/comunidade-de-oracao/self-host/api-server.js /opt/funnel-app/ && pm2 restart funnel-api
```

Then re-run the test:
```bash
cd /opt/funnel-app && set -a && source .env && set +a && TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'618396b3-4ec8-4b91-af9f-214567497eb1',role:'authenticated',aud:'authenticated'},process.env.PGRST_JWT_SECRET,{algorithm:'HS256',expiresIn:3600}))") && curl -s -X POST "http://127.0.0.1:4000/typebot-proxy" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"action":"list"}' | head -c 800
```

