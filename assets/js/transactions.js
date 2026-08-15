/**
 * transactions.js — Trade/transaction tracking module
 * Requires: window._jjSb (Supabase client), window._jjUser (current user)
 *
 * ── Supabase SQL (run once in Supabase SQL Editor) ────────────────────────────
 *
 * -- portfolios: one user can have multiple named portfolios
 * CREATE TABLE portfolios (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   name TEXT NOT NULL DEFAULT 'Default',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "own" ON portfolios USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
 *
 * -- transactions
 * CREATE TABLE transactions (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
 *   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   symbol TEXT NOT NULL,
 *   trade_date DATE NOT NULL,
 *   type TEXT NOT NULL CHECK (type IN ('buy','sell','buy_to_cover','sell_short','drip','dividend','interest','split','cash_deposit','cash_withdrawal')),
 *   shares NUMERIC,
 *   price NUMERIC,
 *   amount NUMERIC NOT NULL,
 *   commission NUMERIC DEFAULT 0,
 *   lot_method TEXT, -- which lot(s) a SELL draws down: 'FIFO'|'LIFO'|'HIGH_COST'|'LOW_COST'; NULL = FIFO default
 *   external_id TEXT, -- source system's own row id (e.g. MSP's "Id" column) — lets
 *                      -- dedup tell apart two genuinely distinct trades at the same
 *                      -- date/time/price/size instead of relying on those fields alone
 *   trade_time TIME,
 *   linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
 *   notes TEXT,
 *   source TEXT DEFAULT 'manual',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "own" ON transactions USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
 *
 * ── Migration SQL (if table already exists) ───────────────────────────────────
 *
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0;
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS lot_method TEXT;
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS trade_time TIME;
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
 * ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
 * ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('buy','sell','buy_to_cover','sell_short','drip','dividend','interest','split','cash_deposit','cash_withdrawal'));
 *
 * -- Per-portfolio principal-basis overrides (for accounts like a 401k that
 * -- was later rolled into a Traditional IRA, where the raw buy/sell history
 * -- no longer reflects what was actually "invested" by the user):
 * --   zero_principal_from_year: treat all buy amounts from this year onward
 * --     as $0 invested (rollover-in shares aren't new principal).
 * --   manual_principal: if set, overrides the *all-time total* invested
 * --     figure used by the Coach tab entirely, for cases where the true
 * --     principal can't be derived from transaction history at all and
 * --     the user enters it by hand (e.g. "as of 1/15/2024 this was ~$170K").
 * --   manual_principal_as_of: the date the manual_principal figure is as of
 * --     (informational, shown next to the override in the UI).
 * ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS zero_principal_from_year INTEGER;
 * ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS manual_principal NUMERIC;
 * ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS manual_principal_as_of DATE;
 *
 * -- Per-transaction principal override (거래내역 tab — mark a specific BUY as
 * -- counting, or not counting, toward invested principal). NULL means "no
 * -- override, fall back to the portfolio's zero_principal_from_year rule";
 * -- TRUE/FALSE explicitly force the transaction in/out regardless of that
 * -- rule. Takes priority over zero_principal_from_year when set.
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS count_as_principal BOOLEAN;
 *
 * -- Principal overrides, persisted independently of the transaction row
 * -- (keyed by content signature, not transaction id) so that deleting and
 * -- re-importing the same CSV data automatically restores the override —
 * -- re-imported rows get brand-new ids, but their signature is unchanged.
 * CREATE TABLE IF NOT EXISTS public.principal_overrides (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   signature TEXT NOT NULL,
 *   count_as_principal BOOLEAN NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   UNIQUE (user_id, signature)
 * );
 * ALTER TABLE public.principal_overrides ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "own" ON public.principal_overrides USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getSb() { return window._jjSb || null; }
  function getUser() { return window._jjUser || null; }

  function requireAuth() {
    const sb = getSb();
    const user = getUser();
    if (!sb || !user) throw new Error('Not authenticated');
    return { sb, user };
  }

  // ── Portfolio CRUD ────────────────────────────────────────────────────────
  async function getPortfolios() {
    const { sb, user } = requireAuth();
    const { data, error } = await sb
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createPortfolio(name) {
    const { sb, user } = requireAuth();
    const { data, error } = await sb
      .from('portfolios')
      .insert({ user_id: user.id, name: name.trim() || 'Default' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ── Portfolio principal-basis overrides ─────────────────────────────────
  // Used by the Coach tab when an account's raw buy/sell history doesn't
  // reflect actual principal invested (e.g. a 401k rolled into a
  // Traditional IRA — rollover-in "buys" aren't new money).
  //
  // settings: {
  //   zero_principal_from_year?: number | null,
  //   manual_principal?: number | null,
  //   manual_principal_as_of?: string | null,  // 'YYYY-MM-DD'
  // }
  // Pass null for a field to clear that override.
  async function updatePortfolioSettings(portfolioId, settings) {
    const { sb, user } = requireAuth();
    const fields = {};
    if ('zero_principal_from_year' in settings) fields.zero_principal_from_year = settings.zero_principal_from_year || null;
    if ('manual_principal' in settings) fields.manual_principal = settings.manual_principal != null ? Number(settings.manual_principal) : null;
    if ('manual_principal_as_of' in settings) fields.manual_principal_as_of = settings.manual_principal_as_of || null;
    const { data, error } = await sb
      .from('portfolios')
      .update(fields)
      .eq('id', portfolioId)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ── Transaction CRUD ──────────────────────────────────────────────────────
  async function getTransactions(symbol, portfolioId) {
    const { sb, user } = requireAuth();
    let query = sb
      .from('transactions')
      .select('*, portfolios(name)')
      .eq('user_id', user.id)
      .order('trade_date', { ascending: true })
      .limit(50000);
    if (symbol) query = query.eq('symbol', symbol.toUpperCase());
    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    const { data, error } = await query;
    if (error) throw error;
    // Flatten portfolio name for convenience
    return (data || []).map(t => ({ ...t, portfolio_name: t.portfolios?.name || null }));
  }

  async function addTransaction(data) {
    const { sb, user } = requireAuth();
    const row = {
      user_id:      user.id,
      portfolio_id: data.portfolio_id || null,
      symbol:       (data.symbol || '').toUpperCase(),
      trade_date:   data.trade_date,
      type:         data.type,
      shares:       data.shares != null ? Number(data.shares) : null,
      price:        data.price  != null ? Number(data.price)  : null,
      amount:       Number(data.amount),
      commission:   data.commission != null ? Number(data.commission) : 0,
      lot_method:   data.lot_method || null,
      trade_time:   data.trade_time || null,
      linked_transaction_id: data.linked_transaction_id || null,
      notes:        data.notes || null,
      source:       data.source || 'manual',
    };
    const { data: result, error } = await sb
      .from('transactions')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return result;
  }

  async function updateTransaction(id, data) {
    const { sb, user } = requireAuth();
    const fields = {};
    if (data.trade_date  !== undefined) fields.trade_date  = data.trade_date;
    if (data.type        !== undefined) fields.type        = data.type;
    if (data.shares      !== undefined) fields.shares      = data.shares != null ? Number(data.shares) : null;
    if (data.price       !== undefined) fields.price       = data.price  != null ? Number(data.price)  : null;
    if (data.amount      !== undefined) fields.amount      = Number(data.amount);
    if (data.commission  !== undefined) fields.commission  = data.commission != null ? Number(data.commission) : 0;
    if (data.lot_method  !== undefined) fields.lot_method  = data.lot_method || null;
    if (data.trade_time  !== undefined) fields.trade_time  = data.trade_time || null;
    if (data.notes       !== undefined) fields.notes       = data.notes || null;
    if (data.count_as_principal !== undefined) fields.count_as_principal = data.count_as_principal;
    const { data: result, error } = await sb
      .from('transactions')
      .update(fields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    // Persist the override by content signature too, so it survives a
    // future delete + re-import of this same transaction data.
    if (data.count_as_principal !== undefined) {
      await _setPrincipalOverride(_txnSignature(result), data.count_as_principal);
    }
    return result;
  }

  // ── Principal overrides persisted by content signature ─────────────────
  // (see updateTransaction and importTransactions for read/write sites)
  async function _setPrincipalOverride(signature, value) {
    const { sb, user } = requireAuth();
    if (value == null) {
      await sb.from('principal_overrides').delete()
        .eq('user_id', user.id).eq('signature', signature);
    } else {
      await sb.from('principal_overrides').upsert(
        { user_id: user.id, signature, count_as_principal: value },
        { onConflict: 'user_id,signature' }
      );
    }
  }

  async function _getPrincipalOverrides(signatures) {
    const { sb, user } = requireAuth();
    const map = new Map();
    if (!signatures.length) return map;
    const CHUNK = 500;
    for (let i = 0; i < signatures.length; i += CHUNK) {
      const chunk = signatures.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from('principal_overrides')
        .select('signature, count_as_principal')
        .eq('user_id', user.id)
        .in('signature', chunk);
      // Table may not exist yet if the migration SQL hasn't been run —
      // degrade to "no overrides" rather than failing the whole import.
      if (error) return map;
      for (const row of (data || [])) map.set(row.signature, row.count_as_principal);
    }
    return map;
  }

  async function deleteTransaction(id) {
    const { sb, user } = requireAuth();

    // Check for linked cash transaction
    const { data: linked, error: linkErr } = await sb
      .from('transactions')
      .select('id, type, amount')
      .eq('linked_transaction_id', id)
      .eq('user_id', user.id);
    if (linkErr) throw linkErr;

    if (linked && linked.length > 0) {
      const linkedDesc = linked.map(l => `${l.type} $${Number(l.amount).toFixed(2)}`).join(', ');
      const ok = confirm(`This will also delete the linked cash transaction(s): ${linkedDesc}. Continue?`);
      if (!ok) return;
      for (const l of linked) {
        const { error: delErr } = await sb
          .from('transactions')
          .delete()
          .eq('id', l.id)
          .eq('user_id', user.id);
        if (delErr) throw delErr;
      }
    }

    const { error } = await sb
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
  }

  // ── P&L computation helper ────────────────────────────────────────────────
  // Returns { avgCost, remainingShares, totalCost, realizedGain, realizedGainYTD }
  // for a sorted array of transactions (buy/sell/drip/split/buy_to_cover/sell_short)
  //
  // Tracks individual purchase lots rather than one blended average cost, so
  // that a sell's own lot_method ('FIFO'|'LIFO'|'HIGH_COST'|'LOW_COST', NULL
  // defaults to FIFO) determines which shares it's actually selling — matching
  // how MSP (and most brokerages) let you pick a cost-basis method per sale.
  // avgCost/totalCost in the return value are still the blended weighted
  // average across whatever lots remain, for display purposes only.
  function computePnL(txns) {
    const buyTypes  = new Set(['buy', 'drip', 'buy_to_cover']);
    const sellTypes = new Set(['sell', 'sell_short']);
    const thisYear  = new Date().getFullYear().toString();
    const EPS = 1e-9;

    let lots = []; // { shares, costPerShare } — insertion order = chronological (FIFO) order
    let realizedGain    = 0;
    let realizedGainYTD = 0;

    // ── De-duplicate ─────────────────────────────────────────────────────
    // Re-importing the same CSV (or the "always re-attach split rows on
    // import" behavior in importSubmit) can create exact duplicate rows.
    // This keeps computePnL correct even if dedup at import time was
    // bypassed (e.g. rows added before the import-time dedup existed).
    // Prefers external_id (source system's own row id, e.g. MSP's "Id"
    // column) when present — exact, and immune to two genuinely distinct
    // trades sharing date+time+price+size (MSP only timestamps to the
    // minute, so this happens for real on an active trading day; a key
    // without external_id wrongly collapsed real BTC-USD trades during
    // this fix's own QA). Falls back to date+time+type+shares+price+amount
    // when external_id isn't available.
    const seen = new Set();
    const deduped = [];
    for (const t of txns) {
      const key = t.external_id
        ? ['ext', t.portfolio_id || '', (t.symbol || '').toUpperCase(), t.type, t.external_id].join('|')
        : [t.portfolio_id || '', t.trade_date, t.trade_time || '', t.type,
            Number(t.shares) || 0, Number(t.price) || 0, Number(t.amount) || 0
          ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(t);
    }

    // ── Sort ─────────────────────────────────────────────────────────────
    // Stable sort by date; within the same date, process splits BEFORE
    // buys/sells so a same-day split correctly multiplies shares bought
    // earlier that day rather than being skipped or mis-ordered.
    const typeRank = t => t.type === 'split' ? 0 : ['buy','drip','buy_to_cover'].includes(t.type) ? 1 : 2;
    const sorted = deduped
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const dateCmp = a.t.trade_date.localeCompare(b.t.trade_date);
        if (dateCmp !== 0) return dateCmp;
        const rankCmp = typeRank(a.t) - typeRank(b.t);
        if (rankCmp !== 0) return rankCmp;
        return a.i - b.i;
      })
      .map(x => x.t);

    for (const t of sorted) {
      const sh   = Number(t.shares) || 0;
      const amt  = Number(t.amount) || 0;
      const comm = Number(t.commission) || 0;

      if (t.type === 'split') {
        // Determine split ratio. Support three common recording formats:
        //   1. shares = ratio (e.g. 20 for a 20:1 split) → multiply
        //   2. shares = additional shares received → add
        //   3. price field holds ratio when shares is missing/zero
        // Heuristic: if shares looks like a small integer ratio (≤ 100),
        // treat it as a multiplier; otherwise treat as additional shares.
        const totalShares = lots.reduce((s, l) => s + l.shares, 0);
        let ratio = Number(t.price) >= 2 ? Number(t.price) : 0; // fallback: ratio in price
        if (sh >= 2 && sh <= 100) {
          ratio = sh; // likely a ratio (2:1, 3:1, 4:1, 5:1, 10:1, 20:1, etc.)
        } else if (sh > 100) {
          // Likely additional shares received (MSP "delta" format) —
          // express as an equivalent ratio so every lot dilutes proportionally,
          // preserving each lot's total cost (only its per-share cost drops).
          ratio = totalShares > 0 ? (totalShares + sh) / totalShares : 0;
        }
        if (ratio >= 2 && totalShares > 0) {
          for (const lot of lots) lot.shares *= ratio;
        }
        // else: no usable split info — skip silently (no change)
        continue;
      }

      if (t.type === 'dividend' || t.type === 'interest') {
        // Cash income only — no shares added.
        // (Share reinvestment = 'drip', handled in buyTypes below.)
        if (amt > 0) {
          realizedGain += amt;
          if (t.trade_date.startsWith(thisYear)) realizedGainYTD += amt;
        }
        continue;
      }

      if (buyTypes.has(t.type) && sh > 0) {
        // DRIP adds shares but not cost basis (dividend income already
        // counted above), so its lot carries $0 cost — matches prior
        // aggregate-average behavior exactly.
        const lotCost = t.type !== 'drip' ? amt + comm : 0; // commission is part of what you paid
        lots.push({ shares: sh, costPerShare: lotCost / sh });
      } else if (sellTypes.has(t.type) && sh > 0) {
        const totalShares = lots.reduce((s, l) => s + l.shares, 0);
        // Cap shares sold at what's actually on hand — a sell that exceeds
        // recorded holdings (often itself a symptom of a missed split)
        // should not be allowed to drag holdings negative while still
        // computing realized gain on the full (wrong) sale size.
        let remaining = Math.min(sh, totalShares);

        const method = String(t.lot_method || 'FIFO').toUpperCase();
        let order;
        if (method === 'LIFO') order = [...lots].reverse();
        else if (method === 'HIGH_COST') order = [...lots].sort((a, b) => b.costPerShare - a.costPerShare);
        else if (method === 'LOW_COST') order = [...lots].sort((a, b) => a.costPerShare - b.costPerShare);
        else order = lots; // FIFO — lots array is already in chronological (insertion) order

        let costOfSold = 0;
        for (const lot of order) {
          if (remaining <= EPS) break;
          if (lot.shares <= EPS) continue;
          const take = Math.min(lot.shares, remaining);
          costOfSold += take * lot.costPerShare;
          lot.shares -= take;
          remaining -= take;
        }
        lots = lots.filter(l => l.shares > EPS);

        const saleProfit = (amt - comm) - costOfSold; // commission reduces net sale proceeds
        realizedGain += saleProfit;
        if (t.trade_date.startsWith(thisYear)) realizedGainYTD += saleProfit;
      }
    }

    const remainingShares = lots.reduce((s, l) => s + l.shares, 0);
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShare, 0);
    const avgCost = remainingShares > 0 ? totalCost / remainingShares : 0;
    return { avgCost, remainingShares, totalCost, realizedGain, realizedGainYTD };
  }

  // ── MSP CSV Parser ────────────────────────────────────────────────────────
  // Handles: My Stocks Portfolio app export + generic CSV
  // Case-insensitive header matching. Flexible date formats: MM/DD/YYYY, YYYY-MM-DD
  function parseMspCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { rows: [], format: 'unknown' };

    // Parse CSV line respecting quoted fields
    function parseLine(line) {
      const fields = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
        else { cur += c; }
      }
      fields.push(cur.trim());
      return fields;
    }

    const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').toLowerCase().trim());

    // Map header aliases → canonical field names
    const fieldMap = {
      symbol:     ['symbol', 'ticker', 'stock'],
      trade_date: ['date', 'trade date', 'transaction date', 'tradedate'],
      trade_time: ['transaction time', 'trade time', 'time'],
      type:       ['type', 'action', 'transaction', 'buy/sell'],
      shares:     ['shares owned', 'shares', 'quantity', 'qty', 'units'],
      price:      ['cost per share', 'price', 'unit price', 'cost price', 'avg price'],
      amount:     ['amount', 'total', 'total amount', 'value'],
      commission: ['commission', 'fee', 'fees'],
      accounting: ['accounting', 'accounting method', 'cost basis method', 'lot method', 'lot_method'],
      external_id: ['id', 'transaction id', 'txn id', 'external id', 'external_id'],
      notes:      ['notes', 'note', 'memo', 'comment', 'comments'],
      portfolio:  ['portfolio', 'account', 'portfolio name'],
    };

    function findCol(key) {
      for (const alias of fieldMap[key]) {
        const idx = headers.indexOf(alias);
        if (idx >= 0) return idx;
      }
      // Partial match
      for (const alias of fieldMap[key]) {
        const idx = headers.findIndex(h => h.includes(alias));
        if (idx >= 0) return idx;
      }
      return -1;
    }

    const cols = {};
    for (const key of Object.keys(fieldMap)) cols[key] = findCol(key);

    // Detect format
    const hasMspFields = cols.symbol >= 0 && cols.trade_date >= 0 && cols.type >= 0;
    const format = hasMspFields ? 'MSP' : 'Generic CSV';

    function parseDate(str) {
      if (!str) return null;
      str = str.trim();
      // YYYY-MM-DD (possibly followed by time/timezone like "2021-01-31 GMT-0800")
      const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
      // MM/DD/YYYY
      const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`;
      // M/D/YY
      const m3 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
      if (m3) {
        const yr = parseInt(m3[3]) + (parseInt(m3[3]) >= 50 ? 1900 : 2000);
        return `${yr}-${m3[1].padStart(2,'0')}-${m3[2].padStart(2,'0')}`;
      }
      return null;
    }

    function parseType(str) {
      if (!str) return null;
      const s = str.trim().toLowerCase();
      if (s === 'buy' || s === 'b' || s === 'bought') return 'buy';
      if (s === 'sell' || s === 's' || s === 'sold') return 'sell';
      if (s === 'buy_to_cover' || s === 'buy to cover') return 'buy_to_cover';
      if (s === 'sell_short' || s === 'sell short' || s === 'short') return 'sell_short';
      if (s === 'drip' || s === 'dividend reinvest' || s === 'reinvest' || s.includes('reinvest')) return 'drip';
      if (s === 'dividend' || s === 'div') return 'dividend';
      if (s === 'interest') return 'interest';
      if (s === 'split' || s === 'stock split') return 'split';
      if (s === 'cash_deposit' || s === 'deposit') return 'cash_deposit';
      if (s === 'cash_withdrawal' || s === 'withdrawal') return 'cash_withdrawal';
      // MSP "Sell All" / "Close Position": liquidates the entire remaining
      // position but the CSV row itself carries no share quantity (Shares
      // Owned = 0, i.e. the post-trade balance). Flag it so the row loop
      // below can fill in shares/amount from the running position size.
      if (s === 'sell all' || s === 'sell_all' || s === 'close position' || s === 'closed position' || s === 'close all') return 'sell_all';
      return null;
    }

    function parseNum(str) {
      if (str == null) return null;
      const n = parseFloat(String(str).replace(/[,$\s]/g, ''));
      return isNaN(n) ? null : n;
    }

    function normalizeLotMethod(str) {
      if (!str) return null;
      const s = String(str).trim().toLowerCase();
      if (s === 'fifo') return 'FIFO';
      if (s === 'lifo') return 'LIFO';
      if (s === 'high cost' || s === 'highcost' || s === 'high_cost') return 'HIGH_COST';
      if (s === 'low cost'  || s === 'lowcost'  || s === 'low_cost')  return 'LOW_COST';
      return null; // unrecognized (e.g. MSP blank) — computePnL defaults to FIFO
    }

    const rows = [];
    // Running position size per symbol+portfolio, tracked as rows are parsed
    // in file order — used to fill in the quantity for "Sell All" rows,
    // which MSP exports with no share count (see parseType above).
    const runningShares = new Map();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const f = parseLine(line).map(v => v.replace(/^"|"$/g, '').trim());

      const symbol = cols.symbol >= 0 ? f[cols.symbol]?.toUpperCase() : null;
      const trade_date = parseDate(cols.trade_date >= 0 ? f[cols.trade_date] : null);
      const trade_time = cols.trade_time >= 0 ? (f[cols.trade_time] || null) : null;
      let   type = parseType(cols.type >= 0 ? f[cols.type] : null);
      let   shares = parseNum(cols.shares >= 0 ? f[cols.shares] : null);
      const price  = parseNum(cols.price  >= 0 ? f[cols.price]  : null);
      let   amount = parseNum(cols.amount >= 0 ? f[cols.amount] : null);
      const commission = parseNum(cols.commission >= 0 ? f[cols.commission] : null);
      const lot_method = normalizeLotMethod(cols.accounting >= 0 ? f[cols.accounting] : null);
      const external_id = cols.external_id >= 0 ? (f[cols.external_id] || null) : null;
      const notes  = cols.notes >= 0 ? (f[cols.notes] || null) : null;
      const portfolio_name = cols.portfolio >= 0 ? (f[cols.portfolio] || null) : null;
      const shareKey = `${symbol || ''}|${portfolio_name || ''}`;

      // "Sell All": MSP doesn't record the quantity liquidated, so use the
      // running position size accumulated from earlier rows for this
      // symbol+portfolio. Requires the CSV to list that symbol's history
      // in chronological order (true for MSP's full-history export).
      if (type === 'sell_all') {
        const held = Math.abs(runningShares.get(shareKey) || 0);
        type = 'sell';
        shares = held;
        amount = held > 0 && price != null ? held * price : 0;
      }

      // MSP: dividend/interest rows store the cash value in the shares column;
      // price may be filled with the stock price (irrelevant for cash income).
      // Must run BEFORE the shares×price auto-compute below.
      if ((type === 'dividend' || type === 'interest') && shares != null && shares !== 0 && (amount == null || amount === 0)) {
        rows.push({ symbol, trade_date, trade_time, type, shares: null, price: null, amount: shares, commission, external_id, notes, portfolio_name });
        continue;
      }

      // Auto-compute amount if missing (MSP has no amount column — shares × price)
      if (amount == null && shares != null && price != null) amount = shares * price;

      // USD=CASH: price column is a 0/1 flag (0=linked to stock trade, 1=pure cash),
      // not a real price — the shares column holds the actual dollar amount.
      if (symbol === 'USD=CASH' && shares != null) amount = Math.abs(Number(shares));

      // ── MSP special: USD=CASH rows with crypto/dividend notes ──────────────
      if (symbol === 'USD=CASH' && notes && trade_date) {
        // BTC-USD cash flows: a MSP "USD=CASH" row noting "Purchased/Sold
        // BTC-USD" only tells us the DOLLAR AMOUNT that moved — it carries
        // no share count or execution price for the BTC-USD leg at all.
        // A previous version of this code synthesized a BTC-USD buy/sell
        // row here anyway, with shares/price left null — which corrupted
        // every downstream cost-basis calculation (computePnL, and the
        // portfolio-analysis tab's own replay both do `cost += amount`
        // unconditionally on a buy, but `shares += shares` only adds
        // real share counts; with shares stuck at null→0 forever, cost
        // basis inflates with zero shares behind it, and avgCost balloons
        // — this is exactly what caused BTC-USD's average cost to show
        // ~$122K against the ~$64K the source portfolio tracker reports).
        // Fixed by NOT fabricating a symbol-level transaction from a cash
        // note that structurally cannot contain the data needed for one —
        // only the (legitimate, complete) USD=CASH cash-ledger entry below
        // gets imported. A real BTC-USD position needs importing the
        // actual BTC-USD-tagged rows from MSP (which do carry real shares/
        // price/cost-basis-method whenever MSP exports them under a
        // symbol row rather than folded into the cash ledger).
        // (Falls through to the generic USD=CASH handling below regardless
        // of whether the note mentions BTC-USD — the cash movement itself
        // is still valid and worth importing, just not as a synthesized
        // crypto trade.)
        //
        // Dividends: a USD=CASH row noting "Dividends from XXXX - ..." is
        // NOT a standalone income event to synthesize a symbol-level
        // 'dividend' row from — MSP already exports a direct
        // Symbol=XXXX/Type=Dividend row for the same payment (verified
        // across every dividend-note symbol in a real export: SGOV, META,
        // AVGO, ORCL, UNH, AAPL, GOOGL, SPY, QQQ, and others all had a
        // matching direct row). Synthesizing a second 'dividend' row here
        // double-counted every dividend-paying symbol's realized gain
        // (e.g. SGOV showed +$1,117.50 instead of the correct +$550.77 —
        // almost exactly double). Just import the cash-ledger entry as-is;
        // the real income is already captured via the direct-symbol row.
        // Generic USD=CASH (stock proceeds, purchases, deposits, withdrawals, interest) — import as-is
      }

      if (!trade_date || !type) continue;
      // Split transactions don't carry a dollar amount — default to 0
      if (amount == null && type === 'split') amount = 0;
      if (amount == null) continue;

      // Keep the running position tally current for "Sell All" lookups
      // further down the file (same heuristics as computePnL's split handling).
      if (type === 'buy' || type === 'drip' || type === 'buy_to_cover') {
        runningShares.set(shareKey, (runningShares.get(shareKey) || 0) + (shares || 0));
      } else if (type === 'sell' || type === 'sell_short') {
        runningShares.set(shareKey, (runningShares.get(shareKey) || 0) - (shares || 0));
      } else if (type === 'split') {
        const sh = shares || 0;
        const cur = runningShares.get(shareKey) || 0;
        if (sh >= 2 && sh <= 100) runningShares.set(shareKey, cur * sh);
        else if (sh > 100) runningShares.set(shareKey, cur + sh);
      }

      rows.push({ symbol, trade_date, trade_time, type, shares, price, amount, commission, lot_method, external_id, notes, portfolio_name });
    }

    return { rows, format };
  }

  // ── Import transactions to Supabase ───────────────────────────────────────
  // nameToId: optional map of { csvPortfolioName → existing_portfolio_id | 'new' }
  //   'new'  → create a new portfolio with that name
  //   uuid   → use the existing portfolio
  //   absent → null (no portfolio assigned)
  //
  // Duplicate rows (same date+symbol+type+shares+price+amount as a row
  // already in the DB for this user) are skipped automatically so that
  // re-importing an updated/overlapping CSV export doesn't double-count
  // trades. Returns { imported, skipped, errors }.
  async function importTransactions(rows, portfolioId, nameToId, options = {}) {
    const { sb, user } = requireAuth();
    if (!rows || rows.length === 0) return { imported: 0, skipped: 0, errors: [] };
    const skipDedup = options.skipDedup === true;

    // Resolve 'new' entries: create portfolios for any nameToId value === 'new'
    const resolvedMap = { ...(nameToId || {}) };
    for (const [csvName, val] of Object.entries(resolvedMap)) {
      if (val === 'new') {
        const { data: created, error } = await sb
          .from('portfolios')
          .insert({ user_id: user.id, name: csvName })
          .select()
          .single();
        if (!error && created) resolvedMap[csvName] = created.id;
        else delete resolvedMap[csvName];
      }
    }

    // ── Build signature set of existing transactions ──────────────────────
    const existingSigs = new Set();
    if (!skipDedup) {
      const importSymbols = [...new Set(rows.map(r => (r.symbol || '').toUpperCase()).filter(Boolean))];
      if (importSymbols.length) {
        const { data: existing, error: exErr } = await sb
          .from('transactions')
          .select('portfolio_id, symbol, trade_date, trade_time, type, shares, price, amount, external_id')
          .eq('user_id', user.id)
          .in('symbol', importSymbols);
        if (exErr) throw exErr;
        for (const e of (existing || [])) {
          existingSigs.add(_txnSignature(e));
        }
      }
    }

    // ── Filter out rows that duplicate an existing transaction ────────────
    let skipped = 0;
    const skippedRows = [];
    const seenInBatch = new Set();
    const newRows = [];
    for (const r of rows) {
      const resolvedPortfolioId =
        (r.portfolio_name != null && resolvedMap[r.portfolio_name] != null)
          ? resolvedMap[r.portfolio_name]
          : (portfolioId || null);
      const rWithPort = { ...r, portfolio_id: resolvedPortfolioId };
      const sig = _txnSignature(rWithPort);
      if (!skipDedup && (existingSigs.has(sig) || seenInBatch.has(sig))) {
        skipped++;
        skippedRows.push({ ...r, _reason: existingSigs.has(sig) ? 'db' : 'csv' });
        continue;
      }
      seenInBatch.add(sig);
      newRows.push({ ...r, _sig: sig });
    }

    if (newRows.length === 0) return { imported: 0, skipped, skippedRows, errors: [] };

    // Restore any principal override previously set (via the 거래내역 tab)
    // on a transaction with this same content signature — covers the
    // delete-then-re-import case, since the old row's override would
    // otherwise be lost when its id disappears.
    const overrideMap = await _getPrincipalOverrides(newRows.map(r => r._sig));

    const toInsert = newRows.map(r => ({
      user_id:      user.id,
      portfolio_id: portfolioId || (r.portfolio_name ? (resolvedMap[r.portfolio_name] ?? null) : null),
      symbol:       (r.symbol || '').toUpperCase(),
      trade_date:   r.trade_date,
      trade_time:   r.trade_time || null,
      type:         r.type,
      shares:       r.shares != null ? Number(r.shares) : null,
      price:        r.price  != null ? Number(r.price)  : null,
      amount:       Number(r.amount),
      commission:   r.commission != null ? Number(r.commission) : 0,
      lot_method:   r.lot_method || null,
      external_id:  r.external_id || null,
      notes:        r.notes || null,
      source:       'import',
      count_as_principal: overrideMap.has(r._sig) ? overrideMap.get(r._sig) : null,
    }));

    // Batch insert (Supabase handles up to ~1000 rows)
    const { data, error } = await sb
      .from('transactions')
      .insert(toInsert)
      .select();

    if (error) throw error;
return { imported: (data || []).length, skipped, skippedRows, errors: [] };
  }

  // Build a stable signature for duplicate detection. Prefers the source
  // system's own row id (external_id, e.g. MSP's "Id" column) when present —
  // exact and immune to two genuinely distinct trades sharing the same
  // date/time/price/size (MSP only timestamps to the minute, so this happens
  // for real on an active trading day). Falls back to date+symbol+type+
  // shares+price+amount otherwise. Numbers are rounded to 7 decimal places
  // to avoid float-precision mismatches (e.g. 501.25 vs 501.2500031 were
  // incorrectly collapsing with the old 4-decimal rounding).
  function _txnSignature(r) {
    const round = n => {
      const v = Number(n);
      return isNaN(v) ? 0 : Math.round(v * 1e7) / 1e7;
    };
    if (r.external_id) {
      // Combined with symbol+type (not external_id alone) since one source
      // row can fan out into multiple DB rows (e.g. a dividend note becomes
      // both a 'dividend' row and a linked USD=CASH 'buy' row) that must
      // stay distinguishable from each other despite sharing an external_id.
      return ['ext', (r.portfolio_id || ''), (r.symbol || '').toUpperCase(), r.type, r.external_id].join('|');
    }
    return [
      (r.portfolio_id || ''),
      (r.symbol || '').toUpperCase(),
      r.trade_date,
      (r.trade_time || ''),
      r.type,
      round(r.shares),
      round(r.price),
      round(r.amount),
    ].join('|');
  }

  // ── Batch delete by ID list ───────────────────────────────────────────────
  // Single Supabase call instead of N calls — critical for large selections
  async function deleteTransactions(ids) {
    const { sb, user } = requireAuth();
    if (!ids || !ids.length) return 0;
    // Supabase IN filter: split into chunks of 500 to stay within URL length limits
    const CHUNK = 500;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from('transactions')
        .delete()
        .in('id', chunk)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      deleted += (data || []).length;
    }
    return deleted;
  }

  // ── Delete ALL transactions matching portfolio/symbol filter ──────────────
  async function deleteAllTransactions(portfolioId, symbol) {
    const { sb, user } = requireAuth();
    let query = sb.from('transactions').delete().eq('user_id', user.id);
    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    if (symbol)      query = query.eq('symbol', symbol.toUpperCase());
    const { data, error } = await query.select('id');
    if (error) throw error;
    return (data || []).length;
  }

  // ── Delete a portfolio ───────────────────────────────────────────────────
  async function deletePortfolio(portfolioId) {
    const { sb, user } = requireAuth();
    const { error } = await sb.from('portfolios').delete()
      .eq('id', portfolioId).eq('user_id', user.id);
    if (error) throw error;
  }

  // ── Load chart transactions ───────────────────────────────────────────────
  // Called after chart data is ready; populates window.chartTxns then redraws overlay
  async function loadChartTransactions(symbol) {
    if (!getUser() || !getSb()) return;
    try {
      const txns = await getTransactions(symbol, null);
      window.chartTxns = txns;
      if (window.chart && window.updateOverlay) {
        window.updateOverlay(window.chart);   // stock charts
      }
      if (window._tpRedrawCallback) {
        window._tpRedrawCallback();           // crypto charts
      }
    } catch (e) {
      console.warn('[transactions] loadChartTransactions error:', e.message);
    }
  }

  // ── Expose API ────────────────────────────────────────────────────────────
  window.chartTxns = [];

  window.txns = {
    getPortfolios,
    createPortfolio,
    updatePortfolioSettings,
    getTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    deleteTransactions,
    deleteAllTransactions,
    deletePortfolio,
    computePnL,
    parseMspCsv,
    importTransactions,
    loadChartTransactions,
  };

})();
