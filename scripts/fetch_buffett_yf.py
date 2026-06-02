"""Fetch Wilshire 5000 + GDP proxy to compute Buffett Indicator via yfinance."""
import sys, csv
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, r'C:\Users\jjg04\AppData\Roaming\Python\Python314\Lib\site-packages')

import yfinance as yf

def to_quarterly_first(dt):
    """Snap date to first day of its quarter."""
    q_month = ((dt.month - 1) // 3) * 3 + 1
    return dt.replace(month=q_month, day=1)

print('Fetching Wilshire 5000 (^W5000)...', flush=True)
w5000 = yf.download('^W5000', start='1970-01-01', auto_adjust=True, progress=False)
print(f'  {len(w5000)} rows', flush=True)

# Handle MultiIndex columns from yfinance v0.2+
if hasattr(w5000.columns, 'levels'):
    close = w5000[('Close', '^W5000')]
else:
    close = w5000['Close']

w5000_q = close.resample('QE').last().dropna()
w5000_dict = {}
for dt, val in w5000_q.items():
    d = str(dt)[:10]
    w5000_dict[d] = float(val)

print(f'  Quarterly points: {len(w5000_dict)}', flush=True)

# Save as WILL5000INDFC placeholder (indexed values, not billions)
p = Path('assets/data/macro/WILL5000INDFC.csv')
p.parent.mkdir(parents=True, exist_ok=True)
with open(p, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['observation_date', 'WILL5000INDFC'])
    for d in sorted(w5000_dict):
        w.writerow([d, f'{w5000_dict[d]:.2f}'])
print(f'  Saved -> {p}', flush=True)

# For GDP, embed a lookup table from BEA (annual interpolated to quarterly)
# Real nominal GDP in billions of dollars, quarterly, from BEA NIPA table 1.1.5
# Source: https://apps.bea.gov/iTable - approximate values for key years
# We embed enough historic points; GitHub Actions will fill with FRED
gdp_approx = {
    '1971-01-01': 1090, '1972-01-01': 1207, '1973-01-01': 1385, '1974-01-01': 1501,
    '1975-01-01': 1635, '1976-01-01': 1825, '1977-01-01': 2031, '1978-01-01': 2296,
    '1979-01-01': 2563, '1980-01-01': 2789, '1981-01-01': 3128, '1982-01-01': 3253,
    '1983-01-01': 3536, '1984-01-01': 3932, '1985-01-01': 4213, '1986-01-01': 4453,
    '1987-01-01': 4736, '1988-01-01': 5100, '1989-01-01': 5482, '1990-01-01': 5734,
    '1991-01-01': 5931, '1992-01-01': 6244, '1993-01-01': 6558, '1994-01-01': 6948,
    '1995-01-01': 7342, '1996-01-01': 7753, '1997-01-01': 8211, '1998-01-01': 8700,
    '1999-01-01': 9268, '2000-01-01': 9952, '2001-01-01': 10286,'2002-01-01': 10642,
    '2003-01-01': 11142,'2004-01-01': 11853,'2005-01-01': 12623,'2006-01-01': 13377,
    '2007-01-01': 14029,'2008-01-01': 14292,'2009-01-01': 13974,'2010-01-01': 14499,
    '2011-01-01': 15218,'2012-01-01': 16155,'2013-01-01': 16692,'2014-01-01': 17393,
    '2015-01-01': 18121,'2016-01-01': 18625,'2017-01-01': 19391,'2018-01-01': 20612,
    '2019-01-01': 21381,'2020-01-01': 20893,'2021-01-01': 23315,'2022-01-01': 25462,
    '2023-01-01': 27361,'2024-01-01': 28269,'2025-01-01': 29200,
}

p2 = Path('assets/data/macro/GDP.csv')
with open(p2, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['observation_date', 'GDP'])
    for d in sorted(gdp_approx):
        w.writerow([d, gdp_approx[d]])
print(f'GDP approx saved -> {p2}', flush=True)

# Compute Buffett: W5000_index / GDP_billions * scale
# The Wilshire 5000 index ≈ total market cap in billions when scaled.
# Historical calibration: in 2021 W5000 was ~44000 and GDP was ~23300B -> ratio ~189%
# W5000 index level / GDP_B * 1000 ≈ Buffett% roughly (empirical calibration)
# More precisely: WILL5000INDFC (billions) = W5000_index * ~1.0 (approx match at modern era)
# We use scaling factor: scale = 1.0 (since W5000 full-cap index ≈ market cap in billions directly)
# Actually Wilshire5000 Full Cap Index points ≈ market cap in billions (designed that way)

all_dates = sorted(set(w5000_dict) | set(gdp_approx))
buffett = {}
last_gdp = None
for d in all_dates:
    if d in gdp_approx:
        last_gdp = gdp_approx[d]
    w = w5000_dict.get(d)
    if w and last_gdp and last_gdp > 0:
        # W5000 index level ≈ market cap in billions (Wilshire convention)
        buffett[d] = (w / last_gdp) * 100.0

p3 = Path('assets/data/macro/BUFFETT.csv')
with open(p3, 'w', newline='') as f:
    wr = csv.writer(f)
    wr.writerow(['observation_date', 'BUFFETT'])
    for d in sorted(buffett):
        wr.writerow([d, f'{buffett[d]:.4f}'])

print(f'Buffett: {len(buffett)} rows -> {p3}', flush=True)
print('Done!', flush=True)
