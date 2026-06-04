"""
Update FRED macro data (FEDFUNDS, DGS10, SP500, Wilshire5000, GDP)
and Shiller PE from Yale's dataset.

Run via GitHub Actions (update_macro.yml) or manually:
    FRED_API_KEY=<key> python scripts/update_macro.py

FRED API key (free): https://fred.stlouisfed.org/docs/api/api_key.html
"""
import bisect
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

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    if next_day > today:
        print(f'  [{series_id}] already up to date', flush=True)
        return 0
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
    Always does a full rewrite so Yale's retroactive updates are captured.
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
    # Col 0: Date (decimal like 2024.01)
    # Find CAPE column dynamically by scanning header rows for "CAPE" or "P/E10"
    cape_col = 12  # default
    for r in range(0, 8):
        for c in range(ws.ncols):
            cell = str(ws.cell_value(r, c)).strip().upper()
            if cell in ('CAPE', 'P/E10', 'CYCLICALLY ADJUSTED P/E'):
                cape_col = c
                print(f'  [SHILLER_PE] Found CAPE at col {c} (row {r})', flush=True)
                break

    out_rows = []
    for row_idx in range(8, ws.nrows):
        try:
            date_val = ws.cell_value(row_idx, 0)
            cape_val = ws.cell_value(row_idx, cape_col)
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

    # Always full rewrite — Yale updates values in-place for recent months
    with open(filepath, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['observation_date', 'SHILLER_PE'])
        for row in out_rows:
            writer.writerow(row)
    print(f'  [SHILLER_PE] wrote {len(out_rows)} rows', flush=True)
    return len(out_rows)


def compute_buffett(will_path: Path, gdp_path: Path, sp500_path: Path) -> int:
    """
    Compute Buffett Indicator = WILL5000INDFC / GDP * 100.
    - Quarterly data for historical period (1989–)
    - Daily data from 2016+ by scaling quarterly Buffett with daily S&P 500 changes
      (S&P 500 and Wilshire 5000 are ~99% correlated, so scaling is accurate)
    Saves to assets/data/macro/BUFFETT.csv
    """
    out_path = Path('assets/data/macro/BUFFETT.csv')
    out_path.parent.mkdir(parents=True, exist_ok=True)

    def read_fred_csv(p: Path) -> dict:
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

    will_map = read_fred_csv(will_path)
    gdp_map  = read_fred_csv(gdp_path)
    sp500_map = read_fred_csv(sp500_path)

    if not will_map or not gdp_map:
        print('  [BUFFETT] Missing source data, skipping.', flush=True)
        return 0

    # ── Step 1: compute quarterly Buffett (forward-fill GDP) ──────────
    all_q_dates = sorted(set(will_map) | set(gdp_map))
    q_buffett: dict[str, float] = {}
    last_gdp = None
    for d in all_q_dates:
        if d in gdp_map:
            last_gdp = gdp_map[d]
        will = will_map.get(d)
        if will is not None and last_gdp is not None and last_gdp > 0:
            q_buffett[d] = (will / last_gdp) * 100.0

    q_dates_sorted = sorted(q_buffett.keys())
    if not q_dates_sorted:
        print('  [BUFFETT] No quarterly data computed.', flush=True)
        return 0

    sp500_dates = sorted(sp500_map.keys())
    sp500_start = sp500_dates[0] if sp500_dates else '9999-99-99'

    def floor_idx(sorted_list: list, value: str) -> int:
        """Index of the largest element <= value, or -1."""
        return bisect.bisect_right(sorted_list, value) - 1

    # ── Step 2: quarterly rows before SP500 daily era ─────────────────
    out_rows: list[tuple[str, str]] = []
    for d in q_dates_sorted:
        if d < sp500_start:
            out_rows.append((d, f'{q_buffett[d]:.4f}'))

    # ── Step 3: daily rows using SP500 scaling ────────────────────────
    for d in sp500_dates:
        qi = floor_idx(q_dates_sorted, d)
        if qi < 0:
            continue
        q_date = q_dates_sorted[qi]
        q_buff_val = q_buffett[q_date]

        # Anchor SP500: first trading day on or after the quarter date
        anchor_i = bisect.bisect_left(sp500_dates, q_date)
        if anchor_i >= len(sp500_dates):
            continue
        sp_anchor = sp500_map[sp500_dates[anchor_i]]
        sp_today  = sp500_map[d]

        if sp_anchor > 0 and sp_today > 0:
            daily_buff = q_buff_val * (sp_today / sp_anchor)
        else:
            daily_buff = q_buff_val

        out_rows.append((d, f'{daily_buff:.4f}'))

    # Sort (quarterly + daily combined)
    out_rows.sort(key=lambda x: x[0])

    with open(out_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['observation_date', 'BUFFETT'])
        for row in out_rows:
            writer.writerow(row)

    print(f'  [BUFFETT] wrote {len(out_rows)} rows '
          f'(quarterly through {sp500_start}, daily from {sp500_start})', flush=True)
    return len(out_rows)


def _is_annual_only(filepath: Path) -> bool:
    """Return True if CSV has only Jan-01 dates (annual data, not quarterly)."""
    if not filepath.exists() or filepath.stat().st_size == 0:
        return False
    with open(filepath, newline='') as f:
        rows = [r for r in csv.DictReader(f)]
    if len(rows) < 4:
        return False
    date_col = 'observation_date' if 'observation_date' in rows[0] else 'DATE'
    non_jan = sum(1 for r in rows if not r[date_col].strip().endswith('-01-01'))
    return non_jan == 0  # all rows are Jan-01 → annual-only


def main():
    # Force re-fetch GDP if it contains only annual (Jan-01) data
    gdp_path = Path('assets/data/macro/GDP.csv')
    if _is_annual_only(gdp_path):
        print('[GDP] Annual-only data detected — deleting for full quarterly re-fetch', flush=True)
        gdp_path.unlink()

    total = 0
    for series_id, filepath in FRED_SERIES.items():
        total += update_series(series_id, filepath)
        time.sleep(1)

    total += update_shiller_pe()

    # Compute derived series (with daily SP500 scaling for Buffett)
    compute_buffett(
        Path('assets/data/macro/WILL5000INDFC.csv'),
        Path('assets/data/macro/GDP.csv'),
        Path('assets/data/macro/SP500.csv'),
    )

    print(f'\nDone. Total new rows: {total}', flush=True)


if __name__ == '__main__':
    main()
