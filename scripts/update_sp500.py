"""
Fetch the latest S&P 500 monthly closing prices from Yahoo Finance
and update assets/data/sp500_monthly.csv.

Preserves all existing data (especially pre-1928 Shiller data).
Only adds/updates recent months from Yahoo Finance (^GSPC).
"""

import csv
import os
import sys
from datetime import datetime

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip install yfinance")
    sys.exit(1)

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'assets', 'data', 'sp500_monthly.csv')
CSV_PATH = os.path.normpath(CSV_PATH)


def read_existing():
    data = {}
    with open(CSV_PATH, 'r', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data[row['date']] = float(row['price'])
    return data


def fetch_yahoo():
    """Fetch S&P 500 monthly closes from Yahoo Finance."""
    ticker = yf.Ticker("^GSPC")
    # Download last 5 years of monthly data — enough to catch any gaps
    hist = ticker.history(period="5y", interval="1mo")
    if hist.empty:
        raise RuntimeError("No data returned from Yahoo Finance")
    result = {}
    for ts, row in hist.iterrows():
        # Use YYYY-MM format (month of the timestamp)
        date_str = ts.strftime('%Y-%m')
        result[date_str] = round(float(row['Close']), 2)
    return result


def main():
    print(f"Reading existing data from {CSV_PATH}")
    existing = read_existing()
    original_count = len(existing)
    print(f"  Existing entries: {original_count}")

    print("Fetching latest data from Yahoo Finance (^GSPC)...")
    try:
        new_data = fetch_yahoo()
    except Exception as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

    updated = 0
    added = 0
    for date, price in new_data.items():
        if date not in existing:
            existing[date] = price
            added += 1
        elif abs(existing[date] - price) > 0.01:
            existing[date] = price
            updated += 1

    if added == 0 and updated == 0:
        print("Data is already up to date. No changes.")
        return

    print(f"  Added: {added} new months, Updated: {updated} existing months")

    # Sort by date and write back
    sorted_dates = sorted(existing.keys())
    with open(CSV_PATH, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'price'])
        for date in sorted_dates:
            writer.writerow([date, existing[date]])

    latest = sorted_dates[-1]
    print(f"  Saved {len(sorted_dates)} total entries.")
    print(f"  Latest data point: {latest} = {existing[latest]}")


if __name__ == '__main__':
    main()
