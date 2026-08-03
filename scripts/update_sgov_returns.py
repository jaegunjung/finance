"""
Update assets/data/sgov_annual_returns.json with SGOV's real year-by-year
total return (dividend-reinvested).

Why this exists: SGOV (iShares 0-3 Month Treasury Bond ETF) has a
deliberately flat NAV — almost all of its return is monthly dividend
income. This site's own stock CSVs (assets/data/stocks/*.csv, via Alpha
Vantage's free tier) aren't dividend-adjusted, so SGOV's price alone can't
represent its real return. portfolio/index.html builds a synthetic SGOV
NAV series for the portfolio-analysis benchmark by compounding the annual
total returns in this file day-by-day; this script keeps that data current
automatically instead of it being hand-edited.

yfinance's auto_adjust=True gives dividend-adjusted close prices for free
(no API key), which Alpha Vantage's free tier does not.

Run via GitHub Actions (update_stocks.yml) or manually:
    python scripts/update_sgov_returns.py
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

import yfinance as yf

OUTPUT_PATH = Path('assets/data/sgov_annual_returns.json')
TICKER = 'SGOV'
START = '2020-01-01'  # SGOV launched 2020-05-26; partial-year return is fine


def main():
    hist = yf.Ticker(TICKER).history(start=START, auto_adjust=True)
    if hist.empty:
        print('ERROR: no data returned from yfinance.', flush=True)
        raise SystemExit(1)

    hist = hist.tz_localize(None)
    hist.index = hist.index.date

    years = sorted({d.year for d in hist.index})
    current_year = datetime.now(timezone.utc).year

    annual = {}
    ytd = None
    for yr in years:
        yr_data = hist[(hist.index >= date(yr, 1, 1)) & (hist.index <= date(yr, 12, 31))]
        if len(yr_data) < 2:
            continue
        ret = float(yr_data['Close'].iloc[-1] / yr_data['Close'].iloc[0] - 1)
        as_of = yr_data.index[-1].isoformat()
        if yr == current_year:
            ytd = {'year': yr, 'asOf': as_of, 'ret': round(ret, 6)}
        else:
            annual[str(yr)] = round(ret, 6)

    out = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'annual': annual,
        'ytd': ytd,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(out, f, indent=2)
        f.write('\n')

    print(f'Wrote {OUTPUT_PATH}: {len(annual)} closed year(s) + YTD={ytd}', flush=True)


if __name__ == '__main__':
    main()
