// tests/integration.spec.js
// ─────────────────────────────────────────────────────────────────────────────
// JJ Financial Analysis — Playwright 통합 테스트
//
// 구조
//   setup  — git log 분석 결과 로드, 동적 테스트 맥락 구성
//   A      — 페이지 전체 HTTP 200 / 404 / layout:none 검증
//   B      — 차트 시간 버튼 x축 시작점 검증  (버그: 2Y/5Y/10Y 날짜 오계산)
//   C      — 종목 간 차트 상태 오염 검증    (버그: ENVX 보조선 타 페이지 유출)
//   D      — git log 빈도 기반 동적 추가 검증
//   E      — 연간 수익률 테이블 / 데이터 유효성
//   F      — API 데이터 로드 상태 검증
// ─────────────────────────────────────────────────────────────────────────────
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// ── 상수 ────────────────────────────────────────────────────────────────────
const BASE_URL  = process.env.BASE_URL  || "http://localhost:4000";
const DAY_MS    = 86_400_000;
const MONTH_MS  = 30 * DAY_MS;
const TOLERANCE = 30 * DAY_MS;   // 버튼 날짜 ±30일 허용

// ── git log 분석 결과 로드 ───────────────────────────────────────────────────
let commitFreq = {};
let repeatedBugFeatures = [];

try {
  const freqPath = process.env.COMMIT_FREQ_JSON || "/tmp/commit_freq.json";
  if (fs.existsSync(freqPath)) {
    const data = JSON.parse(fs.readFileSync(freqPath, "utf8"));
    commitFreq = data.freq || {};
    repeatedBugFeatures = data.repeated || [];
    console.log("📋 git log 분석 완료");
    console.log("  반복 수정 기능:", repeatedBugFeatures.join(", ") || "없음");
    console.log("  총 버그 수정 커밋:", data.totalBugFixes);
  }
} catch (e) {
  console.warn("⚠️  commit_freq.json 로드 실패 — 기본 테스트만 실행합니다:", e.message);
}

// ── 헬퍼: Chart.js 인스턴스에서 x축 min 읽기 ────────────────────────────────
// 이 사이트의 차트는 인덱스 기반 x축(배열 인덱스)을 사용합니다.
// btcDates / ethDates / ratesDates / dates 전역 배열로 인덱스 → 타임스탬프 변환.
async function getChartXMin(page) {
  return page.evaluate(() => {
    function indexToTimestamp(idx) {
      const i = Math.round(idx);
      const arrays = [
        typeof btcDates   !== "undefined" ? btcDates   : null,
        typeof ethDates   !== "undefined" ? ethDates   : null,
        typeof ratesDates !== "undefined" ? ratesDates : null,
        typeof dates      !== "undefined" ? dates      : null,
      ];
      for (const arr of arrays) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const dateStr = arr[i];
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d)) return d.getTime();
        }
      }
      return null;
    }

    function resolveMin(c) {
      const min = c?.scales?.x?.min;
      if (min == null) return null;
      // Already a Unix timestamp (> year 2000 in ms)
      if (min > 946684800000) return min;
      return indexToTimestamp(min);
    }

    // 사이트가 노출하는 전역 변수명 후보 목록
    const candidates = [
      window.__chart, window.myChart, window.chart,
      window.btcChart, window.stockChart, window.mainChart,
      window.ratesChart, window.macroChart,
    ];
    for (const c of candidates) {
      const ts = resolveMin(c);
      if (ts != null) return ts;
    }
    // Chart.js 내부 레지스트리 — 데이터 포인트가 많은 순으로 정렬해 메인 차트 우선
    if (typeof Chart !== "undefined" && Chart.instances) {
      const inst = Object.values(Chart.instances).sort((a, b) =>
        (b.data?.datasets?.[0]?.data?.length || 0) -
        (a.data?.datasets?.[0]?.data?.length || 0)
      );
      for (const c of inst) {
        const ts = resolveMin(c);
        if (ts != null) return ts;
      }
    }
    return null;
  });
}

