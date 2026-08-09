"""
Update assets/data/stocks/{SYMBOL}.csv for crypto symbols (BTC-USD, ETH-USD,
etc.) via CoinGecko instead of Alpha Vantage.

Why this exists: update_stocks.py updates all symbols in config/symbols.json
through Alpha Vantage's TIME_SERIES_DAILY endpoint, which is stocks-only —
it returns "Invalid API call" for every crypto ticker, every time. Since
that failure is silent (update_stocks.py just logs "skipped (no data)" and
moves on), these symbols have been stuck at whatever date they were last
manually seeded, in some cases for months, with nothing surfacing the
problem. This script covers the same symbols via CoinGecko's free
market_chart endpoint instead, writing the same CSV schema
(date,open_price_usd,close_price_usd,adj_close_price_usd,total_volume_usd)
so the rest of the site (including the portfolio-analysis tool) doesn't
need to know the difference.

CoinGecko's market_chart only returns one price per day (no distinct
open/close), so open/close/adj_close are all set to that same value —
matches how update_btc.py already treats CoinGecko data (single daily
"open_price_usd", no separate close at all).

Run via GitHub Actions or manually:
    python scripts/update_crypto_stocks.py
"""
import csv
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

OUTPUT_DIR = Path('assets/data/stocks')
COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/{id}/market_chart'
FIELDNAMES = ['date', 'open_price_usd', 'close_price_usd', 'adj_close_price_usd', 'total_volume_usd']

# config/symbols.json ticker -> CoinGecko coin id
SYMBOL_TO_COINGECKO_ID = {
    'ALGO-USD': 'algorand',
    'APE-USD': 'apecoin',
    'ARB-USD': 'arbitrum',
    'BTC-USD': 'bitcoin',
    'CRV-USD': 'curve-dao-token',
    'DOGE-USD': 'dogecoin',
    'ENS-USD': 'ethereum-name-service',
    'ETH-USD': 'ethereum',
    'FET-USD': 'fetch-ai',
    'ICP-USD': 'internet-computer',
    'ONDO-USD': 'ondo-finance',
    'PEPE24478-USD': 'pepe',
    'STX-USD': 'blockstack',
}


def csv_path(symbol: str) -> Path:
    return OUTPUT_DIR / (symbol + '.csv')


def read_last_date(symbol: str):
    p = csv_path(symbol)
    if not p.exists():
        return None
    with open(p, newline='') as f:
        rows = list(csv.DictReader(f))
    return rows[-1]['date'].strip() if rows else None


def fetch_market_chart(coingecko_id: str, days: int) -> dict:
    url = COINGECKO_URL.format(id=coingecko_id)
    params = {'vs_currency': 'usd', 'days': days, 'interval': 'daily'}
    for attempt in range(3):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 30 * (attempt + 1)
                print(f'  Rate-limited, waiting {wait}s...', flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            print(f'  Request error (attempt {attempt + 1}): {e}', flush=True)
            if attempt == 2:
                return {}
            time.sleep(5)
    return {}


def main():
    today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_str = (today_utc - timedelta(days=1)).strftime('%Y-%m-%d')

    total_new = 0
    for symbol, cg_id in SYMBOL_TO_COINGECKO_ID.items():
        last_date_str = read_last_date(symbol)
        if last_date_str is None:
            print(f'[{symbol}] no existing CSV — skipping (needs manual seed first)', flush=True)
            continue
        if last_date_str >= yesterday_str:
            print(f'[{symbol}] already up to date ({last_date_str})', flush=True)
            continue

        last_date = datetime.strptime(last_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        days_needed = min((today_utc - last_date).days + 2, 365)  # CoinGecko daily-interval cap

        print(f'[{symbol}] last date {last_date_str}, fetching {days_needed} day(s) from CoinGecko ({cg_id})...', flush=True)
        data = fetch_market_chart(cg_id, days_needed)
        prices = data.get('prices', [])
        if not prices:
            print(f'  [{symbol}] no data returned, skipping', flush=True)
            time.sleep(3)
            continue

        vol_by_date = {}
        for ts, v in data.get('total_volumes', []):
            d = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
            vol_by_date[d] = v

        # Collapse to one price per date (last observation of that UTC day)
        price_by_date = {}
        for ts, price in prices:
            d = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
            price_by_date[d] = price

        new_rows = []
        for d in sorted(price_by_date):
            if d <= last_date_str or d > yesterday_str:
                continue
            p = price_by_date[d]  # full precision — no rounding (PEPE-scale prices need it)
            new_rows.append({
                'date': d,
                'open_price_usd': p,
                'close_price_usd': p,
                'adj_close_price_usd': p,
                'total_volume_usd': int(vol_by_date.get(d, 0)),
            })

        if not new_rows:
            print(f'  [{symbol}] no new rows in range', flush=True)
            time.sleep(3)
            continue

        with open(csv_path(symbol), 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writerows(new_rows)
        print(f'  [{symbol}] appended {len(new_rows)} row(s): {new_rows[0]["date"]} ~ {new_rows[-1]["date"]}', flush=True)
        total_new += len(new_rows)
        time.sleep(3)  # be polite to CoinGecko's free (unauthenticated) rate limit

    print(f'\nDone. Total new rows: {total_new}', flush=True)


if __name__ == '__main__':
    main()
