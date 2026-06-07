---
layout: post
title: "How I Read a Chart: The JJ Analysis Process, Step by Step"
title_en: "How I Read a Chart: The JJ Analysis Process, Step by Step"
title_ko: "내가 차트를 읽는 방법 — JJ Analysis 분석 프로세스 공개"
date: 2026-08-17
categories: methodology
tags: [methodology, chart-analysis, log-scale, process, JJ-analysis, how-to]
excerpt: "A complete walkthrough of the JJ Analysis process — from raw data to publishable insight. The exact workflow I use for every chart on this site."
excerpt_en: "A complete walkthrough of the JJ Analysis process — from raw data to publishable insight. The exact workflow I use for every chart on this site."
excerpt_ko: "JJ Analysis 프로세스의 완전한 단계별 설명 — 원시 데이터에서 발행 가능한 인사이트까지. 이 사이트의 모든 차트에 사용하는 정확한 워크플로."
---

<div class="en-only" markdown="1">

## Why Transparency Matters

The most dangerous analysis is the kind where you can't see the inputs. A chart with a conclusion but no methodology is just an assertion with graphics. This post lays out exactly how I build every chart and analysis you see on this site — so you can verify it, critique it, or build on it.

## Step 1: Define the Question First

Before touching data, I write out the specific question I'm trying to answer.

Not "let me look at Bitcoin" — that's exploration without purpose. The question should be:
- "Is Bitcoin currently above or below its historical post-halving pattern at month 14?"
- "Has the S&P 500 ever traded at this valuation level without being followed by a recession within 18 months?"
- "When the yield curve un-inverted in prior cycles, how long until the recession began?"

A specific question determines what data I need, what time range is relevant, and what would constitute a meaningful answer. Without a question, data exploration produces confirmation of whatever you already believe.

## Step 2: Source the Data

Every chart I publish uses primary source data. For equities:
- **Yahoo Finance / Bloomberg** for price data
- **FRED (Federal Reserve Economic Data)** for macroeconomic series (CPI, unemployment, yield curve, M2)
- **CoinGecko / Glassnode** for crypto price and on-chain data

I document the source and date of retrieval for every dataset. This is not bureaucracy — it's reproducibility. If my chart shows something different from another analyst's chart on the same data, the source comparison is the starting point for resolving the discrepancy.

## Step 3: Log-Transform the Price Series

For any price series spanning more than 2–3 years, I immediately log-transform. This is not optional — it's structural.

The log transformation converts percentage changes into equal visual distances. A 50% drawdown in 1974 and a 50% drawdown in 2008 look identical on a log chart. On a linear chart, the 2008 drawdown is visually 10x larger because the nominal price was higher.

All regression fitting (Step 5) is done on log-transformed data.

## Step 4: Establish the Time Range

Time range choice dramatically affects what a chart shows. A common manipulation technique in financial media is selecting a start date that makes one interpretation look better than another.

My default: use the maximum available data. For the S&P 500, that means 1927. For Bitcoin, 2013 (when price data becomes meaningful). For specific macro series, whatever FRED provides.

When I use a shorter time range (e.g., post-2013 for Bitcoin), I state why: either data quality before that point is suspect, or the asset fundamentally changed (pre-Satoshi Bitcoin ≠ institutional-era Bitcoin).

## Step 5: Fit the Trend Line

For long-term analysis, I fit a log-linear regression to the price series. This is a simple ordinary least squares (OLS) regression of log(price) on time.

The resulting trend line represents the *constant growth rate* that best explains the long-run price trajectory. Deviations from this line — measured in standard deviations — are the primary analytical output.

For channel construction, I identify:
- **Upper boundary:** drawn through the highest notable peaks (not all-time highest, but significant cycle tops)
- **Lower boundary:** drawn through the lowest notable troughs

The distinction between a data-fit trend line and a hand-drawn one: the trend line is reproducible by anyone with the same dataset. A hand-drawn line depends on artistic judgment.

## Step 6: Measure the Current Position

Given the trend line and channel boundaries, where does current price sit?

I express this as:
- **Percentage above/below trend** (e.g., "currently 45% above the log-linear trend")
- **Channel percentile** (e.g., "currently in the 75th percentile of the channel range")
- **Standard deviations from trend** (e.g., "+1.2 standard deviations above trend")

All three expressions communicate the same thing differently. The percentage form is most intuitive for non-technical readers. The standard deviation form is most useful for comparing across different assets (e.g., "S&P 500 at +1.2 SD" vs. "Bitcoin at +0.8 SD" allows cross-asset comparison).

