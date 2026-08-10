// tests/freshness-check.spec.js
// ─────────────────────────────────────────────────────────────────────────
// JJ Financial Analysis — 데일리 데이터 신선도(freshness) 점검
//
// integration.spec.js와 달리 이 테스트는 로컬 빌드/서버가 필요 없다 —
// 실제 배포된 프로덕션 사이트(https://jaegunjung.github.io/finance/)의
// 데이터 파일과 페이지를 직접 확인한다. .github/workflows/daily-qa.yml에서
// 매일 실행되며, 결과는 qa-results/*.json에 개별 기록된 뒤
// scripts/send-qa-alert.js가 모아서 이메일 알림 + Job Summary를 만든다.
//
// 각 테스트는 Playwright expect()로 실패시키지 않는다 (매일 실행되는
// 정보성 점검이므로 CI를 빨갛게 만들 필요는 없음) — 대신 결과를
// qa-results/<id>.json에 기록하고, "문제 있음"으로 표시할 뿐이다.
// 실제 알림 여부는 send-qa-alert.js가 그 파일들을 모아 판단한다.
//
// [D] 포트폴리오 정합성(보유현황 vs 분석코치) 체크는 로그인이 필요한
// 페이지라 이 무인증 스크립트에서는 실행할 수 없다 — 의도적으로
// "skipped"로 기록한다 (로그인 자격 증명을 CI에 저장하는 건 별도의
// 보안 판단이 필요한 일이라 여기서 임의로 하지 않음).
// ─────────────────────────────────────────────────────────────────────────
const { test } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SITE_URL   = process.env.SITE_URL || "https://jaegunjung.github.io/finance";
const RESULTS_DIR = path.join(__dirname, "..", "qa-results");
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const DAY_MS = 86_400_000;

function writeResult(id, result) {
  fs.writeFileSync(
    path.join(RESULTS_DIR, `${id}.json`),
    JSON.stringify({ id, checkedAt: new Date().toISOString(), ...result }, null, 2)
  );
}

function daysAgo(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((today - d) / DAY_MS);
}

