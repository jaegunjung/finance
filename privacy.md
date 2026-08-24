---
layout: default
title: Privacy Policy
permalink: /privacy/
---
<style>
.about-content ul + h2 { margin-top: 1.25em; }
.about-content ul + p { margin-top: 1.4em; }
</style>
<div style="padding: 32px 0 20px;">
  <h1>Privacy Policy</h1>
</div>
<div class="about-content">

  <div class="en-only">

    <p style="color: var(--text-muted); font-size: 0.85rem;">Last updated: August 23, 2026</p>

    <h2>Overview</h2>
    <p>
      JJ International Financial Analysis ("this site," "we") is an independent research blog and
      portfolio-tracking tool run by a single developer, not a company with a dedicated legal or
      compliance team. This page explains what data the site collects, how it's stored, and who it's
      shared with — in plain language, grounded in how the site actually works today. It is not a
      substitute for legal advice.
    </p>

    <h2>What We Collect</h2>
    <ul>
      <li><strong>Account info</strong> — if you sign in (via Google OAuth or an email magic link, both handled by Supabase Auth), we receive your email address and, for Google sign-in, your name and profile picture.</li>
      <li><strong>Portfolio &amp; transaction data</strong> — if you use the Portfolio tool, the trades, holdings, and account settings you enter or import (manually or via CSV upload, including files you optionally select through Google Drive Picker) are stored under your account.</li>
      <li><strong>Site usage</strong> — standard analytics (page views, referrers) via Google Analytics, and your language preference (English/Korean) saved locally in your browser (localStorage) — this never leaves your device.</li>
      <li><strong>Newsletter</strong> — if you subscribe, your email is collected and managed by Buttondown, a separate third-party service, only after you opt in.</li>
    </ul>
    <p>
      We only collect what's needed to run the features above. We don't run ad-tracking pixels or sell
      any data to data brokers.
    </p>

    <h2>How Your Data Is Protected</h2>
    <p>
      Portfolio and transaction data is stored in a Postgres database hosted on Supabase. Connections
      between your browser, this site, and the database are encrypted in transit (TLS/HTTPS), and the
      underlying storage is encrypted at rest by Supabase's cloud infrastructure. Database access is
      restricted with Row Level Security, so your account can only ever read or write its own rows —
      other users' data isn't visible to you, and vice versa.
    </p>
    <p>
      That said, this data is not end-to-end or column-level encrypted beyond the above — it's the same
      standard of protection most small SaaS tools provide by default, not a custom encryption layer.
      If you'd prefer not to store real trading history, you're welcome to use placeholder/test data.
    </p>

    <h2>AI-Assisted Analysis</h2>
    <p>
      The "코치 조언" (coaching) feature in the Portfolio tool currently runs entirely as rule-based
      logic in your browser — it does not send your data to any third-party AI service. We're planning
      an optional AI-assisted analysis feature (built on Anthropic's Claude API) for a future release.
      When that launches, this section will be updated to describe exactly what's sent, and the feature
      will be opt-in — your portfolio data won't be sent to any AI provider without your action.
    </p>

    <h2>Who We Share Data With</h2>
    <p>We use a small number of third-party services to run the site, each only for its specific purpose:</p>
    <ul>
      <li><strong>Supabase</strong> — database, authentication, and file storage</li>
      <li><strong>Google</strong> — OAuth sign-in, Google Drive Picker (only when you choose to import a file from Drive), and Google Analytics</li>
      <li><strong>Buttondown</strong> — newsletter delivery, only for subscribers</li>
      <li><strong>GitHub Pages</strong> — static site hosting for the pages you're browsing</li>
    </ul>
    <p>
      We don't sell your data or share it with anyone beyond these operational providers.
    </p>

    <h2>Your Choices</h2>
    <p>
      You can delete individual transactions or entire portfolios yourself from within the Portfolio
      tool at any time. To request full account deletion, or to ask what data we hold about you, email
      <a href="mailto:admin@jjanalysis.com">admin@jjanalysis.com</a>.
    </p>

    <h2>Children's Privacy</h2>
    <p>This site isn't directed at children under 13, and we don't knowingly collect data from them.</p>

    <h2>Changes to This Policy</h2>
    <p>
      If what we collect or how we use it changes materially, we'll update this page and adjust the
      "Last updated" date above.
    </p>

    <h2>Contact</h2>
    <p>Questions about this policy: <a href="mailto:admin@jjanalysis.com">admin@jjanalysis.com</a></p>

  </div>

  <div class="ko-only">

    <p style="color: var(--text-muted); font-size: 0.85rem;">최종 업데이트: 2026년 8월 23일</p>

    <h2>개요</h2>
    <p>
      JJ International Financial Analysis(이하 "이 사이트", "저희")는 별도의 법무·컴플라이언스 조직이 있는
      회사가 아니라 개인 개발자 한 명이 운영하는 리서치 블로그이자 포트폴리오 트래커입니다. 이 페이지는
      사이트가 실제로 어떤 데이터를 수집하고, 어떻게 저장하며, 누구와 공유하는지를 사이트의 실제 동작 방식에
      맞춰 평이한 언어로 설명합니다. 법률 자문을 대체하지 않습니다.
    </p>

    <h2>수집하는 정보</h2>
    <ul>
      <li><strong>계정 정보</strong> — 로그인 시(Supabase Auth를 통한 Google OAuth 또는 이메일 매직링크), 이메일 주소를 받으며 Google 로그인의 경우 이름과 프로필 사진도 받습니다.</li>
      <li><strong>포트폴리오·거래 데이터</strong> — 포트폴리오 도구를 사용하면, 직접 입력하거나 가져온(수동 입력 또는 CSV 업로드, Google Drive Picker로 선택한 파일 포함) 거래 내역·보유 종목·계좌 설정이 계정에 저장됩니다.</li>
      <li><strong>사이트 이용 정보</strong> — Google Analytics를 통한 표준 분석(페이지뷰, 유입경로), 그리고 브라우저에 로컬로 저장되는 언어 설정(영어/한국어, localStorage) — 이 값은 기기 밖으로 나가지 않습니다.</li>
      <li><strong>뉴스레터</strong> — 구독 시, 이메일 주소가 별도 서비스인 Buttondown에서 수집·관리됩니다 (동의 후에만).</li>
    </ul>
    <p>
      위 기능 운영에 필요한 최소한의 정보만 수집합니다. 광고 추적 픽셀을 쓰지 않고, 어떤 데이터도 데이터
      브로커에 판매하지 않습니다.
    </p>

    <h2>데이터 보호 방식</h2>
    <p>
      포트폴리오·거래 데이터는 Supabase에서 호스팅하는 Postgres 데이터베이스에 저장됩니다. 브라우저-사이트-DB
      간 통신은 전송 구간에서 암호화되며(TLS/HTTPS), 저장소 자체도 Supabase 클라우드 인프라 차원에서 저장
      시 암호화됩니다. 데이터베이스 접근은 Row Level Security로 제한되어 본인 계정은 본인 데이터만 읽고
      쓸 수 있고, 다른 사용자의 데이터는 보이지 않습니다 (그 반대도 마찬가지).
    </p>
    <p>
      다만 이 이상의 종단간(end-to-end) 또는 컬럼 단위 암호화는 적용돼 있지 않습니다 — 별도의 커스텀
      암호화 계층이 아니라, 대부분의 소규모 SaaS 도구가 기본으로 제공하는 수준의 보호입니다. 실제 거래
      내역을 저장하고 싶지 않으시면 테스트용 데이터를 사용하셔도 됩니다.
    </p>

    <h2>AI 기반 분석</h2>
    <p>
      포트폴리오 도구의 "코치 조언" 기능은 현재 브라우저 안에서 동작하는 규칙 기반(rule-based) 로직으로만
      작동하며, 사용자 데이터를 제3의 AI 서비스로 보내지 않습니다. 향후 Anthropic Claude API 기반의
      선택적(opt-in) AI 분석 기능을 계획하고 있습니다. 해당 기능이 출시되면 정확히 무엇이 전송되는지 이
      섹션을 업데이트할 것이며, 사용자가 직접 활성화하지 않는 한 포트폴리오 데이터가 AI 제공업체로
      전송되지 않습니다.
    </p>

    <h2>데이터 공유 대상</h2>
    <p>사이트 운영을 위해 각각 고유 목적으로만 사용하는 소수의 제3자 서비스를 이용합니다:</p>
    <ul>
      <li><strong>Supabase</strong> — 데이터베이스, 인증, 파일 저장</li>
      <li><strong>Google</strong> — OAuth 로그인, Google Drive Picker(사용자가 Drive에서 파일을 가져오기로 선택한 경우에만), Google Analytics</li>
      <li><strong>Buttondown</strong> — 뉴스레터 발송 (구독자에 한함)</li>
      <li><strong>GitHub Pages</strong> — 지금 보고 계신 페이지의 정적 호스팅</li>
    </ul>
    <p>데이터를 판매하지 않으며, 위 운영 목적 제공업체 외에는 공유하지 않습니다.</p>

    <h2>사용자가 할 수 있는 것</h2>
    <p>
      포트폴리오 도구 안에서 언제든 개별 거래 또는 포트폴리오 전체를 직접 삭제할 수 있습니다. 계정 전체
      삭제를 요청하거나 보유 중인 데이터가 무엇인지 문의하려면
      <a href="mailto:admin@jjanalysis.com">admin@jjanalysis.com</a>으로 연락 주세요.
    </p>

    <h2>아동 개인정보 보호</h2>
    <p>이 사이트는 만 13세 미만 아동을 대상으로 하지 않으며, 해당 연령층의 정보를 의도적으로 수집하지 않습니다.</p>

    <h2>정책 변경</h2>
    <p>수집 항목이나 이용 방식이 실질적으로 바뀌면 이 페이지와 위의 "최종 업데이트" 날짜를 갱신합니다.</p>

    <h2>문의</h2>
    <p>이 정책에 대한 문의: <a href="mailto:admin@jjanalysis.com">admin@jjanalysis.com</a></p>

  </div>

</div>
