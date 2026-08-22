"""
Detect whether the BTC rainbow chart's curated peak/trough story markers
(BTC_PEAKS / BTC_TROUGHS in crypto/index.html) have fallen behind the actual
price data in crypto/data/btc_daily.csv, and if so, emit a description of
what's missing so a follow-up job can research and write the new marker.

This is deliberately split from the writing step: this script only does
mechanical, deterministic detection (no LLM judgment) so the decision of
"is there a gap" can't hallucinate. The actual research + narrative writing
is left to a claude-code-action step conditioned on this script's output.

Usage: python scripts/check_btc_marker_gap.py
Writes GitHub Actions outputs (gap_found, gap_json) to $GITHUB_OUTPUT if set,
otherwise prints them to stdout for local testing.
"""
import csv
import json
import os
import re
from pathlib import Path

CSV_PATH = Path("crypto/data/btc_daily.csv")
HTML_PATH = Path("crypto/index.html")

# A candidate marker must be at least this many days "settled" (i.e. the
# extremum isn't still actively being made day-over-day) before we treat it
# as a real local peak/trough worth writing up -- otherwise every single new
# all-time high would fire on the day it happens, before there's a real
# story to research.
SETTLE_DAYS = 10
# Minimum move (as a fraction) from the reference marker to avoid flagging
# routine noise as a new cycle-level peak/trough.
MIN_MOVE_FRAC = 0.12
# Don't flag a new marker within this many days of an existing marker of the
# same type -- avoids re-flagging something a human/agent already handled
# under a slightly different date bucket.
MIN_GAP_DAYS_FROM_SAME_TYPE = 25


def load_prices():
    rows = []
    with open(CSV_PATH, newline="") as f:
        for r in csv.DictReader(f):
            try:
                rows.append((r["date"], float(r["open_price_usd"])))
            except (KeyError, ValueError):
                continue
    rows.sort(key=lambda x: x[0])
    return rows


def load_existing_markers():
    src = HTML_PATH.read_text(encoding="utf-8")
    peaks_block = re.search(r"const BTC_PEAKS = \[(.*?)\]\.map\(m=>\(\{\.\.\.m,type:'peak'\}\)\);", src, re.S)
    troughs_block = re.search(r"const BTC_TROUGHS = \[(.*?)\]\.map\(m=>\(\{\.\.\.m,type:'trough'\}\)\);", src, re.S)
    entry_re = re.compile(r"\{date:'(\d{4}-\d{2})',price:([\d.]+)")

    def parse(block):
        if not block:
            return []
        return [(m.group(1), float(m.group(2))) for m in entry_re.finditer(block.group(1))]

    return sorted(parse(peaks_block)), sorted(parse(troughs_block))


def days_between(d1, d2):
    from datetime import date
    y1, m1 = int(d1[:4]), int(d1[5:7])
    y2, m2 = int(d2[:4]), int(d2[5:7])
    return abs((date(y2, m2, 1) - date(y1, m1, 1)).days)


def find_gap(prices, peaks, troughs):
    """Returns a dict describing one detected gap, or None."""
    if not prices:
        return None
    last_date, last_price = prices[-1]

    all_markers = sorted(
        [(d, p, "peak") for d, p in peaks] + [(d, p, "trough") for d, p in troughs]
    )
    if not all_markers:
        return None
    ref_date, ref_price, ref_type = all_markers[-1]

    # Walk forward from the reference marker's month to find the actual
    # extremum day in the raw daily series (markers are stored as YYYY-MM,
    # so approximate the reference date as the 1st of that month).
    ref_date_full = ref_date + "-01"
    window = [(d, p) for d, p in prices if d > ref_date_full]
    if not window:
        return None

    if ref_type == "peak":
        # Looking for a new trough since the last peak.
        cand_date, cand_price = min(window, key=lambda x: x[1])
        move = (ref_price - cand_price) / ref_price
        candidate_type = "trough"
        existing_same_type = troughs
    else:
        # Looking for a new peak since the last trough.
        cand_date, cand_price = max(window, key=lambda x: x[1])
        move = (cand_price - ref_price) / ref_price
        candidate_type = "peak"
        existing_same_type = peaks

    if move < MIN_MOVE_FRAC:
        return None

    settle_days = (
        __import__("datetime").date.fromisoformat(last_date)
        - __import__("datetime").date.fromisoformat(cand_date)
    ).days
    if settle_days < SETTLE_DAYS:
        return None  # still might be actively extending; wait

    cand_month = cand_date[:7]
    for d, _p in existing_same_type:
        if days_between(d, cand_month) * 1 < MIN_GAP_DAYS_FROM_SAME_TYPE:
            return None  # already have a marker close to this

    # Does this candidate supersede an existing same-type marker that falls
    # chronologically between the reference marker and now, and is now less
    # extreme than the candidate? (E.g. a Feb trough superseded by a lower
    # July trough with no intervening peak.)
    supersedes = None
    for d, p in existing_same_type:
        if d > ref_date:
            if (candidate_type == "trough" and p > cand_price) or (
                candidate_type == "peak" and p < cand_price
            ):
                supersedes = {"date": d, "price": p}

    return {
        "type": candidate_type,
        "date": cand_month,
        "price": round(cand_price, 2),
        "reference_marker": {"date": ref_date, "price": ref_price, "type": ref_type},
        "supersedes": supersedes,
    }


def main():
    prices = load_prices()
    peaks, troughs = load_existing_markers()
    gap = find_gap(prices, peaks, troughs)

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gap:
        payload = json.dumps(gap)
        print(f"Gap detected: {payload}")
        if gh_out:
            with open(gh_out, "a") as f:
                f.write("gap_found=true\n")
                f.write(f"gap_json={payload}\n")
        else:
            print("gap_found=true")
    else:
        print("No marker gap detected.")
        if gh_out:
            with open(gh_out, "a") as f:
                f.write("gap_found=false\n")
        else:
            print("gap_found=false")


if __name__ == "__main__":
    main()