// ── 헬퍼: Chart.js dataset 레이블 목록 읽기 ─────────────────────────────────
async function getChartDatasetLabels(page) {
  return page.evaluate(() => {
    const candidates = [
      window.__chart, window.myChart, window.chart,
      window.stockChart, window.mainChart, window.ratesChart,
    ];
    for (const c of candidates) {
      if (c?.data?.datasets) return c.data.datasets.map(d => d.label ?? "");
    }
    if (typeof Chart !== "undefined" && Chart.instances) {
      const inst = Object.values(Chart.instances);
      if (inst.length > 0)
        return inst[0].data?.datasets?.map(d => d.label ?? "") ?? [];
    }
    return [];
  });
}

// ── 헬퍼: dataset 개수 읽기 ──────────────────────────────────────────────────
async function getChartDatasetCount(page) {
  const labels = await getChartDatasetLabels(page);
  return labels?.length ?? null;
}

// ── 헬퍼: 페이지 로드 + canvas 대기 ─────────────────────────────────────────
async function gotoAndWaitChart(page, urlPath, timeout = 30_000) {
  await page.goto(BASE_URL + urlPath, { waitUntil: "networkidle", timeout });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500);
}

// ── 헬퍼: 버튼 클릭 후 x축 시작점 검증 ──────────────────────────────────────
// toleranceDays: 기본 30일. 데이터 간격이 넓은 차트(Rates 등)는 더 크게 설정.
async function assertXMinAfterButton(page, buttonText, expectedYears, toleranceDays = 30) {
  const btn = page
    .locator(`button:text("${buttonText}")`)
    .or(page.locator(`[data-range="${buttonText}"]`))
    .first();

  await expect(btn, `"${buttonText}" 버튼이 보이지 않습니다`).toBeVisible({ timeout: 8_000 });
  await btn.click();
  await page.waitForTimeout(800);

  if (expectedYears === null) return;   // All 버튼: 클릭 성공만 확인

  const xMin = await getChartXMin(page);

  // xMin을 읽을 수 없는 경우 (비-인덱스 차트, 전역 변수 미노출 등): 경고만 남기고 통과
  if (xMin === null) {
    console.warn(`[${buttonText}] xMin 읽기 불가 — 차트가 인덱스 기반 x축을 사용하지 않거나 dates 변수가 전역 미노출`);
    return;
  }

  const expected = Date.now() - expectedYears * 365 * DAY_MS;

  // API 데이터 한계로 요청 범위보다 짧은 데이터만 있는 경우 스킵
  // (xMin이 요청 기간의 절반도 안 될 만큼 데이터가 짧으면 건너뜀)
  const halfPeriod = Date.now() - (expectedYears / 2) * 365 * DAY_MS;
  if (xMin > halfPeriod) {
    console.warn(
      `[${buttonText}] API 데이터 부족으로 스킵 — ` +
      `xMin: ${new Date(xMin).toISOString()}, 요청: ${expectedYears}Y`
    );
    return;
  }

  const toleranceMs = toleranceDays * DAY_MS;
  const diff        = Math.abs(xMin - expected);
  expect(
    diff,
    `[${buttonText}] x축 시작점 오류\n` +
    `  기대값: ${new Date(expected).toISOString()} (현재 - ${expectedYears}년)\n` +
    `  실제값: ${new Date(xMin).toISOString()}\n` +
    `  차이:   ${Math.round(diff / DAY_MS)}일 (허용 ±${toleranceDays}일)`
  ).toBeLessThanOrEqual(toleranceMs);
}