// 오늘까지 거슬러 올라가며 평일(월~금)만 센다 — 미국 공휴일까지는 반영하지
// 않는 근사치 (완벽한 거래일 캘린더는 별도 데이터 소스가 필요해 범위 밖).
function tradingDaysAgo(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(d);
  while (cur < today) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

async function fetchCsvLastDate(request, csvPath) {
  const res = await request.get(`${SITE_URL}/${csvPath}`);
  if (!res.ok()) return null;
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const lastLine = lines[lines.length - 1];
  const date = lastLine.split(",")[0]?.trim();
  return date || null;
}

// ═══════════════════════════════════════════════════════════════════════
// [A] Crypto 데이터 freshness (3일 초과 시 문제 — 24/7 거래라 평일 예외 없음)
// ═══════════════════════════════════════════════════════════════════════
test.describe("A. Crypto 데이터 freshness", () => {
  const SYMBOLS = ["BTC-USD", "ETH-USD"];
  for (const sym of SYMBOLS) {
    test(`${sym} — 3일 이내 갱신`, async ({ request }) => {
      const lastDate = await fetchCsvLastDate(request, `assets/data/stocks/${sym}.csv`);
      if (!lastDate) {
        writeResult(`crypto-${sym}`, { category: "crypto", label: sym, status: "issue", detail: "CSV 조회 실패" });
        return;
      }
      const age = daysAgo(lastDate);
      const status = age > 3 ? "issue" : "ok";
      writeResult(`crypto-${sym}`, {
        category: "crypto", label: sym, status,
        detail: `마지막 업데이트: ${lastDate} (${age}일 전)`,
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// [B] 주식 데이터 freshness (거래일 기준 3일 초과 — 주말 제외 근사)
// ═══════════════════════════════════════════════════════════════════════
test.describe("B. 주식 데이터 freshness", () => {
  const SYMBOLS = ["SPY", "AAPL", "NVDA"];
  for (const sym of SYMBOLS) {
    test(`${sym} — 거래일 3일 이내 갱신`, async ({ request }) => {
      const lastDate = await fetchCsvLastDate(request, `assets/data/stocks/${sym}.csv`);
      if (!lastDate) {
        writeResult(`stock-${sym}`, { category: "stock", label: sym, status: "issue", detail: "CSV 조회 실패" });
        return;
      }
      const age = tradingDaysAgo(lastDate);
      const status = age > 3 ? "issue" : "ok";
      writeResult(`stock-${sym}`, {
        category: "stock", label: sym, status,
        detail: `마지막 업데이트: ${lastDate} (거래일 기준 ${age}일 전, 공휴일 미반영 근사치)`,
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// [C] 거시지표 freshness (60일 초과 — CPI/금리)
// ═══════════════════════════════════════════════════════════════════════
test.describe("C. 거시지표 데이터 freshness", () => {
  // GDP는 분기 발표 + 보고 지연으로 60일을 넘기는 게 정상이라 제외.
  // "실업률(UNRATE)"은 이 사이트가 별도로 수집하지 않아 대신 CPI/DGS10만 확인.
  const SERIES = [
    { file: "CPI", label: "CPI (소비자물가지수)" },
    { file: "DGS10", label: "DGS10 (10년물 금리)" },
  ];
  for (const { file, label } of SERIES) {
    test(`${label} — 60일 이내 갱신`, async ({ request }) => {
      const lastDate = await fetchCsvLastDate(request, `assets/data/macro/${file}.csv`);
      if (!lastDate) {
        writeResult(`macro-${file}`, { category: "macro", label, status: "issue", detail: "CSV 조회 실패" });
        return;
      }
      const age = daysAgo(lastDate);
      const status = age > 60 ? "issue" : "ok";
      writeResult(`macro-${file}`, {
        category: "macro", label, status,
        detail: `마지막 업데이트: ${lastDate} (${age}일 전)`,
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// [D] 포트폴리오 정합성 — 로그인 필요, 무인증 CI에서는 실행 불가
// ═══════════════════════════════════════════════════════════════════════
test.describe("D. 포트폴리오 정합성 (보유현황 vs 분석코치)", () => {
  test("스킵 — 로그인 세션 없이는 확인 불가", async ({ page }) => {
    await page.goto(`${SITE_URL}/portfolio/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const requiresLogin = /로그인|sign in/i.test(bodyText);
    writeResult("portfolio-consistency", {
      category: "portfolio", label: "보유현황 vs 분석코치",
      status: "skipped",
      detail: requiresLogin
        ? "로그인 필요 페이지 — 자동화된 무인증 점검에서는 확인 불가. 필요하면 인증 세션 구성을 별도로 논의할 것."
        : "예상과 다르게 로그인 없이 접근됨 — 페이지 구조가 바뀌었을 수 있음, 확인 필요.",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// [E] 전체 페이지 404 체크
// ═══════════════════════════════════════════════════════════════════════
const ALL_PAGES = [
  "/", "/crypto/", "/crypto/eth/", "/crypto/pepe/",
  "/stock/", "/stock/envx/", "/stock/aicapex-stocks/", "/stock/aicapex-etf/", "/stock/lly/",
  "/rates/", "/macro/", "/about/", "/blog/", "/portfolio/", "/profile/",
];

test.describe("E. 전체 페이지 404 체크 (프로덕션)", () => {
  for (const urlPath of ALL_PAGES) {
    test(`HTTP 200 — ${urlPath}`, async ({ request }) => {
      const res = await request.get(`${SITE_URL}${urlPath}`, { timeout: 20_000 }).catch(() => null);
      const status = res?.status() ?? null;
      const ok = status === 200;
      writeResult(`page-${urlPath.replace(/\//g, "_") || "root"}`, {
        category: "pages", label: urlPath,
        status: ok ? "ok" : "issue",
        detail: ok ? `HTTP ${status}` : `HTTP ${status ?? "요청 실패"}`,
      });
    });
  }
});
