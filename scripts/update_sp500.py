"""
Fetch the latest S&P 500 monthly closing prices from Yahoo Finance
and update assets/data/sp500_monthly.csv.

Run daily via GitHub Actions. Logic:
  1. If the CSV already has this month's data → exit immediately (skip rest of month).
  2. Otherwise fetch from Yahoo Finance.
  3. If Yahoo Finance doesn't have this month's data yet → exit (try again tomorrow).
  4. If new month data is available → update CSV and exit (the workflow then commits).
"""

import csv
import os
import sys
from datetime import datetime, timezone

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip install yfinance")
    sys.exit(1)

CSV_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'data', 'sp500_monthly.csv')
)


def read_existing():
    data = {}
    with open(CSV_PATH, 'r', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data[row['date']] = float(row['price'])
    return data


def fetch_yahoo():
    """Fetch S&P 500 monthly closes from Yahoo Finance (last 5 years)."""
    ticker = yf.Ticker("^GSPC")
    hist = ticker.history(period="5y", interval="1mo")
    if hist.empty:
        raise RuntimeError("No data returned from Yahoo Finance")
    result = {}
    for ts, row in hist.iterrows():
        result[ts.strftime('%Y-%m')] = round(float(row['Close']), 2)
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
    print(f"Current month: {current_month}")

    existing = read_existing()
    latest_in_csv = max(existing.keys())
    print(f"Latest in CSV:  {latest_in_csv}")

    # ── Guard: already have this month → nothing to do until next month ──
    if latest_in_csv >= current_month:
        print(f"Already up to date ({latest_in_csv}). Skipping until next month.")
        sys.exit(0)

    # ── Need new data — check Yahoo Finance ──
    print("Fetching from Yahoo Finance (^GSPC)...")
    try:
        new_data = fetch_yahoo()
    except Exception as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

    # ── Guard: source doesn't have this month yet → try again tomorrow ──
    if current_month not in new_data:
        print(f"Yahoo Finance does not have {current_month} yet. Will retry tomorrow.")
        sys.exit(0)

    # ── Update: add/fix any months newer than what we have ──
    added, updated = 0, 0
    for date, price in new_data.items():
        if date <= latest_in_csv:
            continue  # don't touch historical data
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