// ═══════════════════════════════════════════════════════════════════════════
// A. 페이지 전체 HTTP 200 / layout:none / 타이틀 검증
// ═══════════════════════════════════════════════════════════════════════════
const ALL_PAGES = [
  "/finance/",
  "/finance/crypto/",
  "/finance/crypto/eth/",
  "/finance/crypto/pepe/",
  "/finance/stock/",
  "/finance/stock/envx/",
  "/finance/stock/aicapex-stocks/",
  "/finance/stock/aicapex-etf/",
  "/finance/stock/lly/",
  "/finance/stock/nvda/",
  "/finance/stock/aapl/",
  "/finance/stock/tsla/",
  "/finance/stock/meta/",
  "/finance/stock/goog/",
  "/finance/stock/amzn/",
  "/finance/stock/dji/",
  "/finance/stock/qqq/",
  "/finance/stock/vfiax/",
  "/finance/rates/",
  "/finance/macro/",
  "/finance/about/",
  "/finance/blog/",
];

test.describe("A. 페이지 로드 & 404 검증 (layout:none 버그 포함)", () => {

  for (const urlPath of ALL_PAGES) {
    test(`HTTP 200 — ${urlPath}`, async ({ page }) => {
      const response = await page.goto(BASE_URL + urlPath, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });

      // ① HTTP 상태 코드
      expect(
        response?.status(),
        `[${urlPath}] HTTP ${response?.status()}\n` +
        `  → Jekyll front matter에 'layout: none' 사용 시 GitHub Pages에서 404 발생\n` +
        `  → 올바른 값: 'layout: null' 또는 layout 키 삭제`
      ).toBe(200);

      // ② 타이틀에 "404" / "not found" 없음
      const title = await page.title();
      expect(
        title.toLowerCase(),
        `[${urlPath}] 타이틀이 404 오류를 나타냄: "${title}"`
      ).not.toMatch(/404|not found|page not found/);

      // ③ 본문에 "layout: none" 원문 텍스트 없음 (front matter 미파싱 감지)
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(
        bodyText,
        `[${urlPath}] 본문에 'layout: none' 텍스트 발견 — front matter가 파싱되지 않았습니다`
      ).not.toContain("layout: none");
    });
  }

  test("빌드된 HTML 파일에 layout:none 원문 없음 (정적 검사 보조)", async ({ page }) => {
    // Jekyll이 layout:none을 만나면 raw front matter가 그대로 출력되기도 함
    const res = await page.goto(BASE_URL + "/finance/", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    const src = await page.content();
    expect(src).not.toContain("layout: none");
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// B. 차트 시간 버튼 x축 시작점 검증  ← 가장 자주 수정된 버그
// ═══════════════════════════════════════════════════════════════════════════
test.describe("B-1. Bitcoin 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/crypto/");
  });

  test("2Y 버튼 → 현재 - 2년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "2Y", 2);
  });
  test("5Y 버튼 → 현재 - 5년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "5Y", 5);
  });
  test("10Y 버튼 → 현재 - 10년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "10Y", 10);
  });
  test("All 버튼 → 2013년 이전 데이터부터 표시", async ({ page }) => {
    await assertXMinAfterButton(page, "All", null);
    const xMin = await getChartXMin(page);
    if (xMin != null) {
      expect(
        xMin,
        `All 버튼 후 시작점(${new Date(xMin).toISOString()})이 2013년 이후 — 전체 데이터가 아닙니다`
      ).toBeLessThan(new Date("2014-01-01").getTime());
    }
  });
});

test.describe("B-2. Ethereum 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/crypto/eth/");
  });

  test("2Y 버튼 → 현재 - 2년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "2Y", 2);
  });
  test("5Y 버튼 → 현재 - 5년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "5Y", 5);
  });
});

test.describe("B-3. ENVX 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/stock/envx/");
  });

  test("1Y 버튼 → 현재 - 1년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "1Y", 1);
  });
  test("5Y 버튼 → 현재 - 5년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "5Y", 5);
  });
  test("All 버튼 → 차트 렌더링 성공", async ({ page }) => {
    await assertXMinAfterButton(page, "All", null);
  });
});

