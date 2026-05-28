"""
Update crypto/data/btc_daily.csv with new BTC price data from CoinGecko.

Reads the last date in the CSV, fetches daily OHLCV data for all missing
dates up to (and including) yesterday UTC, then appends new rows.
"""
import csv
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

CSV_PATH = Path('crypto/data/btc_daily.csv')
COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart'


def read_last_date() -> str:
    with open(CSV_PATH, newline='') as f:
        rows = list(csv.DictReader(f))
    return rows[-1]['date'].strip() if rows else '2013-01-01'


def fetch_daily(days: int) -> dict:
    params = {'vs_currency': 'usd', 'days': days, 'interval': 'daily'}
    for attempt in range(3):
        try:
            resp = requests.get(COINGECKO_URL, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 60 * (attempt + 1)
                print(f'Rate-limited, waiting {wait}s...', flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            print(f'Request error (attempt {attempt + 1}): {e}', flush=True)
            if attempt == 2:
                raise
            time.sleep(10)
    return {}


def main():
    last_date_str = read_last_date()
    print(f'Last date in CSV: {last_date_str}', flush=True)

    last_date = datetime.strptime(last_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_str = (today_utc - timedelta(days=1)).strftime('%Y-%m-%d')

    if last_date_str >= yesterday_str:
        print('Already up to date.', flush=True)
        sys.exit(0)

    days_needed = (today_utc - last_date).days + 2  # +2 for buffer
    print(f'Fetching {days_needed} days from CoinGecko...', flush=True)

    data = fetch_daily(days_needed)
    if not data or 'prices' not in data:
        print('Failed to fetch data.', flush=True)
        sys.exit(1)

    # Build date-keyed lookups for volume and market cap
    vol_by_date = {
        datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d'): v
        for ts, v in data.get('total_volumes', [])
    }
    mc_by_date = {
        datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d'): mc
        for ts, mc in data.get('market_caps', [])
    }

    new_rows = []
    for ts, price in data['prices']:
        date_str = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
        if date_str <= last_date_str:
            continue
        if date_str > yesterday_str:
            continue  # skip today — candle is incomplete
        new_rows.append({
            'date': date_str,
            'open_price_usd': round(price, 2),
            'total_volume_usd': int(vol_by_date.get(date_str, 0)),
            'market_cap_usd': int(mc_by_date.get(date_str, 0)),
        })

    if not new_rows:
        print('No new rows to append.', flush=True)
        sys.exit(0)

    new_rows.sort(key=lambda r: r['date'])

    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.DictWriter(
            f, fieldnames=['date', 'open_price_usd', 'total_volume_usd', 'market_cap_usd']
        )
        for row in new_rows:
            writer.writerow(row)

    print(f'Appended {len(new_rows)} rows: {new_rows[0]["date"]} ~ {new_rows[-1]["date"]}', flush=True)


if __name__ == '__main__':
    main()
