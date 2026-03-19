

# Fix: Typebot Proxy Can't Read user_settings Due to RLS

## Root Cause

The `api-server.js` proxy queries `user_settings` using `pool.query()` as the `funnel_user` database role. The RLS policy on `user_settings` requires `auth.uid() = user_id`, but since no JWT claims are set on the raw pg connection, `auth.uid()` returns NULL and the query returns 0 rows — hence the "Token do Typebot não configurado" error.

The data IS in the database (confirmed: `has_token = t`, workspace = `cmghj8t790000o918ec7vgtt8`). The proxy just can't see it through RLS.

## Fix

Modify `handleTypebotProxy` and `handleOpenaiProxy` in `self-host/api-server.js` to set the PostgreSQL session variables before querying, so `auth.uid()` works correctly with RLS:

```javascript
// Before each query that hits an RLS-protected table:
await pool.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ sub: userId, role: 'authenticated' })
]);
await pool.query(`SET LOCAL ROLE authenticated`);
```

**However**, since `pool.query()` doesn't guarantee the same connection for sequential calls, we need to use a **single client from the pool** (transaction-style):

```javascript
const client = await pool.connect();
try {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' })
  ]);
  await client.query(`SET LOCAL ROLE authenticated`);
  const { rows } = await client.query(
    `SELECT typebot_api_token, typebot_workspace_id, typebot_base_url
     FROM user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  // ... rest of logic
} finally {
  await client.query(`RESET ROLE`);
  client.release();
}
```

## Files Changed

1. **`self-host/api-server.js`** — Update `handleTypebotProxy` and `handleOpenaiProxy` to use a dedicated client with JWT claims set before querying RLS-protected tables. Apply the same pattern to any other function that reads from `user_settings`.

## Alternative (Simpler)

If setting role/claims is complex on the VPS Postgres setup, a simpler approach: create a helper that queries as `postgres` superuser (bypasses RLS) or add a SECURITY DEFINER function in Postgres:

```sql
CREATE OR REPLACE FUNCTION get_user_settings(p_user_id uuid)
RETURNS SETOF user_settings
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM user_settings WHERE user_id = p_user_id LIMIT 1;
$$;
```

Then the proxy calls `SELECT * FROM get_user_settings($1)` which bypasses RLS safely.

## Recommendation

The **SECURITY DEFINER function** approach is simpler and more robust — it requires:
1. One SQL command on the VPS to create the function
2. One line change in `api-server.js` to use the function instead of direct table query

