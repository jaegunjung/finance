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
