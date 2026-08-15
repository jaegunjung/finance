// scripts/send-qa-alert.js
// ─────────────────────────────────────────────────────────────────────────
// tests/freshness-check.spec.js가 qa-results/*.json에 남긴 개별 점검
// 결과를 모아서:
//   1. GitHub Actions Job Summary에 표로 기록
//   2. 문제(status: "issue")가 하나라도 있으면 Gmail로 알림 이메일 발송
//      (전부 정상이면 이메일 발송 안 함)
//
// 필요한 환경 변수 (GitHub Secrets):
//   GMAIL_USER            발신 Gmail 주소
//   GMAIL_APP_PASSWORD    Gmail 앱 비밀번호 (일반 로그인 비밀번호 아님)
//   ALERT_EMAIL           수신 이메일 주소
//   GITHUB_STEP_SUMMARY   GitHub Actions가 자동으로 설정 (로컬 실행 시 없음)
// ─────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "qa-results");
const SITE_URL = "https://jjanalysis.com/";

function loadResults() {
  if (!fs.existsSync(RESULTS_DIR)) return [];
  return fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8")))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function statusEmoji(status) {
  if (status === "ok") return "✅";
  if (status === "skipped") return "⏭️";
  return "🚨";
}

function buildSummaryMarkdown(results) {
  const lines = [
    "## JJ Finance Daily QA",
    "",
    "| 항목 | 상태 | 세부 내용 |",
    "|------|------|----------|",
  ];
  for (const r of results) {
    lines.push(`| ${r.label} | ${statusEmoji(r.status)} | ${r.detail} |`);
  }
  return lines.join("\n");
}

function buildEmailBody(okList, issueList, skippedList) {
  const lines = [];
  lines.push(`날짜: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  if (issueList.length) {
    lines.push("🚨 문제 항목:");
    for (const r of issueList) lines.push(`  - [${r.category}] ${r.label}: ${r.detail}`);
    lines.push("");
  }
  if (okList.length) {
    lines.push("✅ 정상 항목:");
    for (const r of okList) lines.push(`  - [${r.category}] ${r.label}: ${r.detail}`);
    lines.push("");
  }
  if (skippedList.length) {
    lines.push("⏭️ 스킵된 항목:");
    for (const r of skippedList) lines.push(`  - [${r.category}] ${r.label}: ${r.detail}`);
    lines.push("");
  }
  lines.push(`🔗 확인: ${SITE_URL}`);
  return lines.join("\n");
}

async function sendAlertEmail(subject, body) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !ALERT_EMAIL) {
    console.log("⚠️  GMAIL_USER / GMAIL_APP_PASSWORD / ALERT_EMAIL 미설정 — 이메일 발송 스킵 (콘솔에만 출력)");
    console.log(subject);
    console.log(body);
    return;
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: GMAIL_USER,
    to: ALERT_EMAIL,
    subject,
    text: body,
  });
  console.log(`이메일 발송 완료 → ${ALERT_EMAIL}`);
}

async function main() {
  const results = loadResults();
  if (!results.length) {
    console.log("qa-results/에 결과 파일이 없습니다 — freshness-check.spec.js가 먼저 실행되어야 합니다.");
    process.exitCode = 1;
    return;
  }

  const okList      = results.filter(r => r.status === "ok");
  const issueList    = results.filter(r => r.status === "issue");
  const skippedList = results.filter(r => r.status === "skipped");

  console.log(`정상: ${okList.length}, 문제: ${issueList.length}, 스킵: ${skippedList.length}`);

  const summaryMd = buildSummaryMarkdown(results);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd + "\n");
  } else {
    console.log(summaryMd);
  }

  if (issueList.length > 0) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const subject = `[JJ Finance QA] 🚨 ${issueList.length}개 이상 감지 - ${dateStr}`;
    const body = buildEmailBody(okList, issueList, skippedList);
    await sendAlertEmail(subject, body);
  } else {
    console.log("문제 없음 — 이메일 발송하지 않음.");
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
