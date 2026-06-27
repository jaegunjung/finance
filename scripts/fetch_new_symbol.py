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


def read_last_date(symbol: str) -> str:
    p = csv_path(symbol)
    if not p.exists():
        return DEFAULT_START
    with open(p, newline="") as f:
        rows = list(csv.DictReader(f))
    return rows[-1]["date"].strip() if rows else DEFAULT_START


def yf_ticker(symbol: str) -> str:
    """Convert bare crypto symbol to yfinance ticker (BTC → BTC-USD)."""
    s = symbol.upper()
    if s in CRYPTO_SYMS and not s.endswith("-USD"):
        return s + "-USD"
    return s


def fetch_yfinance(symbol: str, start: str) -> list[dict]:
    ticker = yf_ticker(symbol)
    print(f"  Fetching {ticker} from Yahoo Finance (start={start})…", flush=True)
    df = yf.Ticker(ticker).history(start=start, end=str(date.today()), auto_adjust=True)
    if df.empty:
        return []
    rows = []
    for idx, row in df.iterrows():
        d = idx.date() if hasattr(idx, "date") else datetime.strptime(str(idx)[:10], "%Y-%m-%d").date()
        rows.append({
            "date":                str(d),
            "open_price_usd":      round(float(row["Open"]),   4),
            "close_price_usd":     round(float(row["Close"]),  4),
            "adj_close_price_usd": round(float(row["Close"]),  4),
            "total_volume_usd":    int(row.get("Volume", 0)),
        })
    return rows


def write_csv(symbol: str, rows: list[dict], append: bool = False) -> int:
    if not rows:
        return 0
    rows.sort(key=lambda r: r["date"])
    p = csv_path(symbol)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mode = "a" if append and p.exists() else "w"
    write_header = not (append and p.exists())
    with open(p, mode, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/fetch_new_symbol.py SYMBOL [START_DATE]")
        sys.exit(1)

    symbol   = sys.argv[1].upper()
    start    = sys.argv[2] if len(sys.argv) > 2 else None
    last_date = read_last_date(symbol)
    effective_start = start or last_date

    print(f"\n{'─'*50}", flush=True)
    print(f"  Symbol : {symbol}", flush=True)
    print(f"  Start  : {effective_start}", flush=True)
    print(f"{'─'*50}", flush=True)

    rows = fetch_yfinance(symbol, effective_start)

    if not rows:
        print(f"\n⚠️  Symbol `{symbol}` could not be found.", flush=True)
        print("   Please verify the ticker and try again.", flush=True)
        sys.exit(1)

    # Filter rows already in CSV
    existing_end = read_last_date(symbol)
    new_rows = [r for r in rows if r["date"] > existing_end] if existing_end != DEFAULT_START else rows

    if not new_rows:
        print(f"\n✅ {symbol} is already up to date ({existing_end}).", flush=True)
        sys.exit(0)

    written = write_csv(symbol, new_rows, append=(existing_end != DEFAULT_START))

    print(f"\n✅ `{symbol}` 데이터를 다운로드했습니다.", flush=True)
    print(f"📅 기간: {new_rows[0]['date']} ~ {new_rows[-1]['date']} ({written}일치)", flush=True)
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


if __name__ == "__main__":
    main()