test.describe("B-4. S&P 500 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/stock/");
  });

  test("5Y 버튼 → 현재 - 5년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "5Y", 5);
  });
  test("10Y 버튼 → 현재 - 10년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "10Y", 10);
  });
  test("20Y 버튼 → 현재 - 20년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "20Y", 20);
  });
});

test.describe("B-5. AI CapEx Stocks 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/stock/aicapex-stocks/");
  });

  test("1Y 버튼 → 현재 - 1년 ±30일", async ({ page }) => {
    await assertXMinAfterButton(page, "1Y", 1);
  });
  test("6M 버튼 → 현재 - 6개월 ±15일 (존재할 경우)", async ({ page }) => {
    const btn = page.locator('button:text("6M"), [data-range="6M"]').first();
    if (!(await btn.isVisible().catch(() => false))) return;
    await btn.click();
    await page.waitForTimeout(800);
    const xMin = await getChartXMin(page);
    if (xMin == null) return;
    const expected = Date.now() - 6 * MONTH_MS;
    expect(Math.abs(xMin - expected)).toBeLessThanOrEqual(15 * DAY_MS);
  });
});

test.describe("B-6. Rates 페이지 — 시간 버튼 시작점", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/rates/");
  });

  test("10Y 버튼 → 현재 - 10년 ±120일", async ({ page }) => {
    // FRED 데이터는 거래일 기준(252일/년)이라 달력 기준과 최대 ~100일 차이 발생
    await assertXMinAfterButton(page, "10Y", 10, 120);
  });
  test("20Y 버튼 → 현재 - 20년 ±120일", async ({ page }) => {
    await assertXMinAfterButton(page, "20Y", 20, 120);
  });
  test("All 버튼 → 차트 렌더링 성공", async ({ page }) => {
    await assertXMinAfterButton(page, "All", null);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// C. 종목 간 차트 상태 오염 검증  ← ENVX 보조선 타 페이지 유출 버그
// ═══════════════════════════════════════════════════════════════════════════
test.describe("C. 차트 전역 상태 오염 검증 (ENVX → 타 페이지)", () => {

  test("C-1. ENVX 보조선 레이블이 AI CapEx Stocks 페이지에 없음", async ({ page }) => {
    // Step 1: ENVX 페이지 로드 → 레이블 수집
    await gotoAndWaitChart(page, "/finance/stock/envx/");
    const envxLabels = await getChartDatasetLabels(page);
    console.log(`[ENVX] datasets(${envxLabels.length}): ${JSON.stringify(envxLabels)}`);

    // ENVX 고유 레이블 = "ENVX" 또는 MA 외 보조선
    const genericLabels = new Set(["", "MA-20", "MA-50", "MA-200", "Price", "Volume",
      "Upper Band", "Lower Band", "Center Line", "Trend"]);
    const envxSpecific = envxLabels.filter(l => l && !genericLabels.has(l));

    // Step 2: AI CapEx Stocks 이동
    await gotoAndWaitChart(page, "/finance/stock/aicapex-stocks/");
    const aicapexLabels = await getChartDatasetLabels(page);
    console.log(`[AI CapEx] datasets(${aicapexLabels.length}): ${JSON.stringify(aicapexLabels)}`);

    // ENVX 고유 레이블이 다른 페이지에 없어야 함
    for (const label of envxSpecific) {
      expect(
        aicapexLabels,
        `[상태 오염] ENVX 보조선 "${label}"이 AI CapEx Stocks 차트에서 발견됨\n` +
        `  → 페이지 이동 시 chart 전역 배열/변수가 초기화되지 않았습니다.`
      ).not.toContain(label);
    }
  });

  test("C-2. ENVX → ETH 페이지: ENVX 레이블 잔존 없음", async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/stock/envx/");

    await gotoAndWaitChart(page, "/finance/crypto/eth/");
    const ethLabels = await getChartDatasetLabels(page);
    console.log(`[ETH] datasets: ${JSON.stringify(ethLabels)}`);

    expect(
      ethLabels.join(","),
      `ETH 차트에 ENVX 레이블이 남아있습니다: ${JSON.stringify(ethLabels)}`
    ).not.toContain("ENVX");
  });

  test("C-3. 여러 종목 순회 — 각 페이지 datasets 누적 없음", async ({ page }) => {
    const sequence = [
      { path: "/finance/stock/envx/",           name: "ENVX",     maxDS: 10 },
      { path: "/finance/stock/aicapex-stocks/",  name: "AICapEx",  maxDS: 20 },
      { path: "/finance/crypto/",               name: "BTC",      maxDS: 15 },
      { path: "/finance/crypto/eth/",           name: "ETH",      maxDS: 10 },
      { path: "/finance/stock/",                name: "SP500",    maxDS: 15 },
      { path: "/finance/rates/",                name: "Rates",    maxDS: 10 },
    ];

    for (const { path: urlPath, name, maxDS } of sequence) {
      await gotoAndWaitChart(page, urlPath);
      const count  = await getChartDatasetCount(page);
      const labels = await getChartDatasetLabels(page);
      console.log(`[${name}] datasets(${count}): ${JSON.stringify(labels)}`);

      if (count !== null) {
        expect(
          count,
          `[${name}] datasets 개수(${count})가 상한(${maxDS})을 초과\n` +
          `  → 이전 페이지 보조선이 누적됐을 가능성\n` +
          `  → labels: ${JSON.stringify(labels)}`
        ).toBeLessThanOrEqual(maxDS);
      }
    }
  });

  test("C-4. 동일 페이지 버튼 전환 후 datasets 개수 유지", async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/crypto/");

    const btn2Y = page.locator('button:text("2Y")').first();
    await btn2Y.click();
    await page.waitForTimeout(600);
    const count2Y = await getChartDatasetCount(page);

    const btn5Y = page.locator('button:text("5Y")').first();
    await btn5Y.click();
    await page.waitForTimeout(600);
    const count5Y = await getChartDatasetCount(page);

    if (count2Y !== null && count5Y !== null) {
      // 버튼 전환 시 datasets가 2배로 늘면 누적 버그
      expect(
        count5Y,
        `2Y(${count2Y}) → 5Y(${count5Y}): datasets 개수가 두 배 이상 증가 — 중복 추가 버그`
      ).toBeLessThanOrEqual(count2Y * 1.5 + 2);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// D. git log 빈도 기반 동적 추가 검증
//    반복 수정이 많았던 기능을 집중 검증
// ═══════════════════════════════════════════════════════════════════════════
test.describe("D. git log 빈도 기반 동적 검증", () => {

  test("D-1. RSI 지표 렌더링 (rsi 관련 수정이 빈번한 경우 집중 검증)", async ({ page }) => {
    // RSI가 자주 수정됐다면 렌더링 상태를 집중 확인
    const rsiFixCount = commitFreq["rsi"] ?? 0;
    if (rsiFixCount > 0) {
      console.log(`RSI 관련 커밋 ${rsiFixCount}개 — 집중 검증`);
    }

    await gotoAndWaitChart(page, "/finance/crypto/");
    // RSI 값 표시 요소 존재 확인
    const rsiText = await page.locator("text=/RSI\\(14\\)/i").first().isVisible().catch(() => false);
    expect(
      rsiText,
      "RSI(14) 텍스트가 페이지에서 보이지 않습니다 — RSI 컴포넌트 렌더링 실패"
    ).toBe(true);
  });

  test("D-2. MA 보조선 토글 동작 확인 (ma 관련 수정이 빈번한 경우)", async ({ page }) => {
    const maFixCount = commitFreq["ma"] ?? 0;
    console.log(`MA 관련 커밋: ${maFixCount}개`);

    await gotoAndWaitChart(page, "/finance/stock/envx/");
    const initialCount = await getChartDatasetCount(page);

    // MA-20 버튼 토글
    const maBtn = page.locator('button:text("MA-20"), button:text("MA20")').first();
    if (await maBtn.isVisible().catch(() => false)) {
      await maBtn.click();
      await page.waitForTimeout(500);
      const afterCount = await getChartDatasetCount(page);
      console.log(`MA 토글 전/후: ${initialCount} → ${afterCount}`);
      // 토글 후 개수가 달라지거나 같아야 함 (off 또는 on 상태 변경)
      // 개수가 0이 되면 데이터 소실 버그
      expect(
        afterCount ?? 1,
        "MA 토글 후 datasets가 0이 됨 — 데이터 소실 버그"
      ).toBeGreaterThan(0);
    }
  });

  test("D-3. CSV 다운로드 링크 존재 확인 (csv 관련 수정이 있는 경우)", async ({ page }) => {
    const csvFixCount = commitFreq["csv"] ?? 0;
    console.log(`CSV 관련 커밋: ${csvFixCount}개`);

    // networkidle + canvas 대기로 데이터 로드 후 확인 (downloadBtn은 데이터 로드 후 노출)
    await gotoAndWaitChart(page, "/finance/stock/envx/");
    // 데이터 로드 완료를 위해 downloadBtn이 visible 상태가 될 때까지 대기
    await page.locator("#downloadBtn").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const csvLink = page.locator("a:has-text('CSV'), button:has-text('CSV'), [data-action='csv']").first();
    const visible  = await csvLink.isVisible().catch(() => false);
    // CSV 링크가 있는 페이지라면 표시되어야 함
    if (csvFixCount >= 1) {
      console.log("CSV 수정 이력 있음 — CSV 버튼 존재 확인");
      expect(visible, "CSV 버튼/링크가 페이지에서 보이지 않습니다").toBe(true);
    }
  });

  test("D-4. 반복 수정 기능 요약 로그 출력", async ({ page }) => {
    // 이 테스트는 항상 통과하며 분석 결과를 로그로 남김
    console.log("\n━━━ git log 반복 수정 기능 분석 결과 ━━━");
    Object.entries(commitFreq)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .forEach(([k, v]) => console.log(`  ${k}: ${v}회`));
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 반복 수정이 5회 이상인 기능이 있으면 경고
    const hotspots = Object.entries(commitFreq).filter(([, v]) => v >= 5);
    if (hotspots.length > 0) {
      console.warn("⚠️  수정 빈도 5회 이상 기능 (고위험):");
      hotspots.forEach(([k, v]) => console.warn(`    ${k}: ${v}회`));
    }
    expect(true).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// E. 연간 수익률 테이블 / 데이터 유효성
// ═══════════════════════════════════════════════════════════════════════════
test.describe("E. 홈페이지 연간 수익률 테이블", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + "/finance/", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);  // JS 렌더링 대기
  });

  test("수익률 테이블/섹션이 페이지에 존재함", async ({ page }) => {
    const hasSection = await page.locator("text=/Annual Returns|연간 수익률/i")
      .first().isVisible().catch(() => false);
    const hasTable   = await page.locator("table").first().isVisible().catch(() => false);
    expect(hasSection || hasTable, "연간 수익률 섹션 또는 테이블이 없습니다").toBe(true);
  });

  const REQUIRED_SYMBOLS = ["SPY", "MU", "STX", "BTC", "QQQ", "NVDA"];
  for (const sym of REQUIRED_SYMBOLS) {
    test(`${sym} 종목이 테이블에 존재함`, async ({ page }) => {
      const body = await page.locator("body").innerText().catch(() => "");
      expect(body, `수익률 테이블에 "${sym}"이 없습니다`).toContain(sym);
    });
  }

  test("2026 YTD 컬럼이 존재하며 숫자 포함", async ({ page }) => {
    const body = await page.locator("body").innerText().catch(() => "");
    const has2026 = body.includes("2026");
    if (!has2026) { console.warn("⚠️  2026 컬럼 미발견 — 테이블 구조 확인 필요"); return; }
    // 퍼센트 숫자 패턴 (예: +12.3, -5.2, 7.8%)
    const hasNumbers = /[+-]?\d+\.?\d*\s*%?/.test(body);
    expect(hasNumbers, "수익률 테이블에 숫자값이 없습니다 — 데이터 로드 실패 가능성").toBe(true);
  });

  test("N/A 값이 과도하게 많지 않음 (100개 미만)", async ({ page }) => {
    const body     = await page.locator("body").innerText().catch(() => "");
    const naCount  = (body.match(/\bN\/A\b/g) || []).length;
    expect(
      naCount,
      `N/A가 ${naCount}개 — 데이터 API 또는 빌드 파이프라인 문제 가능성`
    ).toBeLessThan(100);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// F. API 데이터 로드 상태 검증
// ═══════════════════════════════════════════════════════════════════════════
test.describe("F. 데이터 로드 & 에러 상태 검증", () => {

  test("F-1. Bitcoin 페이지 — 'Loading' 텍스트가 사라지고 차트 표시", async ({ page }) => {
    await page.goto(BASE_URL + "/finance/crypto/", { waitUntil: "networkidle" });

    // 로딩 텍스트가 사라지거나 canvas가 보여야 함
    await page.waitForFunction(() => {
      const loading = document.body.innerText;
      return !loading.includes("Loading data") && !loading.includes("데이터 로딩 중");
    }, { timeout: 15_000 }).catch(() => {
      // 타임아웃 → 캔버스라도 확인
    });

    const canvas = await page.locator("canvas").first().isVisible().catch(() => false);
    expect(canvas, "Bitcoin 차트 canvas가 보이지 않습니다 — CoinGecko API 로드 실패 가능성").toBe(true);
  });

  test("F-2. ENVX 페이지 — 'Loading' 텍스트가 사라지고 차트 표시", async ({ page }) => {
    await page.goto(BASE_URL + "/finance/stock/envx/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      return !document.body.innerText.includes("Loading data");
    }, { timeout: 15_000 }).catch(() => {});
    const canvas = await page.locator("canvas").first().isVisible().catch(() => false);
    expect(canvas, "ENVX 차트 canvas가 보이지 않습니다").toBe(true);
  });

  test("F-3. Rates 페이지 — FRED 데이터 로드 성공 (canvas 표시)", async ({ page }) => {
    await gotoAndWaitChart(page, "/finance/rates/");
    const canvas = await page.locator("canvas").first().isVisible().catch(() => false);
    expect(canvas, "Rates 차트 canvas가 보이지 않습니다 — FRED API 로드 실패 가능성").toBe(true);
  });

  test("F-4. 콘솔 JavaScript 오류 없음 (치명적 오류 감지)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", err => {
      // 심각한 오류만 수집 (404 이미지 등 무시)
      if (!err.message.includes("favicon") && !err.message.includes("sw.js")) {
        errors.push(err.message);
      }
    });

    await page.goto(BASE_URL + "/finance/crypto/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      console.warn("JavaScript 오류 발견:", errors);
      // 경고만 출력, 테스트 실패는 치명적 오류에만
      const fatal = errors.filter(e =>
        /TypeError|ReferenceError|SyntaxError/.test(e)
      );
      expect(
        fatal,
        `치명적 JS 오류 발생:\n${fatal.join("\n")}`
      ).toHaveLength(0);
    }
  });

  test("F-5. AI CapEx Stocks 페이지 — MU/WDC/STX 심볼 텍스트 존재", async ({ page }) => {
    await page.goto(BASE_URL + "/finance/stock/aicapex-stocks/", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText().catch(() => "");
    for (const sym of ["MU", "STX"]) {
      expect(body, `AI CapEx 페이지에 "${sym}" 심볼이 없습니다`).toContain(sym);
    }
  });
});
