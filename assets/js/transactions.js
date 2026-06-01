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
 *   type TEXT NOT NULL CHECK (type IN ('buy','sell')),
 *   shares NUMERIC,
 *   price NUMERIC,
 *   amount NUMERIC NOT NULL,
 *   notes TEXT,
 *   source TEXT DEFAULT 'manual',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "own" ON transactions USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
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
      type:         data.type,        // 'buy' | 'sell'
      shares:       data.shares != null ? Number(data.shares) : null,
      price:        data.price  != null ? Number(data.price)  : null,
      amount:       Number(data.amount),
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

  async function deleteTransaction(id) {
    const { sb, user } = requireAuth();
    const { error } = await sb
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;
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
      type:       ['type', 'action', 'transaction', 'buy/sell'],
      shares:     ['shares', 'quantity', 'qty', 'units'],
      price:      ['price', 'unit price', 'cost price', 'avg price'],
      amount:     ['amount', 'total', 'total amount', 'value', 'cost'],
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
      // MM/DD/YYYY
      const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`;
      // YYYY-MM-DD
      const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) return str;
      // M/D/YY or M/D/YYYY
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
      const type = parseType(cols.type >= 0 ? f[cols.type] : null);
      const shares = parseNum(cols.shares >= 0 ? f[cols.shares] : null);
      const price  = parseNum(cols.price  >= 0 ? f[cols.price]  : null);
      let   amount = parseNum(cols.amount >= 0 ? f[cols.amount] : null);
      const notes  = cols.notes >= 0 ? (f[cols.notes] || null) : null;
      const portfolio_name = cols.portfolio >= 0 ? (f[cols.portfolio] || null) : null;

      // Auto-compute amount if missing
      if (amount == null && shares != null && price != null) amount = shares * price;

      if (!trade_date || !type || amount == null) continue;  // skip invalid rows

      rows.push({ symbol, trade_date, type, shares, price, amount, notes, portfolio_name });
    }

    return { rows, format };
  }

  // ── Import transactions to Supabase ───────────────────────────────────────
  async function importTransactions(rows, portfolioId) {
    const { sb, user } = requireAuth();
    if (!rows || rows.length === 0) return { imported: 0, errors: [] };

    const toInsert = rows.map(r => ({
      user_id:      user.id,
      portfolio_id: portfolioId || null,
      symbol:       (r.symbol || '').toUpperCase(),
      trade_date:   r.trade_date,
      type:         r.type,
      shares:       r.shares != null ? Number(r.shares) : null,
      price:        r.price  != null ? Number(r.price)  : null,
      amount:       Number(r.amount),
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

  // ── Load chart transactions ───────────────────────────────────────────────
  // Called after chart data is ready; populates window.chartTxns then redraws overlay
  async function loadChartTransactions(symbol) {
    if (!getUser() || !getSb()) return;
    try {
      const txns = await getTransactions(symbol, null);
      window.chartTxns = txns;
      if (window.chart && window.updateOverlay) {
        window.updateOverlay(window.chart);
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
    deleteTransaction,
    parseMspCsv,
    importTransactions,
    loadChartTransactions,
  };

})();
