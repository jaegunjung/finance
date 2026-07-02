# Project Info
- Local: D:\github\finance
- Live site: https://jaegunjung.github.io/finance/
- GitHub Pages로 배포중
- 주요 파일: index.html, nav.html, main.css

# QA 원칙
- import/dedup/파싱 관련 버그를 고친 후에는 **반드시 로컬에서 직접 QA**한다. 사용자에게 하라고 시키지 않는다.
- QA 방법: Node.js 스크립트로 MSP CSV 파싱 → dedup 로직 시뮬레이션 → export CSV(현재 DB 상태)와 비교
- MSP CSV 위치: `D:\Downloads\MSP-Portfolios-2026-06-27.csv`
- export CSV 위치: `D:\Downloads\transactions_usd_2026-07-01 (3).csv` (최신 파일)
- QA 스크립트 예시: `C:\Users\jjg04\AppData\Local\Temp\claude\D--github-finance\e30fe692-6535-424e-9ee9-861444417993\scratchpad\full_compare.mjs`
- 브라우저 없이 확인 가능한 것은 전부 로컬 스크립트로 먼저 검증
- DB 실제 반영 여부 확인이 필요한 경우에만 사용자에게 브라우저 콘솔 스크립트 제공
