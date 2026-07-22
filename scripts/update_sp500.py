"""
Update assets/data/sp500_monthly.csv by deriving monthly closes from
assets/data/macro/SP500.csv (FRED's SP500 daily series, kept fresh by
scripts/update_macro.py). For each month, the last trading day present
in that file becomes the month's close.

Historical months before FRED's SP500 series starts (2016-05) came from
a one-time Macrotrends/Shiller backfill and are left untouched — this
script only ever adds or refreshes months at/after that start date.

Previously this scraped stooq.com directly, but stooq added a JS
proof-of-work bot-check that returns HTTP 200 with a JS challenge page
instead of CSV for plain HTTP requests, so the daily cron silently
produced zero rows for over a year. Reusing the already-working FRED
pipeline avoids scraping/bot-detection entirely.

Run daily via GitHub Actions, after scripts/update_macro.py.
"""

import csv
import os
import sys
from datetime import datetime, timezone

CSV_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'data', 'sp500_monthly.csv')
)
FRED_SP500_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', 'assets', 'data', 'macro', 'SP500.csv')
)


def read_existing():
    data = {}
    if not os.path.exists(CSV_PATH):
        return data
    with open(CSV_PATH, 'r', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data[row['date']] = float(row['price'])
    return data


def derive_monthly_from_fred():
    """Last available trading-day close of each month in FRED's SP500.csv."""
    if not os.path.exists(FRED_SP500_PATH):
        return {}
    monthly = {}
    with open(FRED_SP500_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = (row.get('observation_date') or '').strip()
            value = (row.get('SP500') or '').strip()
            if not date or not value or value == '.':
                continue
            try:
                price = round(float(value), 2)
            except ValueError:
                continue
            monthly[date[:7]] = price  # later rows in the same month overwrite earlier ones
    return monthly


def write_csv(data):
    sorted_dates = sorted(data.keys())
    with open(CSV_PATH, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'price'])
        for date in sorted_dates:
            writer.writerow([date, data[date]])
    return sorted_dates


def main():
    existing = read_existing()
    latest_in_csv = max(existing.keys()) if existing else '1900-01'
    print(f"Latest in CSV : {latest_in_csv}")

    fred_monthly = derive_monthly_from_fred()
    if not fred_monthly:
        print(f"No FRED SP500 data found at {FRED_SP500_PATH}. Exiting.")
        sys.exit(0)

    current_month = datetime.now(timezone.utc).strftime('%Y-%m')
    added, updated = 0, 0
    for month, price in fred_monthly.items():
        if month not in existing:
            existing[month] = price
            added += 1
        elif month >= current_month and abs(existing[month] - price) > 0.01:
            # Only the still-in-progress current month gets refreshed as new
            # trading days arrive — completed months are final.
            existing[month] = price
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
