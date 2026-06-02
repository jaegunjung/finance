"""
Update FRED macro data (FEDFUNDS, DGS10, SP500, Wilshire5000, GDP)
and Shiller PE from Yale's dataset.

Run via GitHub Actions (update_macro.yml) or manually:
    FRED_API_KEY=<key> python scripts/update_macro.py

FRED API key (free): https://fred.stlouisfed.org/docs/api/api_key.html
"""
import csv
import io
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

FRED_API_URL = 'https://api.stlouisfed.org/fred/series/observations'
FRED_API_KEY = os.environ.get('FRED_API_KEY')

FRED_SERIES = {
    'FEDFUNDS':       Path('assets/data/macro/FEDFUNDS.csv'),
    'DGS10':          Path('assets/data/macro/DGS10.csv'),
    'SP500':          Path('assets/data/macro/SP500.csv'),
    'WILL5000INDFC':  Path('assets/data/macro/WILL5000INDFC.csv'),
    'GDP':            Path('assets/data/macro/GDP.csv'),
}

if not FRED_API_KEY:
    print('ERROR: FRED_API_KEY not set.', flush=True)
    sys.exit(1)


def read_last_date(filepath: Path) -> str:
    """Read last observation_date from FRED-format CSV."""
    if not filepath.exists() or filepath.stat().st_size == 0:
        return '1950-01-01'
    with open(filepath, newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return '1950-01-01'
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


def update_shiller_pe() -> int:
    """
    Fetch Shiller's IE data from Yale and extract the CAPE (cyclically adjusted PE).
    Saves to assets/data/macro/SHILLER_PE.csv with columns: observation_date, SHILLER_PE
    Yale Excel: http://www.econ.yale.edu/~shiller/data/ie_data.xls
    """
    filepath = Path('assets/data/macro/SHILLER_PE.csv')
    filepath.parent.mkdir(parents=True, exist_ok=True)

    url = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls'
    print(f'[SHILLER_PE] Fetching from Yale: {url}', flush=True)

    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f'  [SHILLER_PE] Fetch failed: {e}', flush=True)
        return 0

    try:
        import xlrd
        wb = xlrd.open_workbook(file_contents=resp.content)
        ws = wb.sheet_by_name('Data')
    except Exception as e:
        print(f'  [SHILLER_PE] xlrd parse failed: {e}', flush=True)
        return 0

    # Shiller's spreadsheet: data starts at row 8 (0-indexed: row 7)
    # Col 0: Date (decimal like 2024.01), Col 12: CAPE
    rows_written = 0
    out_rows = []
    for row_idx in range(8, ws.nrows):
        try:
            date_val = ws.cell_value(row_idx, 0)
            cape_val = ws.cell_value(row_idx, 12)
        except IndexError:
            continue
        if not date_val or not cape_val or cape_val in ('', 'NA'):
            continue
        try:
            date_float = float(date_val)
            cape = float(cape_val)
        except (ValueError, TypeError):
            continue
        if cape <= 0:
            continue

        # Convert decimal date like 2024.01 → 2024-01-01
        year = int(date_float)
        month_frac = round((date_float - year) * 100)
        if month_frac < 1:
            month_frac = 1
        if month_frac > 12:
            month_frac = 12
        date_str = f'{year:04d}-{month_frac:02d}-01'
        out_rows.append((date_str, f'{cape:.2f}'))

    if not out_rows:
        print('  [SHILLER_PE] No data rows parsed.', flush=True)
        return 0

    # Read existing last date to only append new rows
    last_date = '1800-01-01'
    if filepath.exists() and filepath.stat().st_size > 0:
        with open(filepath, newline='') as f:
            existing = list(csv.DictReader(f))
        if existing:
            last_date = existing[-1].get('observation_date', '1800-01-01')

    write_header = not filepath.exists() or filepath.stat().st_size == 0
    new_rows = [r for r in out_rows if r[0] > last_date]

    if new_rows:
        with open(filepath, 'a', newline='') as f:
            writer = csv.writer(f)
            if write_header:
                writer.writerow(['observation_date', 'SHILLER_PE'])
            for row in new_rows:
                writer.writerow(row)
        print(f'  [SHILLER_PE] appended {len(new_rows)} rows', flush=True)
    else:
        # Full rewrite if data looks stale (Yale updates in place)
        # Always rewrite since Yale updates all data in the same file
        with open(filepath, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['observation_date', 'SHILLER_PE'])
            for row in out_rows:
                writer.writerow(row)
        print(f'  [SHILLER_PE] rewrote {len(out_rows)} rows (Yale full-file format)', flush=True)
        rows_written = len(out_rows)

    return len(new_rows) if new_rows else rows_written


def compute_buffett(will_path: Path, gdp_path: Path) -> int:
    """
    Compute Buffett Indicator = WILL5000INDFC / GDP * 100 and save.
    Both FRED series are quarterly and in billions of USD.
    Saves to assets/data/macro/BUFFETT.csv
    """
    out_path = Path('assets/data/macro/BUFFETT.csv')
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def read_csv(p: Path) -> dict:
        result = {}
        if not p.exists():
            return result
        with open(p, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_col = 'observation_date' if 'observation_date' in row else 'DATE'
                val_col = [k for k in row if k != date_col][0]
                d = row[date_col].strip()
                v = row[val_col].strip()
                if v and v != '.':
                    try:
                        result[d] = float(v)
                    except ValueError:
                        pass
        return result

    will_map = read_csv(will_path)
    gdp_map = read_csv(gdp_path)

    if not will_map or not gdp_map:
        print('  [BUFFETT] Missing source data, skipping.', flush=True)
        return 0

    # Align on quarterly dates — forward-fill GDP for months where only WILL has data
    all_dates = sorted(set(will_map) | set(gdp_map))
    out_rows = []
    last_gdp = None
    for d in all_dates:
        if d in gdp_map:
            last_gdp = gdp_map[d]
        will = will_map.get(d)
        if will is not None and last_gdp is not None and last_gdp > 0:
            buffett = (will / last_gdp) * 100.0
            out_rows.append((d, f'{buffett:.4f}'))

    with open(out_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['observation_date', 'BUFFETT'])
        for row in out_rows:
            writer.writerow(row)

    print(f'  [BUFFETT] wrote {len(out_rows)} rows', flush=True)
    return len(out_rows)


def main():
    total = 0
    for series_id, filepath in FRED_SERIES.items():
        total += update_series(series_id, filepath)
        time.sleep(1)

    total += update_shiller_pe()

    # Compute derived series
    compute_buffett(
        Path('assets/data/macro/WILL5000INDFC.csv'),
        Path('assets/data/macro/GDP.csv'),
    )

    print(f'\nDone. Total new rows: {total}', flush=True)


if __name__ == '__main__':
    main()
