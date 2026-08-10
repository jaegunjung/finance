# Project Info
- Local: D:\github\finance
- Live site: https://jaegunjung.github.io/finance/
- GitHub Pages로 배포중
- 주요 파일: index.html, nav.html, main.css

# Git 작업 원칙
- 코드 수정을 완료하면 **사용자가 매번 요청하지 않아도 항상 커밋하고 푸시한다** (git add → commit → push까지 자동으로 진행).
- 푸시 전 `git fetch origin`으로 원격에 새 커밋(주로 자동 업데이트 스크립트)이 있는지 확인하고, 있으면 `git pull --rebase origin main` 후 푸시한다.
- 커밋 메시지는 변경 이유(왜)를 한두 문장으로 간결하게 작성한다.

# QA 원칙
- import/dedup/파싱 관련 버그를 고친 후에는 **반드시 로컬에서 직접 QA**한다. 사용자에게 하라고 시키지 않는다.
- QA 방법: Node.js 스크립트로 MSP CSV 파싱 → dedup 로직 시뮬레이션 → export CSV(현재 DB 상태)와 비교
- MSP CSV 위치: `D:\Downloads\MSP-Portfolios-2026-06-27.csv`
- export CSV 위치: `D:\Downloads\transactions_usd_2026-07-01 (3).csv` (최신 파일)
- QA 스크립트 예시: `C:\Users\jjg04\AppData\Local\Temp\claude\D--github-finance\e30fe692-6535-424e-9ee9-861444417993\scratchpad\full_compare.mjs`
- 브라우저 없이 확인 가능한 것은 전부 로컬 스크립트로 먼저 검증
- DB 실제 반영 여부 확인이 필요한 경우에만 사용자에게 브라우저 콘솔 스크립트 제공
- `portfolio/index.html`의 인라인 `<script>`를 수정한 후에는, push 전에 아래로 문법
  검증할 것 (Jekyll의 `{{ ... }}` liquid 태그를 문자열로 치환한 뒤 `node --check`):
  ```
  node -e "
    const fs = require('fs');
    const src = fs.readFileSync('portfolio/index.html','utf8');
    const scripts = [...src.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    let out = scripts.join('\n');
    out = out.replace(/\{\{[^}]*\}\}/g, '\"X\"');
    fs.writeFileSync('/tmp/check.js', out);
  "
  node --check /tmp/check.js
  ```

# 핵심 파일 구조 (작업 전 확인)
- `portfolio/index.html` — 포트폴리오 계산·렌더링 로직 전체가 인라인 `<script>`로
  들어있는 단일 대형 파일 (별도 `portfolio.js`/`charts.js` 없음).
- `assets/js/transactions.js` — `computePnL()` 등 거래 CSV 파싱·손익 계산 공통 함수.
  보유현황 탭이 직접 호출하는 **원본(authoritative)** 계산 로직.
- `_data/annual_returns.json` — 홈페이지 연간 수익률 테이블용 종목별 데이터.
- `scripts/update_stocks.py` — Alpha Vantage로 `config/symbols.json`의 주식 심볼
  갱신 (crypto 티커는 지원 안 함 — 아래 "데이터 소스" 참조).
- `scripts/update_crypto_stocks.py` — CoinGecko로 `-USD` 크립토 심볼(13개) 갱신.
- `scripts/update_sgov_returns.py` — yfinance로 SGOV 연도별 실제 총수익률(배당 포함)
  갱신 → `assets/data/sgov_annual_returns.json`.
- `tests/integration.spec.js` + `.github/workflows/integration-test.yml` — push마다
  자동 실행되는 Playwright 회귀 테스트 (아래 "자동화된 회귀 테스트" 참조).

# 데이터 소스 (심볼 종류별로 다름 — 섞어 쓰면 데이터 누락)
- 주식/ETF: Alpha Vantage (`update_stocks.py`, 무료 티어 — 배당조정 안 됨, 과거
  주가가 실제보다 낮게 나올 수 있음. 확인 필요하면 yfinance로 대조)
