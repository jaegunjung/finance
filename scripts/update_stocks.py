"""
Update assets/data/stocks/{SYMBOL}.csv with new daily price data from Alpha Vantage.

For each symbol in config/symbols.json:
  1. Read the last date from the CSV (or use START if file missing)
  2. Fetch TIME_SERIES_DAILY_ADJUSTED (compact = last 100 trading days)
  3. Filter rows newer than the last CSV date
  4. Append to the CSV

Run via GitHub Actions (update_stocks.yml) or manually:
    ALPHA_VANTAGE_API_KEY=<key> python scripts/update_stocks.py

Columns: date, open_price_usd, close_price_usd, adj_close_price_usd, total_volume_usd
^ is stripped from filenames: ^GSPC → GSPC.csv
"""
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

CONFIG_PATH = Path('config/symbols.json')
OUTPUT_DIR  = Path('assets/data/stocks')
AV_URL      = 'https://www.alphavantage.co/query'
START       = '2013-04-27'

API_KEY = os.environ.get('ALPHA_VANTAGE_API_KEY') or os.environ.get('alpha_vantage_api_key')
if not API_KEY:
    print('ERROR: ALPHA_VANTAGE_API_KEY not set.', flush=True)
    sys.exit(1)

FIELDNAMES = ['date', 'open_price_usd', 'close_price_usd', 'adj_close_price_usd', 'total_volume_usd']


def csv_path(symbol: str) -> Path:
    return OUTPUT_DIR / (symbol.replace('^', '') + '.csv')


def read_last_date(symbol: str) -> str:
    p = csv_path(symbol)
    if not p.exists():
        return START
    with open(p, newline='') as f:
        rows = list(csv.DictReader(f))
    return rows[-1]['date'].strip() if rows else START


def fetch_adjusted(symbol: str) -> dict:
    params = {
        'function': 'TIME_SERIES_DAILY_ADJUSTED',
        'symbol': symbol,
        'outputsize': 'compact',
        'apikey': API_KEY,
    }
    for attempt in range(3):
        try:
            resp = requests.get(AV_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if 'Time Series (Daily)' not in data:
                note = data.get('Note') or data.get('Information') or str(data)[:120]
                print(f'  [{symbol}] Unexpected response: {note}', flush=True)
                return {}
            return data['Time Series (Daily)']
        except requests.RequestException as e:
            print(f'  [{symbol}] Request error (attempt {attempt+1}): {e}', flush=True)
            if attempt == 2:
                return {}
            time.sleep(10)
    return {}


def append_rows(symbol: str, ts: dict, last_date: str) -> int:
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    new_rows = []
    for date_str, v in ts.items():
        if date_str <= last_date:
            continue
        if date_str > yesterday:
            continue  # skip incomplete today
        new_rows.append({
            'date':              date_str,
            'open_price_usd':    round(float(v['1. open']), 4),
            'close_price_usd':   round(float(v['4. close']), 4),
            'adj_close_price_usd': round(float(v['5. adjusted close']), 4),
            'total_volume_usd':  int(v['6. volume']),
        })

    if not new_rows:
        return 0

    new_rows.sort(key=lambda r: r['date'])
    p = csv_path(symbol)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_header = not p.exists()

    with open(p, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        writer.writerows(new_rows)

    return len(new_rows)


def main():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    symbols = cfg['stocks']

    total_new = 0
    for symbol in symbols:
        last_date = read_last_date(symbol)
        print(f'[{symbol}] last date: {last_date}', flush=True)

        ts = fetch_adjusted(symbol)
        if not ts:
            print(f'  [{symbol}] skipped (no data)', flush=True)
            # Alpha Vantage free tier: 25 req/day, ~5 req/min — pace requests
            time.sleep(15)
            continue

        added = append_rows(symbol, ts, last_date)
        if added:
            print(f'  [{symbol}] appended {added} row(s)', flush=True)
            total_new += added
        else:
            print(f'  [{symbol}] already up to date', flush=True)

        # Free tier: max 5 requests/minute → sleep between calls
        time.sleep(13)

    print(f'\nDone. Total new rows: {total_new}', flush=True)
    if total_new == 0:
        sys.exit(0)


if __name__ == '__main__':
    main()
