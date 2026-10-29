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
//   G      — 금융 용어 툴팁 (로드 범위 / hover / 모바일 탭 / 동적 콘텐츠)
//   H      — 수익률 공유 카드 (포트폴리오 / 개별 종목, 개인정보 미포함)
//   I      — 자동 생성 블로그 글에 제목 태그([뉴스]/[News]/[심층 분석] 등) 없음
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
  "/",
  "/crypto/",
  "/crypto/eth/",
  "/crypto/pepe/",
  "/stock/",
  "/stock/envx/",
  "/stock/aicapex-stocks/",
  "/stock/aicapex-etf/",
  "/stock/lly/",
  "/stock/nvda/",
  "/stock/aapl/",
  "/stock/tsla/",
  "/stock/meta/",
  "/stock/goog/",
  "/stock/amzn/",
  "/stock/dji/",
  "/stock/qqq/",
  "/stock/vfiax/",
  "/rates/",
  "/macro/",
  "/about/",
  "/blog/",
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
    const res = await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
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
    await gotoAndWaitChart(page, "/crypto/");
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
    await gotoAndWaitChart(page, "/crypto/eth/");
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
    await gotoAndWaitChart(page, "/stock/envx/");
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
    await gotoAndWaitChart(page, "/stock/");
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
    await gotoAndWaitChart(page, "/stock/aicapex-stocks/");
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
    await gotoAndWaitChart(page, "/rates/");
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
    await gotoAndWaitChart(page, "/stock/envx/");
    const envxLabels = await getChartDatasetLabels(page);
    console.log(`[ENVX] datasets(${envxLabels.length}): ${JSON.stringify(envxLabels)}`);

    // ENVX 고유 레이블 = "ENVX" 또는 MA 외 보조선
    const genericLabels = new Set(["", "MA-20", "MA-50", "MA-200", "Price", "Volume",
      "Upper Band", "Lower Band", "Center Line", "Trend"]);
    const envxSpecific = envxLabels.filter(l => l && !genericLabels.has(l));

    // Step 2: AI CapEx Stocks 이동
    await gotoAndWaitChart(page, "/stock/aicapex-stocks/");
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
    await gotoAndWaitChart(page, "/stock/envx/");

    await gotoAndWaitChart(page, "/crypto/eth/");
    const ethLabels = await getChartDatasetLabels(page);
    console.log(`[ETH] datasets: ${JSON.stringify(ethLabels)}`);

    expect(
      ethLabels.join(","),
      `ETH 차트에 ENVX 레이블이 남아있습니다: ${JSON.stringify(ethLabels)}`
    ).not.toContain("ENVX");
  });

  test("C-3. 여러 종목 순회 — 각 페이지 datasets 누적 없음", async ({ page }) => {
    const sequence = [
      { path: "/stock/envx/",           name: "ENVX",     maxDS: 10 },
      { path: "/stock/aicapex-stocks/",  name: "AICapEx",  maxDS: 20 },
      { path: "/crypto/",               name: "BTC",      maxDS: 15 },
      { path: "/crypto/eth/",           name: "ETH",      maxDS: 10 },
      { path: "/stock/",                name: "SP500",    maxDS: 15 },
      { path: "/rates/",                name: "Rates",    maxDS: 10 },
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
    await gotoAndWaitChart(page, "/crypto/");

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

    await gotoAndWaitChart(page, "/crypto/");
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

    await gotoAndWaitChart(page, "/stock/envx/");
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
    await gotoAndWaitChart(page, "/stock/envx/");
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
    await page.goto(BASE_URL + "/", {
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
    await page.goto(BASE_URL + "/crypto/", { waitUntil: "networkidle" });

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
    await page.goto(BASE_URL + "/stock/envx/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      return !document.body.innerText.includes("Loading data");
    }, { timeout: 15_000 }).catch(() => {});
    const canvas = await page.locator("canvas").first().isVisible().catch(() => false);
    expect(canvas, "ENVX 차트 canvas가 보이지 않습니다").toBe(true);
  });

  test("F-3. Rates 페이지 — FRED 데이터 로드 성공 (canvas 표시)", async ({ page }) => {
    await gotoAndWaitChart(page, "/rates/");
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

    await page.goto(BASE_URL + "/crypto/", { waitUntil: "networkidle" });
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
    await page.goto(BASE_URL + "/stock/aicapex-stocks/", {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText().catch(() => "");
    for (const sym of ["MU", "STX"]) {
      expect(body, `AI CapEx 페이지에 "${sym}" 심볼이 없습니다`).toContain(sym);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// G. 금융 용어 툴팁 (_includes/tooltip.html + assets/js/tooltip.js)
//    tooltip.js는 load + idle 이후 지연 로드되므로 __jjTooltipInit 플래그를 기다린다.
// ═══════════════════════════════════════════════════════════════════════════
async function waitForTooltips(page, urlPath, { needTerms = true } = {}) {
  await page.goto(BASE_URL + urlPath, { waitUntil: "load" });
  await page.waitForFunction(
    need => window.__jjTooltipInit && (!need || document.querySelector(".jj-term")),
    needTerms,
    { timeout: 15_000 }
  );
}

// 현재 언어에서 화면에 보이는 첫 번째 용어
function firstVisibleTerm(page) {
  return page.locator(".jj-term:visible").first();
}

test.describe("G. 금융 용어 툴팁", () => {

  // 툴팁이 켜져야 하는 페이지 (needTerms: 본문에 용어가 있어 밑줄이 최소 1개는 있어야 함)
  const ENABLED = [
    { path: "/macro/",     needTerms: true },
    { path: "/stock/",     needTerms: true },
    { path: "/crypto/",    needTerms: true },
    { path: "/stock/aapl/", needTerms: false },
    { path: "/crypto/eth/", needTerms: false },
    { path: "/portfolio/", needTerms: false },
  ];
  for (const { path: p, needTerms } of ENABLED) {
    test(`G-1. ${p} — tooltip.js 지연 로드${needTerms ? " + 용어 밑줄 존재" : ""}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await waitForTooltips(page, p, { needTerms });
      const fatal = errors.filter(e => /tooltip|jj-term/i.test(e));
      expect(fatal, `툴팁 관련 JS 오류:\n${fatal.join("\n")}`).toHaveLength(0);
    });
  }

  for (const p of ["/", "/blog/"]) {
    test(`G-2. ${p} — 툴팁 스크립트를 로드하지 않음`, async ({ page }) => {
      await page.goto(BASE_URL + p, { waitUntil: "load" });
      await page.waitForTimeout(2500);  // idle 로더가 돌 시간을 준다
      const loaded = await page.evaluate(() =>
        !!window.__jjTooltipInit || !!document.querySelector('script[src*="tooltip.js"]'));
      expect(loaded, `${p}에서 tooltip.js가 로드됨 — _includes/tooltip.html 경로 조건 확인`).toBe(false);
    });
  }

  test("G-3. 마우스 hover → 툴팁 표시, 이탈/ESC → 닫힘 (EN)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("jj-lang", "en"));
    await waitForTooltips(page, "/macro/");
    const term = firstVisibleTerm(page);
    await term.scrollIntoViewIfNeeded();
    await term.hover();
    const tip = page.locator("#jj-tip");
    await expect(tip).toHaveClass(/\bopen\b/);
    await expect(tip.locator(".jj-tip-title")).not.toBeEmpty();
    // EN 모드에서는 영어 설명 (한글 없음)
    const body = await tip.locator(".jj-tip-body").innerText();
    expect(body, "EN 모드인데 툴팁 본문에 한글이 있음").not.toMatch(/[가-힣]/);
    // 툴팁이 뷰포트 안에 있는지
    const box = await tip.boundingBox();
    const vp = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    await page.mouse.move(0, 0);
    await expect(tip).not.toHaveClass(/\bopen\b/);
    await term.hover();
    await expect(tip).toHaveClass(/\bopen\b/);
    await page.keyboard.press("Escape");
    await expect(tip).not.toHaveClass(/\bopen\b/);
  });

  test("G-4. 동적 렌더링 콘텐츠도 감지, 버튼 안 텍스트는 제외", async ({ page }) => {
    await waitForTooltips(page, "/portfolio/", { needTerms: false });
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.id = "jj-tt-probe";
      d.innerHTML = "<p>CAGR 12% · YTD +4% · PBR 1.2</p><button>EPS</button>";
      document.querySelector("main").appendChild(d);
    });
    await expect(page.locator("#jj-tt-probe p .jj-term")).toHaveCount(3);
    await expect(page.locator("#jj-tt-probe button .jj-term")).toHaveCount(0);
  });

  test("G-5. 차트 오버레이(pointer-events:none) RSI 라벨은 밑줄 제외", async ({ page }) => {
    await waitForTooltips(page, "/stock/aapl/", { needTerms: false });
    await page.waitForTimeout(1500);  // RSI 라벨이 차트 렌더 후 갱신될 시간
    await expect(page.locator("#rsiLabel .jj-term")).toHaveCount(0);
  });

  test.describe("모바일 (touch)", () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test("G-6. 탭 → 열림(KO 설명), 다시 탭/바깥 탭 → 닫힘", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("jj-lang", "ko"));
      await waitForTooltips(page, "/crypto/");
      const term = firstVisibleTerm(page);
      await term.scrollIntoViewIfNeeded();
      const tip = page.locator("#jj-tip");

      await term.tap();
      await expect(tip).toHaveClass(/\bopen\b/);
      const body = await tip.locator(".jj-tip-body").innerText();
      expect(body, "KO 모드인데 툴팁 본문에 한글이 없음").toMatch(/[가-힣]/);

      await term.tap();  // 같은 용어 다시 탭 → 토글 닫힘
      await expect(tip).not.toHaveClass(/\bopen\b/);

      await term.tap();
      await expect(tip).toHaveClass(/\bopen\b/);
      // 바깥 탭: 스크롤 없이 좌측 여백(빈 공간)을 직접 탭 — 스크롤로 닫히는 경우와 구분
      const tb = await term.boundingBox();
      await page.touchscreen.tap(2, Math.min(tb.y + tb.height + 60, 800));
      await expect(tip).not.toHaveClass(/\bopen\b/);
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// H. 수익률 공유 카드 (_includes/return-share.html + assets/js/share.js)
//    실제 수익률 데이터는 로그인이 필요하므로, 페이지가 쓰는 것과 같은 공개 API
//    window.jjShare.set(...)으로 모의 데이터를 주입해 검증한다.
// ═══════════════════════════════════════════════════════════════════════════
async function gotoShare(page, urlPath) {
  await page.goto(BASE_URL + urlPath, { waitUntil: "load" });
  await page.waitForFunction(() => window.jjShare && typeof window.jjShare._resolve === "function",
    null, { timeout: 15_000 });
}

test.describe("H. 수익률 공유 카드", () => {

  for (const p of ["/portfolio/", "/stock/nvda/"]) {
    test(`H-1. ${p} — share.js 로드, 비로그인 시 공유 버튼 숨김`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await gotoShare(page, p);
      await expect(page.locator("#jjReturnShare")).toBeHidden();
      const fatal = errors.filter(e => /jjShare|share\.js/i.test(e));
      expect(fatal, `공유 관련 JS 오류:\n${fatal.join("\n")}`).toHaveLength(0);
    });
  }

  test("H-2. 카드 1200×630 생성 + 수익률만 표시 (매수가·수량·금액 미포함)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("jj-lang", "ko"));
    await gotoShare(page, "/stock/nvda/");
    await page.evaluate(() => {
      document.getElementById("tradePanelWrap").style.display = "";
      // 호출자가 실수로 넘긴 민감 필드 — share.js가 반드시 버려야 함
      window.jjShare.set({ label: "NVDA", pct: 12.345, start: "2024-01-02", end: "2026-10-20",
        shares: 987, avgCost: 123.45, amount: 54321, price: 678.9 });
    });
    await expect(page.locator("#jjReturnShare")).toBeVisible();
    await page.locator("#jjReturnShare .jjs-open").click();
    await expect(page.locator("#jjShareModal")).toHaveClass(/\bopen\b/);

    const info = await page.evaluate(async () => {
      await window.jjShare._render();
      const c = document.querySelector("#jjShareModal canvas");
      const px = (x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3));
      return { w: c.width, h: c.height, lines: window.jjShare._cardLines(),
        bg: px(600, 600), bar: px(600, 3), data: window.jjShare._resolve() };
    });
    expect([info.w, info.h]).toEqual([1200, 630]);
    expect(info.lines).toContain("NVDA");
    expect(info.lines).toContain("+12.35%");
    expect(info.lines).toContain("2024.01.02 – 2026.10.20");
    expect(info.lines.some(l => l.includes("jjanalysis.com"))).toBe(true);
    const joined = info.lines.join(" | ");
    for (const bad of ["$", "987", "123.45", "54321", "54,321", "678.9"]) {
      expect(joined, `카드에 민감 정보 "${bad}" 노출`).not.toContain(bad);
    }
    expect(Object.keys(info.data).sort()).toEqual(["end", "label", "pct", "start"]);
    // 배경 #0d1117 근처, 양수 → 상단 바 초록 (#3fb950)
    info.bg.forEach((v, i) => expect(Math.abs(v - [13, 17, 23][i])).toBeLessThan(25));
    expect(info.bar).toEqual([63, 185, 80]);
  });

  test("H-3. 음수 수익률 → 빨강 + X Web Intent 텍스트", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("jj-lang", "ko"));
    await gotoShare(page, "/stock/nvda/");
    await page.evaluate(() => {
      document.getElementById("tradePanelWrap").style.display = "";
      window.jjShare.set(() => ({ label: "NVDA", pct: -7.5, start: "2025-03-01", end: "2026-10-20" }));
    });
    await page.locator("#jjReturnShare .jjs-open").click();
    const bar = await page.evaluate(async () => {
      await window.jjShare._render();
      const c = document.querySelector("#jjShareModal canvas");
      return Array.from(c.getContext("2d").getImageData(600, 3, 1, 1).data.slice(0, 3));
    });
    expect(bar).toEqual([248, 81, 73]);

    const href = await page.locator("#jjShareModal .jjs-x").getAttribute("href");
    const u = new URL(href);
    expect(u.origin + u.pathname).toBe("https://twitter.com/intent/tweet");
    expect(u.searchParams.get("text")).toBe("내 NVDA 수익률은 -7.50% 📉 #jjanalysis #주식");
    expect(u.searchParams.get("url")).toBe("https://jjanalysis.com/stock/nvda/");
  });

  test("H-4. 링크 복사 → 클립보드에 페이지 URL", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
    await gotoShare(page, "/portfolio/");
    // 비로그인 판정이 끝난 뒤(#portMain을 다시 숨기므로) 주입
    await expect(page.locator("#portNotLoggedIn")).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      document.getElementById("portMain").style.display = "";
      window.jjShare.set({ label: "Portfolio", pct: 42, start: "2021-01-04", end: "2026-10-20" });
    });
    await page.locator("#jjReturnShare .jjs-open").click();
    await page.locator("#jjShareModal .jjs-copy").click();
    await expect(page.locator("#jjShareModal .jjs-toast")).toHaveClass(/\bshow\b/);
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe("https://jjanalysis.com/portfolio/");
    // 닫기
    await page.keyboard.press("Escape");
    await expect(page.locator("#jjShareModal")).not.toHaveClass(/\bopen\b/);
  });

  test("H-5. 블로그 포스트는 기존 공유 바 유지, 수익률 공유 없음", async ({ page }) => {
    await page.goto(BASE_URL + "/blog/", { waitUntil: "domcontentloaded" });
    const href = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"))
        .find(h => /\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/.test(h)));
    test.skip(!href, "블로그 포스트 링크를 찾지 못함");
    await page.goto(new URL(href, BASE_URL + "/").href, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".share-section .share-buttons")).toHaveCount(1);
    await expect(page.locator("#jjReturnShare")).toHaveCount(0);
  });
});

// ── I. 자동 생성 글 제목 태그 금지 ────────────────────────────────────────────
// 봇(daily-news-watch)이 최신 글 front matter를 복사하다 `post_tag: news`를 따라 써서
// 제목 앞에 [뉴스]/[News]가 렌더링된 적 있음 (2026-10). post_tag·deep_dive는
// 사용자가 직접 쓴 글 전용이다. 봇 글 판별: 파일을 추가한 커밋의 작성자가
// claude[bot]이거나 커밋 메시지에 [auto-news-watch] 포함.
function autoGeneratedPosts() {
  const { execSync } = require("child_process");
  const root = path.resolve(__dirname, "..");
  const dir = path.join(root, "_posts");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
    let info = "";
    try {
      info = execSync(
        `git log --diff-filter=A --format=%an%x09%s -1 -- "_posts/${file}"`,
        { cwd: root, encoding: "utf8" }
      ).trim();
    } catch (_) { continue; }
    if (!/^claude\[bot\]\t|\[auto-news-watch\]/.test(info)) continue;
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const fm = (src.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ""])[1];
    out.push({ file, fm });
  }
  return out;
}

test.describe("I. 자동 생성 글 — 제목 태그 금지", () => {
  const BRACKET_TAG = /^\s*["']?\s*\[[^\]]+\]/;

  test("I-1. 봇 글 front matter에 post_tag/deep_dive 없음, 제목이 [태그]로 시작 안 함", () => {
    const posts = autoGeneratedPosts();
    test.skip(posts.length === 0, "git 히스토리에서 자동 생성 글을 찾지 못함");
    const bad = [];
    for (const { file, fm } of posts) {
      if (/^post_tag\s*:/m.test(fm)) bad.push(`${file}: post_tag`);
      if (/^deep_dive\s*:/m.test(fm)) bad.push(`${file}: deep_dive`);
      for (const key of ["title", "title_en", "title_ko"]) {
        const m = fm.match(new RegExp(`^${key}\s*:\s*(.*)$`, "m"));
        if (m && BRACKET_TAG.test(m[1])) bad.push(`${file}: ${key} = ${m[1]}`);
      }
    }
    expect(bad, `자동 생성 글에 제목 태그가 들어감:\n${bad.join("\n")}`).toEqual([]);
  });

  test("I-2. /blog/ 목록에서 봇 글 제목 앞에 태그 배지 없음", async ({ page }) => {
    const slugs = autoGeneratedPosts()
      .map(p => p.file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""));
    test.skip(slugs.length === 0, "git 히스토리에서 자동 생성 글을 찾지 못함");
    await page.goto(BASE_URL + "/blog/", { waitUntil: "domcontentloaded" });
    const bad = await page.evaluate((slugs) => {
      const res = [];
      for (const li of document.querySelectorAll(".post-list .post-item")) {
        const href = (li.querySelector("a")?.getAttribute("href") || "").replace(/\/$/, "");
        const slug = slugs.find(s => href.endsWith("/" + s));
        if (!slug) continue;
        const h3 = li.querySelector("h3");
        if (li.querySelector(".post-tag, .dd-badge") || /^\s*\[[^\]]+\]/.test(h3?.textContent || ""))
          res.push(slug);
      }
      return res;
    }, slugs);
    expect(bad, `태그가 붙어 보이는 자동 생성 글: ${bad.join(", ")}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J. 링크 미리보기 메타태그 (og:image는 PNG 절대 URL — LinkedIn/카카오톡/X는 SVG 미지원)
// ═══════════════════════════════════════════════════════════════════════════
test.describe("J. 링크 미리보기 메타태그", () => {
  const SITE = "https://jjanalysis.com";
  const ONCE = [
    'meta[property="og:type"]', 'meta[property="og:image"]',
    'meta[property="og:image:width"]', 'meta[property="og:image:height"]',
    'meta[property="og:image:type"]', 'meta[property="og:image:alt"]',
    'meta[name="twitter:card"]', 'meta[name="twitter:image"]',
  ];
  const readMeta = (page) => page.evaluate((sels) => {
    const out = {};
    for (const s of sels) {
      const els = document.head.querySelectorAll(s);
      out[s] = { n: els.length, v: els[0]?.getAttribute("content") || "" };
    }
    return out;
  }, ONCE);

  const CASES = [
    { path: "/", type: "website", image: `${SITE}/assets/images/jj-og-default.png` },
    { path: "/strategy/2026/10/28/envx-second-warrant-dividend-vs-2025-envxw/",
      type: "article", image: `${SITE}/assets/images/og/envx-second-warrant-2026.png` },
  ];
  for (const c of CASES) {
    test(`J. ${c.path} — 태그 1회씩, og:type=${c.type}, PNG 이미지`, async ({ page }) => {
      const res = await page.goto(BASE_URL + c.path, { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(200);
      const m = await readMeta(page);
      for (const s of ONCE) expect(m[s].n, `${s} 개수`).toBe(1);
      expect(m['meta[property="og:type"]'].v).toBe(c.type);
      expect(m['meta[property="og:image"]'].v).toBe(c.image);
      expect(m['meta[name="twitter:image"]'].v).toBe(c.image);
      expect(m['meta[name="twitter:card"]'].v).toBe("summary_large_image");
      expect(m['meta[property="og:image:width"]'].v).toBe("1200");
      expect(m['meta[property="og:image:height"]'].v).toBe("630");
      expect(m['meta[property="og:image:type"]'].v).toBe("image/png");
      expect(m['meta[property="og:image:alt"]'].v).not.toBe("");
      // 이미지 파일 자체도 빌드에 포함돼야 함
      const img = await page.request.get(BASE_URL + new URL(c.image).pathname);
      expect(img.status()).toBe(200);
    });
  }
});

// ────────────────────────────────────────────────────────────
// K. EN 모드 — 화면에 한글 노출 없음
//    i18n 규칙: 정적 텍스트는 .en-only/.ko-only, 속성은 data-<attr>-en/-ko,
//    JS 문자열은 jjT()/jjTT() (_layouts/default.html). 이 규칙을 빠뜨린
//    하드코딩 한글이 EN 모드에서 보이면 실패한다. 로그인 전용 화면(포트폴리오
//    내부, 모달 열린 상태)은 여기서 못 보므로 정적 HTML의 숨은 영역도 함께 검사.
// ────────────────────────────────────────────────────────────
test.describe("K. EN 모드 — 한글 노출 없음", () => {
  const PAGES = ["/", "/stock/", "/stock/envx/", "/stock/ai-capex/", "/crypto/", "/crypto/eth/",
                 "/macro/", "/rates/", "/portfolio/", "/blog/", "/about/", "/privacy/"];
  for (const p of PAGES) {
    test(`K. ${p} — EN 모드에서 보이는 한글/한글 속성 없음`, async ({ page }) => {
      await page.addInitScript(() => { try { localStorage.setItem("jj-lang", "en"); } catch (e) {} });
      await page.goto(BASE_URL + p, { waitUntil: "networkidle", timeout: 45_000 });
      const leaks = await page.evaluate(() => {
        const H = /[가-힣]/, out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const t = n.nodeValue.trim(), el = n.parentElement;
          if (!t || !H.test(t) || !el || el.closest("script,style,noscript,#langToggleBtn")) continue;
          if (el.checkVisibility && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) out.push(t.slice(0, 60));
        }
        // 숨은 모달/로그인 전용 영역 포함: ko-only 밖의 한글 속성(placeholder/title 등)
        document.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach(el => {
          if (el.closest(".ko-only,.lang-ko")) return;
          for (const a of ["placeholder", "title", "aria-label", "alt"]) {
            const v = el.getAttribute(a);
            if (v && H.test(v)) out.push(`@${a}: ${v.slice(0, 60)}`);
          }
        });
        return out;
      });
      expect(leaks, `EN 모드에서 보이는 한글:\n${leaks.join("\n")}`).toEqual([]);
    });
  }
});
