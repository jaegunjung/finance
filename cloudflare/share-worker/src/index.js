// share.jjanalysis.com — link-preview pages for the 수익률 공유 card.
//
// Why this exists: LinkedIn only shows a picture for a link if the linked page's
// HTML has an og:image. jjanalysis.com is static (GitHub Pages), so it can't
// make a different image per share, and Supabase Edge Functions rewrite
// text/html to text/plain unless you pay for a custom domain. This Worker is the
// small dynamic piece:
//
//   GET /s/<uuid>   → HTML with og:title / og:image (the card PNG in Supabase
//                     Storage), then redirects people to the jjanalysis.com page
//                     the card is about (query string, e.g. UTM tags, kept).
//   GET /health     → "ok" (share.js checks this before using preview links)
//
// Data comes from public.share_cards (see supabase/share_cards.sql) via the
// public anon key — it only holds what the card already shows (ticker, %,
// period, path).

const SITE = 'https://jjanalysis.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATH_RE = /^\/[A-Za-z0-9/_-]*$/;

const CORS = { 'Access-Control-Allow-Origin': '*' };

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtPct(p) {
  const s = Math.abs(p).toFixed(2);
  return (p >= 0 ? '+' : '-') + s + '%';
}

function fmtDate(iso) { return iso ? iso.replace(/-/g, '.') : ''; }

export function buildPage(card, imageUrl, targetUrl, selfUrl) {
  const ko = card.lang !== 'en';
  const up = Number(card.pct) >= 0;
  const pct = fmtPct(Number(card.pct));
  const title = ko
    ? `${card.label} ${pct} ${up ? '수익' : '손실'} 중 ${up ? '📈' : '📉'}`
    : `${card.label} ${pct} ${up ? 'gain' : 'loss'} ${up ? '📈' : '📉'}`;
  const period = card.start_date && card.end_date
    ? `${fmtDate(card.start_date)} – ${fmtDate(card.end_date)}` : '';
  const desc = (ko ? 'jjanalysis.com 분석 기반' : 'Powered by jjanalysis.com analysis') +
    (period ? ' · ' + period : '');
  const t = esc(title), d = esc(desc), img = esc(imageUrl), to = esc(targetUrl), self = esc(selfUrl);
  return `<!doctype html>
<html lang="${ko ? 'ko' : 'en'}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t} | JJ Analysis</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${to}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="JJ Analysis">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${self}">
<meta property="og:image" content="${img}">
<meta property="og:image:secure_url" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${to}">
<style>body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}a{color:#58a6ff}</style>
</head><body>
<p><a href="${to}">jjanalysis.com →</a></p>
<script>location.replace(${JSON.stringify(targetUrl).replace(/</g, '\\u003c')});</script>
</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { ...CORS, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    const id = m && m[1].toLowerCase();
    if (!id || !UUID_RE.test(id)) return Response.redirect(SITE + '/', 302);

    const api = `${env.SUPABASE_URL}/rest/v1/share_cards?id=eq.${id}` +
      '&select=id,label,pct,start_date,end_date,path,lang';
    let card = null;
    try {
      const r = await fetch(api, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (r.ok) card = (await r.json())[0] || null;
    } catch (e) { /* fall through to redirect */ }
    if (!card) return Response.redirect(SITE + '/', 302);

    const path = PATH_RE.test(card.path || '') ? card.path : '/';
    const target = SITE + path + url.search;   // keep UTM tags from the post link
    const image = `${env.SUPABASE_URL}/storage/v1/object/public/share-cards/${id}.png`;
    const html = buildPage(card, image, target, url.origin + url.pathname);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  },
};
