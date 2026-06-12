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
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS trade_time TIME;
 * ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
 * ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
 * ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('buy','sell','buy_to_cover','sell_short','drip','dividend','interest','split','cash_deposit','cash_withdrawal'));
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

  // ── Transaction CRUD ──────────────────────────────────────────────────────
  async function getTransactions(symbol, portfolioId) {
    const { sb, user } = requireAuth();
    let query = sb
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('trade_date', { ascending: true });
    if (symbol) query = query.eq('symbol', symbol.toUpperCase());
    if (portfolioId) query = query.eq('portfolio_id', portfolioId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
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
    if (data.trade_time  !== undefined) fields.trade_time  = data.trade_time || null;
    if (data.notes       !== undefined) fields.notes       = data.notes || null;
    const { data: result, error } = await sb
      .from('transactions')
      .update(fields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return result;
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
  function computePnL(txns) {
    const buyTypes  = new Set(['buy', 'drip', 'buy_to_cover']);
    const sellTypes = new Set(['sell', 'sell_short']);
    const thisYear  = new Date().getFullYear().toString();

    let shares = 0;  // remaining shares
    let cost   = 0;  // total cost basis
    let realizedGain    = 0;
    let realizedGainYTD = 0;

    // Sort by date ascending
    const sorted = [...txns].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

    for (const t of sorted) {
      const sh  = Number(t.shares) || 0;
      const amt = Number(t.amount) || 0;

      if (t.type === 'split' && sh >= 2 && shares > 0) {
        // sh is always the split ratio (e.g. 20 for 20:1 AMZN split)
        // cost stays the same; shares multiply by ratio; avg cost divides
        shares *= sh;
        continue;
      }

      if (buyTypes.has(t.type)) {
        shares += sh;
        cost   += amt;
      } else if (sellTypes.has(t.type) && sh > 0) {
        const avgCostPerShare = shares > 0 ? cost / shares : 0;
        const saleProfit = amt - avgCostPerShare * sh;
        realizedGain += saleProfit;
        if (t.trade_date.startsWith(thisYear)) realizedGainYTD += saleProfit;
        cost   -= avgCostPerShare * sh;
        shares -= sh;
        if (shares < 0) shares = 0;
        if (cost   < 0) cost   = 0;
      }
    }

    const avgCost = shares > 0 ? cost / shares : 0;
    return { avgCost, remainingShares: shares, totalCost: cost, realizedGain, realizedGainYTD };
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
      if (s === 'drip') return 'drip';
      if (s === 'dividend' || s === 'div') return 'dividend';
      if (s === 'interest') return 'interest';
      if (s === 'split' || s === 'stock split') return 'split';
      if (s === 'cash_deposit' || s === 'deposit') return 'cash_deposit';
      if (s === 'cash_withdrawal' || s === 'withdrawal') return 'cash_withdrawal';
      return null;
    }

    function parseNum(str) {
      if (str == null) return null;
      const n = parseFloat(String(str).replace(/[,$\s]/g, ''));
      return isNaN(n) ? null : n;
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const f = parseLine(line).map(v => v.replace(/^"|"$/g, '').trim());

      const symbol = cols.symbol >= 0 ? f[cols.symbol]?.toUpperCase() : null;
      const trade_date = parseDate(cols.trade_date >= 0 ? f[cols.trade_date] : null);
      const trade_time = cols.trade_time >= 0 ? (f[cols.trade_time] || null) : null;
      const type = parseType(cols.type >= 0 ? f[cols.type] : null);
      const shares = parseNum(cols.shares >= 0 ? f[cols.shares] : null);
      const price  = parseNum(cols.price  >= 0 ? f[cols.price]  : null);
      let   amount = parseNum(cols.amount >= 0 ? f[cols.amount] : null);
      const commission = parseNum(cols.commission >= 0 ? f[cols.commission] : null);
      const notes  = cols.notes >= 0 ? (f[cols.notes] || null) : null;
      const portfolio_name = cols.portfolio >= 0 ? (f[cols.portfolio] || null) : null;

      // Auto-compute amount if missing (MSP has no amount column — shares × price)
      if (amount == null && shares != null && price != null) amount = shares * price;

      if (!trade_date || !type || amount == null) continue;  // skip invalid rows

      rows.push({ symbol, trade_date, trade_time, type, shares, price, amount, commission, notes, portfolio_name });
    }

    return { rows, format };
  }

  // ── Import transactions to Supabase ───────────────────────────────────────
  // nameToId: optional map of { csvPortfolioName → existing_portfolio_id | 'new' }
  //   'new'  → create a new portfolio with that name
  //   uuid   → use the existing portfolio
  //   absent → null (no portfolio assigned)
  async function importTransactions(rows, portfolioId, nameToId) {
    const { sb, user } = requireAuth();
    if (!rows || rows.length === 0) return { imported: 0, errors: [] };

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

    const toInsert = rows.map(r => ({
      user_id:      user.id,
      portfolio_id: portfolioId || (r.portfolio_name ? (resolvedMap[r.portfolio_name] ?? null) : null),
      symbol:       (r.symbol || '').toUpperCase(),
      trade_date:   r.trade_date,
      type:         r.type,
      shares:       r.shares != null ? Number(r.shares) : null,
      price:        r.price  != null ? Number(r.price)  : null,
      amount:       Number(r.amount),
      commission:   r.commission != null ? Number(r.commission) : 0,
      notes:        r.notes || null,
      source:       'import',
    }));

    // Batch insert (Supabase handles up to ~1000 rows)
    const { data, error } = await sb
      .from('transactions')
      .insert(toInsert)
      .select();

    if (error) throw error;
    return { imported: (data || []).length, errors: [] };
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
