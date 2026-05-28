"""
Update crypto/data/pepe_daily.csv with new PEPE price data from CoinGecko.

Reads the last date in the CSV, fetches daily data for all missing
dates up to (and including) yesterday UTC, then appends new rows.
On first run (or if CSV only has recent data), fetches full history via days=max.
"""
import csv
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

CSV_PATH = Path('crypto/data/pepe_daily.csv')
COINGECKO_URL = 'https://api.coingecko.com/api/v3/coins/pepe/market_chart'
PEPE_LAUNCH = '2023-04-14'


def read_date_range() -> tuple[str, str]:
    if not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0:
        return PEPE_LAUNCH, PEPE_LAUNCH
    with open(CSV_PATH, newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return PEPE_LAUNCH, PEPE_LAUNCH
    return rows[0]['date'].strip(), rows[-1]['date'].strip()


def fetch_daily(days) -> dict:
    params = {'vs_currency': 'usd', 'days': days}
    for attempt in range(3):
        try:
            resp = requests.get(COINGECKO_URL, params=params, timeout=60)
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
    first_date_str, last_date_str = read_date_range()
    print(f'CSV range: {first_date_str} ~ {last_date_str}', flush=True)

    today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_str = (today_utc - timedelta(days=1)).strftime('%Y-%m-%d')

    if last_date_str >= yesterday_str:
        print('Already up to date.', flush=True)
        sys.exit(0)

    # If CSV doesn't have full history (starts after PEPE launch), fetch full history
    needs_full_history = first_date_str > PEPE_LAUNCH
    if needs_full_history:
        print('CSV missing historical data — fetching full history (days=max)...', flush=True)
        days_param = 'max'
    else:
        last_date = datetime.strptime(last_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        days_needed = (today_utc - last_date).days + 2
        days_param = days_needed
        print(f'Fetching {days_param} days from CoinGecko...', flush=True)

    data = fetch_daily(days_param)
    if not data or 'prices' not in data:
        print('Failed to fetch data.', flush=True)
        sys.exit(1)

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
        if date_str <= last_date_str or date_str > yesterday_str:
            continue
        new_rows.append({
            'date': date_str,
            'open_price_usd': round(price, 8),
            'total_volume_usd': round(vol_by_date.get(date_str, 0), 2),
            'market_cap_usd': round(mc_by_date.get(date_str, 0), 2),
        })

    if not new_rows and not needs_full_history:
        print('No new rows to append.', flush=True)
        sys.exit(0)

    new_rows.sort(key=lambda r: r['date'])

    if needs_full_history:
        historical_rows = []
        for ts, price in data['prices']:
            date_str = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
            if date_str >= first_date_str or date_str > yesterday_str:
                continue
            historical_rows.append({
                'date': date_str,
                'open_price_usd': round(price, 8),
                'total_volume_usd': round(vol_by_date.get(date_str, 0), 2),
                'market_cap_usd': round(mc_by_date.get(date_str, 0), 2),
            })
        if historical_rows or new_rows:
            historical_rows.sort(key=lambda r: r['date'])
            existing_rows = []
            if CSV_PATH.exists():
                with open(CSV_PATH, newline='') as f:
                    existing_rows = list(csv.DictReader(f))
            all_rows = historical_rows + existing_rows + new_rows
            with open(CSV_PATH, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['date', 'open_price_usd', 'total_volume_usd', 'market_cap_usd'])
                writer.writeheader()
                writer.writerows(all_rows)
            print(f'Prepended {len(historical_rows)} historical rows; appended {len(new_rows)} new rows.', flush=True)
            return

    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.DictWriter(
            f, fieldnames=['date', 'open_price_usd', 'total_volume_usd', 'market_cap_usd']
        )
        if not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0:
            writer.writeheader()
        for row in new_rows:
            writer.writerow(row)

    print(f'Appended {len(new_rows)} rows: {new_rows[0]["date"]} ~ {new_rows[-1]["date"]}', flush=True)


if __name__ == '__main__':
    main()