- Crypto (`*-USD` 티커): Alpha Vantage가 지원 안 함 — 반드시 CoinGecko
  (`update_crypto_stocks.py`) 사용. 실수로 Alpha Vantage 경로에 crypto 심볼을 넣으면
  조용히 실패하고 그 심볼만 영구적으로 갱신이 멈춘다 (실제로 13개 심볼이 이 문제로
  최대 1년+ 정체됐던 적 있음 — 2026-08 수정).
- SGOV 등 배당 위주 현금성 자산: 가격만으로는 총수익률을 못 담는다 (NAV가 거의
  안 움직이고 수익은 배당). yfinance의 `auto_adjust=True`로 실제 연도별 총수익률을
  구해서 합성 NAV 시리즈를 만드는 방식 사용 (`update_sgov_returns.py` 참조).
- 거시지표: FRED API.

# 알려진 아키텍처 리스크: 포트폴리오 계산의 이중 구현
`보유현황` 탭(computePnL 직접 호출)과 `분석 코치` 탭(portfolio/index.html 안의
자체 재구현 로직: mtmHold, 연도별 replay 등)이 **서로 다른 코드로 같은 계산을
두 번** 한다. 이게 통일돼 있지 않아서 2026-08 세션에서만 아래 불일치가 전부
발견/수정됨:
- 분석 코치 쪽 event 필터가 `split` 타입을 안 읽어서 주식분할 심볼의 평단이
  실제보다 부풀려짐 (computePnL은 처리하는데 재구현 쪽은 누락).
- DRIP을 원금/cost basis에 포함시킴 (computePnL은 제외).
- SPY/QQQ/SGOV 벤치마크 시뮬레이션의 매도 비율식이 음수로 튀는 경우 존재.
- 원금 수동 설정(rollover 계좌) 시 두 탭이 서로 다른 기준(cost-basis vs
  market-value)으로 손익을 계산해 부호까지 반대로 나온 적 있음.

**새 계산 로직을 추가/수정할 때는 반드시 두 탭에 동시에 반영하거나, 최소한
"보유현황 순익 == 분석코치 손익 (동일 종목·동일 시점 기준)"을 로컬에서 직접
숫자로 대조할 것.** 브라우저 콘솔에서 두 계산을 나란히 재현하는 진단 스크립트
패턴은 이번 세션 대화 기록에 여러 번 등장함 — 필요하면 그 패턴을 재사용.

# Jekyll 규칙
- Gemfile 기준 Jekyll ~> 4.3 사용 중 (버전 확인 필요하면 Gemfile 참조, 임의로
  가정하지 말 것).
- front matter에 `layout: none`을 쓰면 GitHub Pages 빌드 시 파싱되지 않고 원문
  텍스트가 그대로 출력되며 404/깨짐으로 이어진다 — 반드시 `layout: null` 사용.
  (`tests/integration.spec.js`가 이미 이 케이스를 정적/E2E 양쪽으로 검증함.)

# 자동화된 회귀 테스트
- `tests/integration.spec.js` (Playwright)가 push/PR마다 `.github/workflows/
  integration-test.yml`을 통해 자동 실행됨 — git log를 분석해 반복 수정된 기능을
  동적으로 더 집중 검증하는 구조. 아래를 이미 커버함:
  - 전체 페이지 HTTP 200 / layout:none 오염 검사
  - 차트 시간 버튼(2Y/5Y/10Y 등) x축 시작점 정확도
  - 종목 간 Chart.js 인스턴스/데이터셋 오염 (예: ENVX 보조선이 다른 종목 페이지에 남는 버그)
  - 홈페이지 연간 수익률 테이블 데이터 유효성
  - API 로드 실패/치명적 JS 콘솔 에러
- 새 테스트가 필요하면 이 파일에 추가할 것 — 별도 테스트 파일을 새로 만들지 말 것
  (이미 git-log 기반 동적 검증 구조가 있으므로 중복 생성 금지).
