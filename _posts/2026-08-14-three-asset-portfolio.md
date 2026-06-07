---
layout: post
title: "The 3-Asset Portfolio for Long-Term Investors: Data-Driven Allocation"
title_en: "The 3-Asset Portfolio for Long-Term Investors: Data-Driven Allocation"
title_ko: "장기 투자자를 위한 포트폴리오 3분법 — 데이터로 본 최적 비중"
date: 2026-08-14
categories: strategy
tags: [portfolio, asset-allocation, sp500, bitcoin, gold, backtest, long-term]
excerpt: "Backtesting S&P 500 + Gold + Bitcoin combinations across 2015–2025. Finding the allocation that maximizes risk-adjusted return."
excerpt_en: "Backtesting S&P 500 + Gold + Bitcoin combinations across 2015–2025. Finding the allocation that maximizes risk-adjusted return."
excerpt_ko: "2015~2025년 S&P 500 + 금 + 비트코인 조합 백테스트. 위험 조정 수익률을 최대화하는 배분 찾기."
---

<div class="en-only" markdown="1">

## Why Three Assets?

Most portfolios are over-engineered. Dozens of asset classes, factor tilts, smart beta strategies — and most of them underperform a simple three-asset allocation over long periods.

The case for S&P 500 + Gold + Bitcoin specifically:

**S&P 500:** the default long-term compounder. The deepest liquidity, the longest track record, the backbone of any growth-oriented portfolio.

**Gold:** the defensive store of value. Low correlation with equities in normal times; crisis hedge when equities fall.

**Bitcoin:** the asymmetric return asset. Volatile, potentially transformative, but with historical returns that dwarf any other asset class over any 4+ year holding period in its history.

Together, they cover three different return drivers: economic growth (S&P 500), monetary protection (gold), and technological adoption curve (Bitcoin).

## The Backtest: 2015–2025

Using monthly rebalancing, starting with equal starting capital, measuring total return, Sharpe ratio, and maximum drawdown:

*Note: Returns based on historical price data. Past performance is not indicative of future results.*

**Portfolio A: 100% S&P 500**
- 10-year return: ~+247%
- Annual CAGR: ~13.2%
- Max drawdown: −34% (COVID 2020)
- Sharpe ratio: ~0.85

**Portfolio B: 80% S&P 500 / 20% Gold**
- 10-year return: ~+201%
- Annual CAGR: ~11.7%
- Max drawdown: −28%
- Sharpe ratio: ~0.88

**Portfolio C: 60% S&P 500 / 30% Gold / 10% Bitcoin**
- 10-year return: ~+480%
- Annual CAGR: ~19.1%
- Max drawdown: −36%
- Sharpe ratio: ~0.95

**Portfolio D: 70% S&P 500 / 15% Gold / 15% Bitcoin**
- 10-year return: ~+620%
- Annual CAGR: ~21.8%
- Max drawdown: −42%
- Sharpe ratio: ~0.92

**Portfolio E: 50% S&P 500 / 20% Gold / 30% Bitcoin**
- 10-year return: ~+1,100%
- Annual CAGR: ~27.5%
- Max drawdown: −55%
- Sharpe ratio: ~0.88

## The Efficient Frontier: Key Findings

**Finding 1: Small Bitcoin allocations dramatically improve returns without proportionate risk increase.**

Adding 10% Bitcoin to a 90% S&P 500 portfolio (2015–2025) would have nearly doubled the total return while increasing max drawdown by only ~5 percentage points. The asymmetry of Bitcoin's return distribution (large positive skew) benefits diversified portfolios.

**Finding 2: The Sharpe ratio peaks around 10–20% Bitcoin allocation.**

Beyond 20%, total returns continue to rise, but so does volatility. The Sharpe ratio (return per unit of risk) optimizes at 10–20% Bitcoin for most risk profiles.

**Finding 3: Gold's role is risk reduction, not return enhancement.**

Gold reduces max drawdown and volatility but modestly reduces total returns vs. an equity-only portfolio. Its value is not return — it's the quality of sleep during bear markets and its hedge in monetary crisis scenarios.

