// api-data — read-only API-key access to a user's own transactions/portfolios,
// for an AI agent or script to query without a browser login.
//
// Deploy:
//   supabase functions deploy api-data --no-verify-jwt
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key from Project Settings > API>
// (--no-verify-jwt: this function does its own auth via the api_keys table,
// not Supabase's normal per-request user JWT, since a script/agent calling
// it has no browser session to get one from.)
// SUPABASE_URL and SUPABASE_ANON_KEY are already injected automatically by
// Supabase into every Edge Function's environment — only the service-role
// key needs to be set explicitly, and it must NEVER be put in the site's
// own repo/client code (this function is the only place that touches it).
//
// Request:
//   GET https://<project-ref>.functions.supabase.co/api-data?resource=portfolios
//   GET https://<project-ref>.functions.supabase.co/api-data?resource=transactions[&symbol=AAPL][&portfolio_id=<uuid>]
//   Header: Authorization: Bearer <raw api key, generated in 거래내역 tab>
//
// Security model: the key's hash is looked up in api_keys (RLS-protected,
// but this function uses the SERVICE ROLE key which bypasses RLS — so every
// query below explicitly filters by the resolved user_id itself, rather than
// relying on RLS to do it). Read-only: this function never writes anything
// except updating the key's own last_used_at timestamp.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Only GET is supported' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const rawKey = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawKey) return json({ error: 'Missing Authorization: Bearer <api key>' }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const keyHash = await sha256Hex(rawKey);

  const { data: keyRow, error: keyErr } = await sb
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (keyErr) return json({ error: 'Key lookup failed' }, 500);
  if (!keyRow) return json({ error: 'Invalid or revoked API key' }, 401);

  const userId = keyRow.user_id;
  // Best-effort, non-blocking — don't fail the request if this write hiccups.
  sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then(() => {});

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');

  if (resource === 'portfolios') {
    const { data, error } = await sb
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json(data);
  }

  if (resource === 'transactions') {
    let q = sb
      .from('transactions')
      .select('*, portfolios(name)')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true })
      .limit(50000);
    const symbol = url.searchParams.get('symbol');
    const portfolioId = url.searchParams.get('portfolio_id');
    if (symbol) q = q.eq('symbol', symbol.toUpperCase());
    if (portfolioId) q = q.eq('portfolio_id', portfolioId);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    const flattened = (data || []).map((t: Record<string, unknown>) => {
      const { portfolios, ...rest } = t;
      return { ...rest, portfolio_name: (portfolios as { name?: string } | null)?.name ?? null };
    });
    return json(flattened);
  }

  return json({ error: 'Unknown or missing resource. Use ?resource=portfolios or ?resource=transactions' }, 400);
});
