"""
Fetch OHLCV price data for a new/missing symbol and save to assets/data/stocks/{SYMBOL}.csv

Usage:
    python scripts/fetch_new_symbol.py SYMBOL [START_DATE]

    SYMBOL     : ticker (e.g. MSFT, COIN, SOL-USD)
    START_DATE : optional YYYY-MM-DD; defaults to earliest transaction date or 2015-01-01

The script auto-detects asset type:
    - Crypto (USD suffix or CoinGecko known IDs) → tries CoinGecko first, falls back to yfinance
    - Everything else → yfinance

Output columns match the existing stocks CSV format:
    date, open_price_usd, close_price_usd, adj_close_price_usd, total_volume_usd
"""
import csv
import sys
import os
from datetime import date, datetime
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance", flush=True)
    sys.exit(1)

OUTPUT_DIR = Path("assets/data/stocks")
FIELDNAMES = ["date", "open_price_usd", "close_price_usd", "adj_close_price_usd", "total_volume_usd"]
DEFAULT_START = "2015-01-01"

CRYPTO_SYMS = {"BTC", "ETH", "PEPE", "DOGE", "SOL", "ADA", "XRP", "AVAX", "MATIC", "LINK"}


def csv_path(symbol: str) -> Path:
    safe = symbol.replace("^", "").replace("/", "-")
    return OUTPUT_DIR / (safe + ".csv")


def read_existing_rows(symbol: str) -> dict[str, dict]:
    p = csv_path(symbol)
    if not p.exists():
        return {}
    with open(p, newline="") as f:
        return {r["date"].strip(): r for r in csv.DictReader(f) if r.get("date")}


def yf_ticker(symbol: str) -> str:
    """Convert bare crypto symbol to yfinance ticker (BTC → BTC-USD)."""
    s = symbol.upper()
    if s in CRYPTO_SYMS and not s.endswith("-USD"):
        return s + "-USD"
    return s


def fetch_yfinance(symbol: str, start: str) -> list[dict]:
    ticker = yf_ticker(symbol)
    print(f"  Fetching {ticker} from Yahoo Finance (start={start})…", flush=True)
    # auto_adjust=False: this site's other price data (update_stocks.py via
    # Alpha Vantage) is raw/un-adjusted, with splits handled explicitly via
    # a 'split' transaction event per portfolio (_applySplit in
    # portfolio/index.html) rather than a globally-rescaled price series.
    # auto_adjust=True retroactively multiplies EVERY pre-split historical
    # price by the split ratio to stay continuous with today's terms --
    # correct for a simple continuous chart, but wrong here: it corrupted
    # SPCE's 2020 prices by ~20x (its real 2024 reverse split), because a
    # position fully closed years before that split has no open lot for
    # _applySplit to adjust, so the retroactively-inflated price directly
    # became that position's (fake) market value for its whole holding
    # window. Keeping raw prices here matches the rest of the site and
    # keeps this script's other consumer (update_stocks.py's daily
    # incremental updates) internally consistent too.
    df = yf.Ticker(ticker).history(start=start, end=str(date.today()), auto_adjust=False)
    if df.empty:
        return []
    rows = []
    for idx, row in df.iterrows():
        d = idx.date() if hasattr(idx, "date") else datetime.strptime(str(idx)[:10], "%Y-%m-%d").date()
        rows.append({
            "date":                str(d),
            "open_price_usd":      round(float(row["Open"]),  4),
            "close_price_usd":     round(float(row["Close"]), 4),
            "adj_close_price_usd": round(float(row["Close"]), 4),
            "total_volume_usd":    int(row.get("Volume", 0)),
        })
    return rows


def write_csv_merged(symbol: str, new_rows: list[dict]) -> int:
    """Merge new_rows into whatever's already on disk (by date; new data
    wins on overlap) and rewrite the whole file, sorted. A plain append
    can only extend a file forward from its current last date -- it can't
    backfill a GAP in an existing file (e.g. one that was only ever
    fetched with a short recent window), so this always does a full
    read-merge-write instead. Returns how many dates are new vs. what was
    already on disk.
    """
    if not new_rows:
        return 0
    existing = read_existing_rows(symbol)
    before = len(existing)
    for r in new_rows:
        existing[r["date"]] = r
    merged = sorted(existing.values(), key=lambda r: r["date"])
    p = csv_path(symbol)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(p, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(merged)
    return len(merged) - before


def fetch_one(symbol: str, start: str | None) -> None:
    # Always fetches the full available history by default (not just
    # forward from whatever's already on disk) — this script's whole
    # purpose is backfilling/fixing a symbol, not incremental daily
    # updates (that's update_stocks.py's job). An existing file might
    # only cover a short recent window (e.g. its first-ever fetch never
    # got the full-history flag, or was compact-only) with no data at all
    # for whenever this account actually held the symbol; only ever
    # extending forward from the current last date could never backfill
    # that gap. write_csv_merged folds the freshly fetched range into
    # whatever's on disk (by date, new data wins), so this is safe to
    # re-run on an already-populated symbol too.
    effective_start = start or DEFAULT_START

    print(f"\n{'─'*50}", flush=True)
    print(f"  Symbol : {symbol}", flush=True)
    print(f"  Start  : {effective_start}", flush=True)
    print(f"{'─'*50}", flush=True)

    rows = fetch_yfinance(symbol, effective_start)

    if not rows:
        print(f"\n⚠️  Symbol `{symbol}` could not be found (possibly delisted or invalid ticker).", flush=True)
        print("   Skipping — no data written.", flush=True)
        return

    added = write_csv_merged(symbol, rows)

    if added == 0:
        print(f"\n✅ {symbol} is already up to date.", flush=True)
        return

    print(f"\n✅ `{symbol}` 데이터를 다운로드했습니다.", flush=True)
    print(f"📅 기간: {rows[0]['date']} ~ {rows[-1]['date']} (신규 {added}일치)", flush=True)
    print(f"📦 출처: Yahoo Finance (yfinance)", flush=True)
    print(f"💾 저장: {csv_path(symbol)}", flush=True)
    print(f"\n이제 해당 종목의 보유 현황 및 손익이 반영됩니다.", flush=True)

    # Append symbol to config/symbols.json if not already there
    import json
    config_path = Path("config/symbols.json")
    if config_path.exists():
        cfg = json.loads(config_path.read_text())
        stocks = cfg.get("stocks", [])
        if symbol not in stocks:
            stocks.append(symbol)
            stocks.sort()
            cfg["stocks"] = stocks
            config_path.write_text(json.dumps(cfg, indent=2) + "\n")
            print(f"📋 {symbol} added to config/symbols.json", flush=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/fetch_new_symbol.py SYMBOL[,SYMBOL,...] [START_DATE]")
        sys.exit(1)

    # Accepts one ticker or several, comma- and/or whitespace-separated
    # (e.g. "MSFT, UBER, BABA") — the GitHub Actions input is a single free
    # -text field, and typing several tickers into it (expecting a batch)
    # is the natural first thing to try there.
    raw_symbols = [s.strip().upper() for s in sys.argv[1].replace(',', ' ').split()]
    symbols = [s for s in raw_symbols if s]
    if not symbols:
        print("No valid symbols given.")
        sys.exit(1)
    start = sys.argv[2] if len(sys.argv) > 2 else None

    for symbol in symbols:
        fetch_one(symbol, start)


if __name__ == "__main__":
    main()