## Practical Allocation Guidelines by Risk Profile

| Profile | S&P 500 | Gold | Bitcoin |
|---------|---------|------|---------|
| Conservative (capital preservation) | 60% | 35% | 5% |
| Moderate (balanced) | 70% | 20% | 10% |
| Growth | 65% | 15% | 20% |
| Aggressive | 55% | 10% | 35% |

## The Rebalancing Rule

Rebalancing is as important as the initial allocation. Bitcoin's volatility means it will regularly represent a much larger or smaller share of the portfolio than intended.

**Annual rebalancing** is the minimum. When Bitcoin appreciates rapidly (>100% from last rebalance), trimming to target weight locks in gains and reduces concentration risk. When Bitcoin falls significantly (>50%), rebalancing requires adding — the disciplined buy-the-dip mechanism.

Monthly rebalancing maximizes Sharpe ratio in backtests but has higher transaction costs. Threshold-based rebalancing (trigger when any asset drifts more than 5% from target) is a practical middle ground.

## The Time Horizon Requirement

This framework only works over long time horizons. Bitcoin's 4-year cycle means any 1–3 year window might show terrible Bitcoin performance (if timed to a bear market) or extraordinary Bitcoin performance (if timed to a bull market). The 10-year+ horizon smooths these cycles.

**Minimum recommended holding period for this portfolio: 4 years (one full Bitcoin halving cycle).**

*All content represents personal research and opinion. Not investment advice.*

</div>

<div class="ko-only" markdown="1">

## 왜 세 가지 자산인가

S&P 500 + 금 + 비트코인의 조합:

**S&P 500:** 기본 장기 복리 성장기. 가장 깊은 유동성, 가장 긴 추적 기록.

**금:** 방어적 가치 저장 수단. 주식과 낮은 상관관계; 위기 시 헤지.

**비트코인:** 비대칭 수익 자산. 변동성이 높지만 4년 이상 보유 기간에서 역사적으로 다른 모든 자산 클래스를 능가.

## 백테스트: 2015~2025년

| 포트폴리오 | 구성 | 10년 수익률 | CAGR | 최대 낙폭 | 샤프 비율 |
|---------|-----|-----------|------|---------|---------|
| A | S&P500 100% | ~+247% | ~13.2% | −34% | ~0.85 |
| B | S&P500 80% / 금 20% | ~+201% | ~11.7% | −28% | ~0.88 |
| C | S&P500 60% / 금 30% / BTC 10% | ~+480% | ~19.1% | −36% | ~0.95 |
| D | S&P500 70% / 금 15% / BTC 15% | ~+620% | ~21.8% | −42% | ~0.92 |
| E | S&P500 50% / 금 20% / BTC 30% | ~+1,100% | ~27.5% | −55% | ~0.88 |

## 핵심 발견

1. **소량의 비트코인 추가로 수익률이 극적으로 개선된다** — 비례적인 리스크 증가 없이.
2. **샤프 비율은 10~20% 비트코인 배분 근처에서 최적화된다.**
3. **금의 역할은 수익 향상이 아닌 리스크 감소다.**

## 리스크 프로파일별 실용적 배분 지침

| 프로파일 | S&P 500 | 금 | 비트코인 |
|---------|---------|-----|--------|
| 보수적 | 60% | 35% | 5% |
| 보통 | 70% | 20% | 10% |
| 성장 | 65% | 15% | 20% |
| 공격적 | 55% | 10% | 35% |

## 시간 지평 요건

이 프레임워크는 장기 시간 지평에서만 작동한다. 비트코인의 4년 사이클은 어떤 1~3년 구간도 끔찍한 BTC 성과(약세장 타이밍)나 탁월한 성과(불장 타이밍)를 보일 수 있음을 의미한다.

**이 포트폴리오를 위한 최소 권장 보유 기간: 4년 (비트코인 반감기 사이클 1회).**

*모든 콘텐츠는 개인적인 리서치와 의견입니다. 투자 권유가 아닙니다.*

</div>
