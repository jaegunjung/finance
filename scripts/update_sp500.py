"""
Fetch S&P 500 monthly closing prices from stooq.com
(free, no API key required) and update assets/data/sp500_monthly.csv.

Run daily via GitHub Actions. Logic:
  1. If the CSV already has this month's data → exit (skip rest of month).
  2. Fetch from stooq.com (full history, CSV format).
  3. If source doesn't have this month yet → exit (retry tomorrow).
  4. If new month data found → merge and commit.
"""

import csv
import os
import sys
import requests
from datetime import datetime, timezone
from io import StringIO

CSV_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'data', 'sp500_monthly.csv')
)
STOOQ_URL = 'https://stooq.com/q/d/l/?s=%5Espx&i=m'


def read_existing():
    data = {}
    if not os.path.exists(CSV_PATH):
        return data
    with open(CSV_PATH, 'r', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data[row['date']] = float(row['price'])
    return data


def fetch_stooq():
    """Fetch full S&P 500 monthly history from stooq.com."""
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; finance-updater/1.0)'}
    resp = requests.get(STOOQ_URL, timeout=30, headers=headers)
    resp.raise_for_status()

    result = {}
    reader = csv.DictReader(StringIO(resp.text))
    for row in reader:
        date_str  = (row.get('Date') or '').strip()
        close_str = (row.get('Close') or '').strip()
        if not date_str or not close_str or close_str.lower() == 'null':
            continue
        month_key = date_str[:7]          # YYYY-MM-DD → YYYY-MM
        try:
            result[month_key] = round(float(close_str), 2)
        except ValueError:
            continue
    return result


def write_csv(data):
    sorted_dates = sorted(data.keys())
    with open(CSV_PATH, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'price'])
        for date in sorted_dates:
            writer.writerow([date, data[date]])
    return sorted_dates


def main():
    current_month = datetime.now(timezone.utc).strftime('%Y-%m')
    print(f"Current month : {current_month}")

    existing = read_existing()
    latest_in_csv = max(existing.keys()) if existing else '1900-01'
    print(f"Latest in CSV : {latest_in_csv}")

    if latest_in_csv >= current_month:
        print(f"Already up to date ({latest_in_csv}). Skipping until next month.")
        sys.exit(0)

    print("Fetching from stooq.com (^SPX monthly)…")
    try:
        new_data = fetch_stooq()
    except Exception as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

    if not new_data:
        print("No data returned from stooq. Exiting.")
        sys.exit(1)

    latest_from_source = max(new_data.keys())
    print(f"Fetched {len(new_data)} months. Latest available: {latest_from_source}")

    if current_month not in new_data:
        print(f"stooq does not have {current_month} yet. Will retry tomorrow.")
        sys.exit(0)

    added, updated = 0, 0
    for date, price in new_data.items():
        if date <= latest_in_csv:
            continue
        if date not in existing:
            existing[date] = price
            added += 1
        elif abs(existing[date] - price) > 0.01:
            existing[date] = price
            updated += 1

    if added == 0 and updated == 0:
        print("No changes after merge. Nothing to commit.")
        sys.exit(0)

    sorted_dates = write_csv(existing)
    latest = sorted_dates[-1]
    print(f"Added {added} month(s), updated {updated}. Latest: {latest} = {existing[latest]}")
    print(f"Total entries: {len(sorted_dates)}")


if __name__ == '__main__':
    main()
