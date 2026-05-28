"""
Update FRED macro data (FEDFUNDS, DGS10) via FRED API.

Reads last DATE from each CSV, fetches newer observations from FRED,
appends new rows. Skips "." (missing) values.

Run via GitHub Actions (update_macro.yml) or manually:
    FRED_API_KEY=<key> python scripts/update_macro.py

FRED API key (free): https://fred.stlouisfed.org/docs/api/api_key.html
"""
import csv
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

FRED_API_URL = 'https://api.stlouisfed.org/fred/series/observations'
FRED_API_KEY = os.environ.get('FRED_API_KEY')

FRED_SERIES = {
    'FEDFUNDS': Path('assets/data/macro/FEDFUNDS.csv'),
    'DGS10':    Path('assets/data/macro/DGS10.csv'),
    'SP500':    Path('assets/data/macro/SP500.csv'),
}

if not FRED_API_KEY:
    print('ERROR: FRED_API_KEY not set.', flush=True)
    sys.exit(1)


def read_last_date(filepath: Path) -> str:
    """Read last observation_date from FRED-format CSV (header: observation_date,SERIES_ID)."""
    if not filepath.exists() or filepath.stat().st_size == 0:
        return '1950-01-01'
    with open(filepath, newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return '1950-01-01'
    # DictReader uses whatever the header says — 'observation_date' or 'DATE'
    date_col = 'observation_date' if 'observation_date' in rows[-1] else 'DATE'
    return rows[-1][date_col].strip()


def fetch_observations(series_id: str, observation_start: str) -> list[dict]:
    params = {
        'series_id': series_id,
        'observation_start': observation_start,
        'api_key': FRED_API_KEY,
        'file_type': 'json',
        'sort_order': 'asc',
    }
    for attempt in range(3):
        try:
            resp = requests.get(FRED_API_URL, params=params, timeout=30)
            if resp.status_code == 429:
                wait = 30 * (attempt + 1)
                print(f'  Rate-limited, waiting {wait}s…', flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return data.get('observations', [])
        except requests.RequestException as e:
            print(f'  Request error (attempt {attempt+1}): {e}', flush=True)
            if attempt == 2:
                raise
            time.sleep(10)
    return []


def update_series(series_id: str, filepath: Path) -> int:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    last_date = read_last_date(filepath)
    print(f'[{series_id}] last date: {last_date}', flush=True)

    # Fetch from day after last date
    from datetime import date as dt_date
    try:
        next_day = (datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
    except ValueError:
        next_day = '1950-01-01'

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')

    observations = fetch_observations(series_id, next_day)

    write_header = not filepath.exists() or filepath.stat().st_size == 0
    new_rows = 0

    with open(filepath, 'a', newline='') as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(['observation_date', series_id])
        for obs in observations:
            d = obs.get('date', '').strip()
            v = obs.get('value', '.').strip()
            if not d or v == '.' or d > yesterday:
                continue
            if d <= last_date:
                continue
            writer.writerow([d, v])
            new_rows += 1

    if new_rows:
        print(f'  [{series_id}] appended {new_rows} rows', flush=True)
    else:
        print(f'  [{series_id}] already up to date', flush=True)
    return new_rows


def main():
    total = 0
    for series_id, filepath in FRED_SERIES.items():
        total += update_series(series_id, filepath)
        time.sleep(1)  # be polite to FRED API

    print(f'\nDone. Total new rows: {total}', flush=True)


if __name__ == '__main__':
    main()
