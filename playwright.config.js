// playwright.config.js
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",

  // 각 테스트 타임아웃
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // CI에서 1회 재시도
  retries: process.env.CI ? 1 : 0,

  // CI에서 순차 실행 (Jekyll 서버 부하 방지)
  workers: process.env.CI ? 1 : 2,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:4000",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  outputDir: "test-results",
});
