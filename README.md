# 📊 JJ Financial Analysis

> **Live Site → [jaegunjung.github.io/finance](https://jaegunjung.github.io/finance/)**
>
> S&P 500 · Bitcoin · Crypto · Stocks · Interest Rates · Macro Indicators

---

## 🗺️ System Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                                 │
│                      jaegunjung/finance  (main)                           │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐ │
│  │  Jekyll Site     │  │   scripts/       │  │  .github/workflows/     │ │
│  │  (HTML/CSS/JS    │  │   (Python)       │  │  (GitHub Actions)       │ │
│  │   + Liquid)      │  │                  │  │                         │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬────────────┘ │
│           └────────────────────┴────────────────────────── ┘             │
└───────────────────────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
 ┌─────────────────┐      ┌──────────────────────────┐
 │  GitHub Pages   │      │  External Data APIs       │
 │  (Static Host)  │      │                           │
 │                 │      │  ① Alpha Vantage          │
 │  jaegunjung     │      │    (주식 일봉 데이터)      │
 │  .github.io/    │      │                           │
 │  finance/       │      │  ② Yahoo Finance (yfinance)│
 └────────┬────────┘      │    (S&P 500 월봉)          │
          │               │                           │
          │               │  ③ FRED API               │
          │               │    (연방기금금리/국채수익률)│
          │               └──────────────────────────┘
          │
          ▼
 ┌─────────────────────────────────────┐
 │         Visitor / Browser           │
 │                                     │
 │  ┌───────────────────────────────┐  │
 │  │       Supabase                │  │
 │  │  • Google OAuth 로그인        │  │
 │  │  • Email Magic Link 로그인    │  │
 │  │  • 댓글 저장 (PostgreSQL)     │  │
 │  │  • RLS (Row Level Security)   │  │
 │  └───────────────────────────────┘  │
 └─────────────────────────────────────┘
```

---

## 🌐 Website Structure (`jaegunjung.github.io/finance/`)

Jekyll 정적 사이트 생성기로 빌드, GitHub Pages로 호스팅.

```
jaegunjung.github.io/finance/
│
├── /                    → 홈 (연간 수익률 테이블 + 주요 차트 링크)
│
├── /stock/              → S&P 500 장기 차트 (^GSPC, 1927–현재, 월봉)
│   ├── /stock/dji/      → Dow Jones (^DJI)
│   ├── /stock/qqq/      → QQQ (Nasdaq-100)
│   ├── /stock/vfiax/    → VFIAX (Vanguard S&P 500 Fund)
│   ├── /stock/aapl/     → Apple
│   ├── /stock/nvda/     → NVIDIA
│   ├── /stock/meta/     → Meta
│   ├── /stock/goog/     → Alphabet
│   ├── /stock/amzn/     → Amazon
│   ├── /stock/tsla/     → Tesla
│   └── /stock/envx/     → Enovix
│
├── /crypto/             → Bitcoin 장기 차트 (로그 스케일 · 레인보우 · 반감기)
│   ├── /crypto/eth/     → Ethereum
│   └── /crypto/pepe/    → PEPE
│
├── /rates/              → 금리 vs S&P 500 (Fed Funds Rate · 10Y Treasury)
│
├── /blog/               → 분석 블로그 (Jekyll _posts + Supabase 댓글)
│
└── /about/              → 소개 페이지
```

### UI/UX 특징
- 🌙 **다크 테마** — CSS 변수 시스템 (`var(--bg-card)`, `var(--accent-blue)` 등)
- 🌐 **한/영 전환** — `localStorage`에 언어 저장, 새로고침 없이 즉시 전환
- 📱 **반응형** — 햄버거 메뉴, 드롭다운 네비게이션
- 📈 **Canvas + SVG 차트** — 외부 차트 라이브러리 없이 순수 JS 구현
- 💬 **댓글 시스템** — Supabase 기반 (블로그 포스트에 적용)

---

## 🗂️ 레포지토리 폴더 구조

```
finance/
├── .github/
│   └── workflows/
│       ├── deploy.yml           ← Jekyll 빌드 & GitHub Pages 배포
│       ├── update-data.yml      ← S&P 500 월봉 자동 업데이트 (Yahoo Finance)
│       ├── update_stocks.yml    ← 주식 일봉 자동 업데이트 (Alpha Vantage)
│       └── update_macro.yml     ← 거시경제 지표 자동 업데이트 (FRED)
│
├── _includes/
│   ├── nav.html                 ← 전체 네비게이션 바 (주식·크립토 드롭다운)
│   ├── footer.html
│   └── comments.html           ← 댓글 섹션 템플릿 (Supabase 연동)
│
├── _layouts/
│   ├── default.html             ← 기본 HTML 레이아웃 (한/영 스크립트 포함)
│   └── post.html                ← 블로그 포스트 레이아웃 (댓글 include)
│
├── _posts/                      ← 블로그 포스트 (Markdown)
│
├── assets/
│   ├── css/main.css             ← 전역 스타일 (다크 테마, CSS 변수)
│   ├── js/
│   │   └── comments.js          ← Supabase 댓글 시스템 (Auth + CRUD)
│   └── data/
│       ├── sp500_monthly.csv    ← S&P 500 월봉 (update-data.yml 이 업데이트)
│       ├── stocks/              ← 종목별 일봉 CSV (update_stocks.yml 이 업데이트)
│       │   ├── GSPC.csv         ← (^GSPC → ^ 제거된 파일명)
│       │   ├── AAPL.csv
│       │   ├── NVDA.csv
│       │   └── ... (symbols.json 에 정의된 모든 종목)
│       └── macro/
│           ├── FEDFUNDS.csv     ← 연방기금금리 (FRED)
│           ├── DGS10.csv        ← 10년 국채 수익률 (FRED)
│           └── SP500.csv        ← FRED의 S&P 500 데이터
│
├── scripts/
│   ├── update_sp500.py          ← Yahoo Finance에서 S&P 500 월봉 수집
│   ├── update_stocks.py         ← Alpha Vantage에서 주식 일봉 수집
│   └── update_macro.py          ← FRED API로 금리/국채 데이터 수집
│
├── config/
│   └── symbols.json             ← 수집할 종목 목록 정의
│
├── stock/                       ← 주식 차트 페이지들
├── crypto/                      ← 크립토 차트 페이지들
├── rates/                       ← 금리 차트 페이지
├── finance/                     ← 금리 vs S&P 500 비교 차트
├── blog/                        ← 블로그 목록 페이지
│
├── _config.yml                  ← Jekyll 설정 (title, baseurl, plugins)
├── Gemfile                      ← Ruby 의존성
└── index.html                   ← 홈 페이지
```

---

## 🤖 GitHub Actions 자동화 워크플로우

### 전체 플로우

```
 GitHub Actions
 ┌────────────────────────────────────────────────────────────────────┐
 │                                                                    │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  deploy.yml                                                  │  │
 │  │  트리거: main 브랜치에 push 될 때마다 (자동 + 수동)          │  │
 │  │                                                              │  │
 │  │  1. actions/checkout@v4                                      │  │
 │  │  2. ruby/setup-ruby@v1  (Ruby 3.3)                           │  │
 │  │  3. bundle exec jekyll build                                 │  │
 │  │  4. actions/upload-pages-artifact@v3                         │  │
 │  │  5. actions/deploy-pages@v4  ──────────────► GitHub Pages   │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 │                                                                    │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  update-data.yml  ·  S&P 500 월봉                            │  │
 │  │  스케줄: 매일 06:00 UTC  (+ 수동 실행 가능)                  │  │
 │  │                                                              │  │
 │  │  pip install yfinance pandas                                 │  │
 │  │  python scripts/update_sp500.py                              │  │
 │  │    └── Yahoo Finance (^GSPC) → sp500_monthly.csv 업데이트    │  │
 │  │  git commit & push  →  deploy.yml 자동 트리거               │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 │                                                                    │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  update_stocks.yml  ·  주식 일봉                             │  │
 │  │  스케줄: 월~금 01:00 UTC  (장 마감 후, + 수동 실행 가능)     │  │
 │  │                                                              │  │
 │  │  pip install requests                                        │  │
 │  │  python scripts/update_stocks.py                             │  │
 │  │    └── Alpha Vantage TIME_SERIES_DAILY_ADJUSTED              │  │
 │  │        config/symbols.json 에 정의된 종목 순회               │  │
 │  │        assets/data/stocks/{SYMBOL}.csv 업데이트              │  │
 │  │  ⚠️  ALPHA_VANTAGE_API_KEY → GitHub Secrets 에서 주입       │  │
 │  │  git commit & push  →  deploy.yml 자동 트리거               │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 │                                                                    │
 │  ┌──────────────────────────────────────────────────────────────┐  │
 │  │  update_macro.yml  ·  거시경제 지표                          │  │
 │  │  스케줄: 월~금 02:00 UTC  (+ 수동 실행 가능)                 │  │
 │  │                                                              │  │
 │  │  pip install requests                                        │  │
 │  │  python scripts/update_macro.py                              │  │
 │  │    └── FRED API → FEDFUNDS, DGS10, SP500 CSV 업데이트        │  │
 │  │  ⚠️  FRED_API_KEY → GitHub Secrets 에서 주입                │  │
 │  │  git commit & push  →  deploy.yml 자동 트리거               │  │
 │  └──────────────────────────────────────────────────────────────┘  │
 │                                                                    │
 └────────────────────────────────────────────────────────────────────┘
```

### 데이터 업데이트 스케줄 요약

| 워크플로우 | 스케줄 | 데이터 | 소스 | API Key |
|---|---|---|---|---|
| `update-data.yml` | 매일 06:00 UTC | S&P 500 월봉 | Yahoo Finance (`^GSPC`) | 불필요 |
| `update_stocks.yml` | 월~금 01:00 UTC | 주식 종목 일봉 | Alpha Vantage | `ALPHA_VANTAGE_API_KEY` |
| `update_macro.yml` | 월~금 02:00 UTC | Fed Funds Rate, 10Y Treasury | FRED API | `FRED_API_KEY` |
| `deploy.yml` | main push 시마다 | (Jekyll 빌드·배포) | — | — |

---

## 📡 데이터 소스 & Scripts

```
scripts/
│
├── update_sp500.py
│   ├── 데이터 소스 : Yahoo Finance  (yfinance 라이브러리, 무료·키 불필요)
│   ├── 티커       : ^GSPC
│   ├── 주기       : 월봉 (1mo interval, 최근 5년)
│   ├── 로직       :
│   │     • CSV에 이번 달 데이터가 있으면 → 즉시 종료 (월 1회만 실행)
│   │     • 없으면 Yahoo Finance에서 fetch
│   │     • 이번 달 데이터가 아직 없으면 → 내일 재시도
│   │     • 새 데이터 있으면 CSV 업데이트 후 커밋
│   └── 출력       : assets/data/sp500_monthly.csv
│
├── update_stocks.py
│   ├── 데이터 소스 : Alpha Vantage API  (alphavantage.co, 무료 플랜 사용)
│   ├── 엔드포인트  : TIME_SERIES_DAILY_ADJUSTED  (compact = 최근 100 거래일)
│   ├── 종목       : config/symbols.json 에서 읽음
│   │     → SPY, DIA, AMZN, ENVX, AAPL, VFIAX, TSLA, QQQ, META, GOOG, NVDA
│   ├── 로직       :
│   │     • CSV 마지막 날짜 읽어 그 이후 데이터만 append
│   │     • ^ 는 파일명에서 제거 (^GSPC → GSPC.csv)
│   │     • API rate limit 대비 종목 간 대기
│   ├── 컬럼       : date, open_price_usd, close_price_usd,
│   │               adj_close_price_usd, total_volume_usd
│   ├── API Key    : 환경변수 ALPHA_VANTAGE_API_KEY  (GitHub Secrets)
│   └── 출력       : assets/data/stocks/{SYMBOL}.csv
│
└── update_macro.py
    ├── 데이터 소스 : FRED API  (Federal Reserve Bank of St. Louis, 무료)
    ├── 시리즈     :
    │     • FEDFUNDS → 연방기금금리 (Federal Funds Effective Rate)
    │     • DGS10    → 10년 만기 미국 국채 수익률
    │     • SP500    → FRED의 S&P 500 지수
    ├── 로직       :
    │     • 각 CSV 마지막 날짜 이후 데이터만 fetch
    │     • "." (결측값) 건너뜀
    │     • Rate limit 대비 재시도 로직 (최대 3회)
    ├── API Key    : 환경변수 FRED_API_KEY  (GitHub Secrets)
    └── 출력       : assets/data/macro/FEDFUNDS.csv
                    assets/data/macro/DGS10.csv
                    assets/data/macro/SP500.csv
```

---

## 🔐 GitHub Secrets 설정

`Settings → Secrets and variables → Actions → Repository secrets`

```
ALPHA_VANTAGE_API_KEY   ← update_stocks.yml 에서 사용
                           발급: alphavantage.co/support/#api-key

FRED_API_KEY            ← update_macro.yml 에서 사용
                           발급: fred.stlouisfed.org/docs/api/api_key.html
```

워크플로우에서 이렇게 참조:
```yaml
env:
  ALPHA_VANTAGE_API_KEY: ${{ secrets.ALPHA_VANTAGE_API_KEY }}
  FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
```

---

## 💬 Supabase 댓글 & 인증 시스템

블로그 포스트(`/blog/...`)에 Supabase 기반 댓글 시스템이 구현되어 있습니다.

### 인증 흐름

```
방문자 (Browser)
      │
      │  로그인 선택
      ├──────────────────────────────────────────────────────┐
      │                                                      │
      ▼  ① Google OAuth                                      ▼  ② Email Magic Link
 Google 계정 선택                                   이메일 입력
      │                                                      │
      └──────────────────┬───────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │      Supabase       │
              │    Auth Server      │
              │  (PostgreSQL + RLS) │
              └──────────┬──────────┘
                         │  JWT 토큰 발급
                         │  redirectTo: 현재 포스트 URL
                         ▼
              ┌─────────────────────┐
              │  onAuthStateChange  │  ← 리다이렉트 후 자동으로
              │  SIGNED_IN 이벤트   │    세션 감지
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  댓글 작성 폼 표시  │
              │  (Ctrl+Enter 단축키)│
              └─────────────────────┘
```

### 댓글 데이터베이스 (Supabase PostgreSQL)

```sql
-- Supabase SQL Editor 에서 실행
CREATE TABLE public.comments (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    TEXT        NOT NULL,        -- window.location.pathname (포스트 URL)
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT        NOT NULL,
  user_name  TEXT,                        -- Google 계정은 full_name 자동 세팅
  content    TEXT        NOT NULL,        -- 최대 500자, XSS 방지 처리
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (자기 댓글만 삭제 가능)
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all"   ON public.comments FOR SELECT USING (true);
CREATE POLICY "insert_own" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.comments FOR DELETE USING  (auth.uid() = user_id);
```

### 관련 파일

| 파일 | 역할 |
|---|---|
| `assets/js/comments.js` | Supabase JS SDK 초기화, Auth UI, 댓글 CRUD |
| `_includes/comments.html` | 댓글 섹션 HTML 템플릿 + 다크 테마 CSS |
| `_layouts/post.html` | 블로그 포스트 레이아웃, `{% include comments.html %}` 포함 |

> Supabase URL과 anon key는 `comments.js` 내에 직접 포함됨 (anon key는 클라이언트 공개 가능).

---

## 🛠️ 로컬 개발 환경

```bash
# Jekyll 로컬 서버
bundle install
bundle exec jekyll serve
# → http://localhost:4000/finance/

# Python 스크립트 직접 실행
pip install yfinance pandas requests

python scripts/update_sp500.py

ALPHA_VANTAGE_API_KEY=your_key python scripts/update_stocks.py

FRED_API_KEY=your_key python scripts/update_macro.py

# 새 종목 추가
# config/symbols.json 의 "stocks" 배열에 티커 추가
```

---

## 📋 기술 스택 요약

| 레이어 | 기술 |
|---|---|
| **정적 사이트** | Jekyll (Ruby) |
| **호스팅** | GitHub Pages |
| **차트** | 순수 JavaScript (Canvas + SVG) |
| **스타일** | CSS Variables 기반 다크 테마 |
| **다국어** | localStorage + CSS class 토글 (한/영) |
| **주식 일봉** | Alpha Vantage API (`TIME_SERIES_DAILY_ADJUSTED`) |
| **S&P 500 월봉** | Yahoo Finance (yfinance) |
| **거시경제 데이터** | FRED API (Federal Reserve) |
| **자동화** | GitHub Actions (cron + push 트리거) |
| **인증** | Supabase Auth (Google OAuth + Email Magic Link) |
| **댓글 DB** | Supabase PostgreSQL (RLS 적용) |

---

## 🔗 관련 링크

- 🌐 **라이브 사이트**: [jaegunjung.github.io/finance](https://jaegunjung.github.io/finance/)
- 📦 **GitHub 레포**: [github.com/jaegunjung/finance](https://github.com/jaegunjung/finance)
- 📊 **Alpha Vantage API 키 발급**: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
- 📈 **FRED API 키 발급**: [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
- 🗄️ **Supabase**: [supabase.com](https://supabase.com)

---

*All analysis is personal opinion and not investment advice. · 모든 분석은 개인적인 견해이며 투자 권유가 아닙니다.*
