"""
Supabase의 transactions 테이블에서 새 종목을 감지해서:
  1. config/symbols.json에 추가
  2. stock/{symbol}/index.html 페이지 자동 생성

update_stocks.py 실행 전에 먼저 실행해야 함.
필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
"""
import json
import os
import sys
import requests
from pathlib import Path

SUPABASE_URL        = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

CONFIG_PATH = Path('config/symbols.json')
STOCK_DIR   = Path('stock')

# 크립토·현금 — 주식 데이터 수집 제외
EXCLUDE = {'BTC', 'ETH', 'PEPE', 'USD', 'USDT', 'USDC'}

PAGE_TEMPLATE = """\
---
layout: stock-chart
title: {symbol}
symbol: {symbol}
csv_file: {symbol}.csv
title_en: "{symbol}"
title_ko: "{symbol}"
subtitle_en: "Daily chart · Log scale · Adj. close price"
subtitle_ko: "일간 차트 · 로그 스케일 · 수정 종가"
source_en: "Data: Alpha Vantage · Updated weekdays via GitHub Actions"
source_ko: "데이터: Alpha Vantage · GitHub Actions 평일 자동 업데이트"
---
"""


def fetch_portfolio_symbols() -> set[str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print('ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set.', flush=True)
        sys.exit(1)

    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    }
    # Fetch distinct symbols via REST (no aggregate on free tier — fetch all & dedupe)
    resp = requests.get(
        f'{SUPABASE_URL}/rest/v1/transactions',
        params={'select': 'symbol', 'limit': '10000'},
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    rows = resp.json()
    return {r['symbol'].upper() for r in rows if r.get('symbol')} - EXCLUDE


def update_symbols_json(new_symbols: set[str]) -> list[str]:
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    existing = set(cfg.get('stocks', []))
    added = sorted(new_symbols - existing)
    if added:
        cfg['stocks'] = sorted(existing | new_symbols)
        with open(CONFIG_PATH, 'w') as f:
            json.dump(cfg, f, indent=2)
    return added


def create_stock_page(symbol: str) -> bool:
    page_dir  = STOCK_DIR / symbol.lower()
    page_path = page_dir / 'index.html'
    if page_path.exists():
        return False
    page_dir.mkdir(parents=True, exist_ok=True)
    page_path.write_text(PAGE_TEMPLATE.format(symbol=symbol))
    return True


def main():
    print('Fetching symbols from Supabase…', flush=True)
    symbols = fetch_portfolio_symbols()
    print(f'Found symbols: {sorted(symbols)}', flush=True)

    added = update_symbols_json(symbols)
    if added:
        print(f'Added to symbols.json: {added}', flush=True)
    else:
        print('symbols.json already up to date.', flush=True)

    pages_created = []
    for sym in added:
        if create_stock_page(sym):
            pages_created.append(sym)
            print(f'Created stock page: stock/{sym.lower()}/index.html', flush=True)

    if not added:
        print('Nothing new — all symbols already tracked.', flush=True)
    else:
        print(f'\nSummary: +{len(added)} symbols, {len(pages_created)} new pages', flush=True)


if __name__ == '__main__':
    main()
