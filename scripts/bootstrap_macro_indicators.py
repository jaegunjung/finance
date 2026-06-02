"""
One-time bootstrap: fetch Shiller PE (Yale) + Buffett Indicator (FRED public CSV).
Does NOT require FRED_API_KEY — uses FRED's public graph CSV endpoint.

Run once to seed the CSVs; update_macro.py keeps them current via GitHub Actions.
"""
import csv
import io
import time
import requests
from pathlib import Path

FRED_PUBLIC = 'https://fred.stlouisfed.org/graph/fredgraph.csv'


def fetch_fred_public(series_id: str) -> dict:
    """Fetch from FRED public CSV (no API key needed)."""
    url = f'{FRED_PUBLIC}?id={series_id}'
    print(f'  Fetching FRED {series_id}…', flush=True)
    resp = requests.get(url, timeout=60, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()
    result = {}
    lines = resp.text.strip().split('\n')
    for line in lines[1:]:
        parts = line.split(',')
        if len(parts) < 2:
            continue
        d, v = parts[0].strip(), parts[1].strip()
        if v == '.':
            continue
        try:
            result[d] = float(v)
        except ValueError:
            pass
    print(f'    -> {len(result)} rows', flush=True)
    return result


def save_csv(path: Path, col_name: str, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['observation_date', col_name])
        for d in sorted(data):
            writer.writerow([d, f'{data[d]:.6g}'])
    print(f'  Saved {len(data)} rows -> {path}', flush=True)


def fetch_shiller_pe() -> dict:
    """Download Yale IE data Excel and extract CAPE column."""
    url = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls'
    print(f'  Fetching Shiller data from Yale…', flush=True)
    resp = requests.get(url, timeout=120, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()

    try:
        import xlrd
    except ImportError:
        print('  xlrd not installed. Run: pip install xlrd', flush=True)
        return {}

    wb = xlrd.open_workbook(file_contents=resp.content)
    ws = wb.sheet_by_name('Data')

    result = {}
    for row_idx in range(8, ws.nrows):
        try:
            date_val = ws.cell_value(row_idx, 0)
            cape_val = ws.cell_value(row_idx, 10)
        except IndexError:
            continue
        if not date_val or not cape_val or cape_val == '':
            continue
        try:
            date_float = float(date_val)
            cape = float(cape_val)
        except (ValueError, TypeError):
            continue
        if cape <= 0:
            continue
        year = int(date_float)
        month_frac = round((date_float - year) * 100)
        month_frac = max(1, min(12, month_frac if month_frac > 0 else 1))
        date_str = f'{year:04d}-{month_frac:02d}-01'
        result[date_str] = cape

    print(f'    -> {len(result)} rows', flush=True)
    return result


def compute_buffett(will_map: dict, gdp_map: dict) -> dict:
    """Buffett Indicator = WILL5000INDFC / GDP * 100"""
    all_dates = sorted(set(will_map) | set(gdp_map))
    result = {}
    last_gdp = None
    for d in all_dates:
        if d in gdp_map:
            last_gdp = gdp_map[d]
        will = will_map.get(d)
        if will is not None and last_gdp and last_gdp > 0:
            result[d] = (will / last_gdp) * 100.0
    return result


def main():
    print('=== Bootstrap: Macro Indicators ===\n', flush=True)

    # 1. Shiller PE
    print('[1/3] Shiller PE (CAPE) from Yale', flush=True)
    cape_map = fetch_shiller_pe()
    if cape_map:
        save_csv(Path('assets/data/macro/SHILLER_PE.csv'), 'SHILLER_PE', cape_map)
    else:
        print('  Skipped (xlrd missing or fetch failed).', flush=True)

    time.sleep(1)

    # 2. Wilshire 5000 from FRED public
    print('\n[2/3] Wilshire 5000 (WILL5000INDFC) from FRED', flush=True)
    will_map = fetch_fred_public('WILL5000INDFC')
    save_csv(Path('assets/data/macro/WILL5000INDFC.csv'), 'WILL5000INDFC', will_map)

    time.sleep(1)

    # 3. GDP from FRED public
    print('\n[3/3] GDP from FRED public', flush=True)
    gdp_map = fetch_fred_public('GDP')
    save_csv(Path('assets/data/macro/GDP.csv'), 'GDP', gdp_map)

    # 4. Compute Buffett indicator
    print('\n[4/4] Computing Buffett Indicator', flush=True)
    buffett_map = compute_buffett(will_map, gdp_map)
    save_csv(Path('assets/data/macro/BUFFETT.csv'), 'BUFFETT', buffett_map)

    print('\nDone!', flush=True)


if __name__ == '__main__':
    main()