## Step 7: Apply Cycle Context

A price position means more when combined with cycle context. I overlay:
- For equity analysis: NBER recession bands, Fed rate cycle phases, major events
- For Bitcoin analysis: halving dates, post-halving day count, prior cycle overlays

Cycle overlays don't predict the future — they contextualize the present. "Currently at +1.2 SD above trend, month 14 of the halving cycle" is a more complete statement than either alone.

## Step 8: State the Interpretation and the Falsification Condition

Every analysis ends with:
1. What the data suggests
2. What would need to be true for that interpretation to be wrong

The second part is as important as the first. An interpretation without a falsification condition is a belief, not an analysis.

Example:
- "The data suggests we are in a mid-cycle correction, not a cycle top."
- "This interpretation is wrong if: MVRV exceeds 6, or the 200WMA breaks, or the halving cycle reaches month 24+ without a new ATH."

These conditions are checkable. If they occur, the interpretation is updated. The data leads; the narrative follows.

## The Tools I Use

- **Python (pandas, numpy, matplotlib)** for data processing and chart generation
- **FRED API** for macroeconomic data retrieval
- **CoinGecko API** for crypto price data
- **Google Sheets** for quick data exploration and client-ready tables

Everything is reproducible from public data sources. Nothing I publish requires proprietary data or paid terminals.

## An Invitation

If you want to replicate any analysis, verify any chart, or challenge any conclusion on this site — I welcome it. Transparent analysis isn't just a methodology choice; it's a philosophical commitment.

Send me your chart. Show me where I'm wrong. That's how the analysis gets better.

*All content represents personal research and opinion. Not investment advice.*

</div>

<div class="ko-only" markdown="1">

## 투명성이 중요한 이유

가장 위험한 분석은 입력값을 볼 수 없는 종류다. 방법론 없는 결론이 있는 차트는 그래픽이 있는 주장일 뿐이다.

## 1단계: 먼저 질문 정의

데이터를 건드리기 전에 답하려는 구체적인 질문을 작성한다. "비트코인을 보자"가 아니라 — "14개월째에 비트코인은 역사적 반감기 후 패턴 위에 있나 아래에 있나?"

질문이 없으면 데이터 탐색은 이미 믿고 있는 것의 확인으로 끝난다.

## 2단계: 데이터 소싱

모든 차트는 1차 소스 데이터를 사용한다:
- 주식 가격: Yahoo Finance
- 매크로 데이터: FRED (연준 경제 데이터)
- 크립토: CoinGecko / Glassnode

모든 데이터셋에 대해 소스와 검색 날짜를 문서화한다.

## 3단계: 로그 변환

2~3년 이상의 가격 시계열은 즉시 로그 변환한다. 모든 회귀 피팅은 로그 변환된 데이터로 한다.

## 4단계: 시간 범위 설정

기본값: 가용한 최대 데이터 사용. 더 짧은 범위를 사용할 때는 이유를 명시한다.

## 5단계: 추세선 피팅

로그-선형 회귀(OLS)를 사용해 가격 시계열에 추세선을 피팅한다. 결과 추세선은 장기 가격 궤도를 가장 잘 설명하는 *일정한 성장률*을 나타낸다. 손으로 그린 선과의 차이: 이 추세선은 동일한 데이터셋을 가진 누구나 재현 가능하다.

## 6단계: 현재 위치 측정

세 가지 형식으로 표현한다:
- 추세 대비 퍼센트 (예: "현재 로그-선형 추세 위 45%")
- 채널 백분위수 (예: "채널 범위의 75번째 백분위수")
- 표준편차 (예: "추세 위 +1.2 표준편차")

## 7단계: 사이클 맥락 적용

가격 위치는 사이클 맥락과 결합될 때 더 의미 있다: 주식은 경기침체 밴드, 연준 사이클 단계; 비트코인은 반감기 날짜, 사이클 오버레이.

## 8단계: 해석과 반증 조건 명시

모든 분석은 다음으로 끝난다:
1. 데이터가 시사하는 것
2. 그 해석이 틀리려면 무엇이 사실이어야 하는지

반증 조건 없는 해석은 분석이 아닌 신념이다.

## 사용 도구

Python (pandas, numpy, matplotlib), FRED API, CoinGecko API, Google Sheets. 모든 것이 공개 데이터 소스에서 재현 가능하다.

*모든 콘텐츠는 개인적인 리서치와 의견입니다. 투자 권유가 아닙니다.*

</div>
