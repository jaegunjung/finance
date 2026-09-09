---
layout: post
title: "Qualcomm Just Became AWS's First Western Hyperscaler Customer — a Deal Worth Up to $60 Billion"
title_en: "Qualcomm Just Became AWS's First Western Hyperscaler Customer — a Deal Worth Up to $60 Billion"
title_ko: "퀄컴, AWS의 첫 서구권 하이퍼스케일러 고객이 되다 — 최대 $60B 규모 계약"
date: 2026-09-09
categories: sp500
tags: [AI, capex, hyperscaler, Qualcomm, QCOM, Amazon, AWS, Broadcom, AMD, NVIDIA, custom-silicon, inference, semiconductors]
excerpt: "On September 8, Qualcomm disclosed via SEC 8-K that it signed a multi-generational custom AI inference chip and optical-networking deal with AWS, structured as a stock warrant for up to 25 million QCOM shares (~$4B) that vests as Amazon purchases up to $60 billion of Qualcomm products through 2036. QCOM jumped as much as 9.5% intraday -- its best single-day move in years -- while AMD and Broadcom also rallied, a market reading this as validation of the custom-silicon category broadly rather than a zero-sum threat to any one chipmaker. It's the third major custom-silicon hyperscaler relationship this blog has now tracked, after Broadcom's Google/Meta/OpenAI/Anthropic backlog and Nvidia's own financing web."
excerpt_en: "On September 8, Qualcomm disclosed via SEC 8-K that it signed a multi-generational custom AI inference chip and optical-networking deal with AWS, structured as a stock warrant for up to 25 million QCOM shares (~$4B) that vests as Amazon purchases up to $60 billion of Qualcomm products through 2036. QCOM jumped as much as 9.5% intraday -- its best single-day move in years -- while AMD and Broadcom also rallied, a market reading this as validation of the custom-silicon category broadly rather than a zero-sum threat to any one chipmaker. It's the third major custom-silicon hyperscaler relationship this blog has now tracked, after Broadcom's Google/Meta/OpenAI/Anthropic backlog and Nvidia's own financing web."
excerpt_ko: "9월 8일 퀄컴은 SEC 8-K 공시를 통해 AWS와 다세대(multi-generational) 커스텀 AI 추론 칩·광연결 계약을 체결했다고 밝혔다. 구조는 최대 2,500만 주(약 $4B 규모)의 QCOM 주식매수청구권(워런트)이며, 아마존이 2036년까지 퀄컴 제품을 최대 $60B어치 구매하는 만큼 베스팅되는 방식이다. QCOM 주가는 장중 최대 9.5% 급등해 수년 만의 최대 일일 상승폭을 기록했고, AMD와 브로드컴도 함께 올랐다 -- 시장은 이를 특정 칩 업체에 대한 위협이 아니라 커스텀 실리콘이라는 카테고리 자체에 대한 검증으로 읽었다. 이 블로그가 추적해온 커스텀 실리콘발 하이퍼스케일러 관계로는 브로드컴(구글·메타·OpenAI·앤트로픽)과 엔비디아의 금융 네트워크에 이어 세 번째다."
---

<div class="en-only" markdown="1">

## The Announcement: Two Product Tracks, One Warrant

On September 8, Qualcomm and Amazon Web Services announced a "multi-generational" collaboration covering two distinct product tracks: custom AI inference silicon, and optical connectivity hardware for intra-cluster networking. The deal is disclosed in a Qualcomm SEC Form 8-K filed the same day, not just a press release -- Amazon's affiliate received a warrant to acquire up to 25 million Qualcomm shares at an exercise price of $161.26, expiring September 3, 2036. At that strike price, the maximum warrant is worth roughly $4 billion, but the shares vest in tranches tied to actual commercial activity -- signed purchase orders and real spending -- not simply the passage of time. Qualcomm CFO Akash Palkhiwala confirmed at the Goldman Sachs Communacopia & Technology Conference the same morning that revenue from the partnership begins in Qualcomm's fiscal Q1 2027 (the December 2026 quarter), with chips already in production.

| Deal element | Detail |
|---|---|
| Announced | September 8, 2026 (Qualcomm SEC Form 8-K) |
| Structure | Stock warrant, up to 25M QCOM shares at $161.26/share |
| Maximum warrant value | ~$4 billion |
| Vesting trigger | Amazon purchases of up to $60B in Qualcomm chips, networking hardware, and manufacturing services |
| Warrant expiration | September 3, 2036 |
| Immediate vesting | 3.75M shares (15%) tied to initial purchase commitments |
| Product tracks | (1) Custom AI inference silicon (2) 1.6 Tbps optical connectivity |
| First revenue quarter | Qualcomm fiscal Q1 2027 (Dec. 2026 quarter) |
| FY2027 data-center revenue target | $5B ("very high confidence," per CFO) |
| FY2029 data-center AI revenue target | $15B |

Crucially -- and this matters for reading the headline $60B figure correctly -- the number is a *ceiling*, not a signed revenue contract. If Amazon spends less than $60B with Qualcomm over the decade-long term, fewer warrant shares vest and less revenue flows through. What's actually confirmed is narrower but concrete: production chips shipping in December, and a $5B FY2027 data-center revenue target the CFO is willing to call "very high confidence" in public.

## Why LPDDR Instead of HBM

The technical differentiation is the most interesting part of this deal. Nvidia's B200 and AMD's Instinct MI350X both use HBM (High Bandwidth Memory) -- roughly 180GB and 288GB per card respectively -- optimized for AI training, where massive parallel operations demand very high peak bandwidth. Qualcomm's AI200 instead uses LPDDR memory, offering up to 768GB per card, more than four times the capacity of Nvidia's flagship at a much lower cost per gigabyte. The bet is that AI *inference* -- specifically the "decode" phase where a model generates one token at a time -- is bottlenecked by whether the entire model fits in memory, not by peak bandwidth. Qualcomm's next-gen AI250 card, expected in 2027, pushes this further with a "near-memory computing" architecture that stacks compute logic next to memory.

The optical side of the deal traces back to Qualcomm's $2.4 billion acquisition of Alphawave Semi (announced June 2025, completed roughly December 2025), a SerDes IP specialist. The Amazon deal includes Qualcomm-Alphawave optical connectivity scaling to 1.6 terabits per second for the data-center network fabric that links racks together -- a second bottleneck, separate from compute silicon itself, that grows more binding as AI cluster sizes increase.

## Why This Is Not AWS Abandoning Trainium

AWS already runs two captive AI accelerator programs, Trainium (training) and Inferentia (inference), co-designed with Marvell -- both remain active and serve AWS's own internal workloads and public Trn/Inf cloud instances. The Qualcomm silicon is a different, complementary tier: chips that serve AWS's broader commercial cloud infrastructure, aimed specifically at decode-heavy inference serving for external customers, rather than replacing the in-house programs. Palkhiwala also disclosed at the Goldman Sachs event that a second, undisclosed global hyperscaler is in discussions for "similar technology scope" -- suggesting the Amazon structure is a repeatable template rather than a one-off.

## Qualcomm's 2026 Data-Center Pivot, in Context

This deal doesn't stand alone -- it's the capstone of a deliberate strategic pivot Qualcomm has been building all year, forced in part by Apple's planned phase-out of Qualcomm modems (Qualcomm's iPhone modem share is expected to fall from roughly 70% in 2025 devices to 20% in 2026 to zero by 2027).

| Date | Event |
|---|---|
| 2025-06 (announced) / ~2025-12 (closed) | Qualcomm acquires Alphawave Semi for $2.4B (SerDes/optical IP) |
| 2026-06-24 | Qualcomm Investor Day: raises non-handset revenue target to $40B by FY2029, sets $15B FY2029 data-center AI revenue goal |
| 2026-06 | Qualcomm acquires Modular Inc. (cross-platform AI compiler/software stack, aimed at reducing CUDA lock-in) |
| ~2026-06 | Qualcomm signs multi-generational CPU deal with Meta (Dragonfly C1000 series) |
| 2026-09-08 | Qualcomm-Amazon deal disclosed (SEC 8-K); revenue confirmed starting Dec. 2026 quarter |

## Market Reaction: A Rising Tide, Not a Zero-Sum Trade

QCOM shares surged as much as 9.5% intraday to $183.49 -- the stock's strongest single-day move in years and its first positive return for 2026. What's notable is that this wasn't read as bad news for competitors: AMD rose roughly 6.7% the same day, and Broadcom gained about 3%, while Amazon shares slipped only about 1%. Analysts and outlets framed the AMD/Broadcom moves as the market treating Qualcomm's entry as validation that the custom-silicon inference category is durable and expanding -- not evidence that Broadcom's existing Google/Meta/OpenAI/Anthropic programs (covered in [this blog's September 7 post](/sp500/2026/09/07/broadcom-230-billion-ai-revenue-2028/)) are under competitive pressure. Rosenblatt Securities maintained its Buy rating on Qualcomm with a $225 price target following the announcement. Nvidia still holds more than 90% of AI training and remains dominant in commercial inference GPU cloud offerings today; the erosion analysts project in Nvidia's inference share by 2028 (toward the 20-30% range) is expected to accrue mostly to hyperscalers' own captive chips (Trainium, TPU, Maia, MTIA), with third-party providers like Qualcomm only now entering that market.

## Investment Read

This is the third distinct custom-silicon-to-hyperscaler thread this blog has tracked in five weeks, after Nvidia's $500B+ third-party financing platform (Aug. 10), Anthropic's $80B compute-leasing week with Nscale and Nvidia-backed Lambda (Sept. 1), and Broadcom's first-ever $230B FY2028 AI revenue guide (Sept. 7). Each data point tells a version of the same story: AI infrastructure demand is fragmenting across an increasing number of suppliers and structures rather than concentrating solely in Nvidia GPUs bought directly by Microsoft/Google/Amazon/Meta balance sheets. What makes this one different is the *financing mechanism* -- a milestone-vesting equity warrant rather than a cash purchase order or a lease -- which functions as a mutual performance guarantee: Amazon's upside depends on Qualcomm delivering at scale, and Qualcomm's revenue depends on Amazon's AI buildout continuing at pace. That structure (reportedly similar to a warrant Amazon issued to STMicroelectronics earlier in 2026) is worth watching as a template other chip suppliers may adopt. The open question the next several quarters will answer is whether LPDDR-based, capacity-over-bandwidth silicon actually wins meaningful share in production decode workloads, or whether Qualcomm's $5B FY2027 target proves to be the ceiling rather than the floor of this relationship.

---

*Disclaimer: This post is for informational purposes only and does not constitute investment advice. All investment decisions are the reader's sole responsibility.*

**Sources**: Qualcomm SEC Form 8-K filing (2026-09-08); SiliconANGLE "Qualcomm inks AI chip, optical networking deal with Amazon" (2026-09-08); Tech Times "Qualcomm Wins First Western Hyperscaler: AWS Deal Pays Up to $60B for Inference Silicon" (2026-09-08), citing Qualcomm CFO Akash Palkhiwala's remarks at the Goldman Sachs Communacopia & Technology Conference (2026-09-08); Reuters "Qualcomm, Amazon develop custom chips for AI data centers" (2026-09-08); Bloomberg "Qualcomm Lands Amazon as Customer for Push Into AI Chips" (2026-09-08); Barron's "Why Qualcomm's AI Chip Deal Proves Nvidia Is Still Top Dog" (2026-09-09); Yahoo Finance "AMD Jumps 6.7% While Amazon Opens a $60 Billion AI-Chip Door" (2026-09-09); this blog's August 10, September 1, and September 7 posts on Nvidia's financing platform, Anthropic's compute deals, and Broadcom's FY2028 guide.

</div>

<div class="ko-only" markdown="1">

## 발표 내용: 두 개의 제품 트랙, 하나의 워런트

9월 8일 퀄컴과 아마존웹서비스(AWS)는 커스텀 AI 추론 실리콘과 클러스터 내부 연결용 광통신 하드웨어라는 두 개의 개별 제품 트랙을 아우르는 "다세대(multi-generational)" 협력을 발표했다. 이 계약은 단순 보도자료가 아니라 같은 날 제출된 퀄컴의 SEC Form 8-K 공시로 확인된다 -- 아마존 계열사는 행사가 $161.26, 만료일 2036년 9월 3일인 퀄컴 주식 최대 2,500만 주에 대한 매수청구권(워런트)을 받았다. 이 행사가 기준 워런트의 최대 가치는 약 $4B이지만, 실제 베스팅(vesting)은 단순한 시간 경과가 아니라 실제 구매주문 체결·실구매 등 상업적 활동에 연동된 트랑슈(tranche) 방식으로 이뤄진다. 퀄컴 CFO 아카시 팔키왈라는 같은 날 오전 골드만삭스 Communacopia & Technology 컨퍼런스에서 이 파트너십으로 인한 매출이 퀄컴의 2027 회계연도 1분기(2026년 12월 분기)부터 발생하며, 칩은 이미 생산 중이라고 확인했다.

| 계약 요소 | 내용 |
|---|---|
| 발표일 | 2026년 9월 8일 (퀄컴 SEC Form 8-K) |
| 구조 | 주식 워런트, 최대 QCOM 2,500만 주, 주당 $161.26 |
| 워런트 최대 가치 | 약 $4B |
| 베스팅 조건 | 아마존의 퀄컴 칩·네트워킹 하드웨어·제조 서비스 최대 $60B 구매 |
| 워런트 만료일 | 2036년 9월 3일 |
| 즉시 베스팅 | 375만 주(15%), 초기 구매 약정에 연동 |
| 제품 트랙 | (1) 커스텀 AI 추론 실리콘 (2) 1.6Tbps 광연결 |
| 첫 매출 발생 분기 | 퀄컴 2027 회계연도 1분기 (2026년 12월 분기) |
| FY2027 데이터센터 매출 목표 | $5B ("매우 높은 확신", CFO 발언) |
| FY2029 데이터센터 AI 매출 목표 | $15B |

중요한 점은 -- 헤드라인 숫자 $60B를 정확히 읽으려면 -- 이 수치가 확정된 매출 계약이 아니라 *상한선*이라는 것이다. 아마존이 10년 계약기간 동안 퀄컴에 $60B 미만을 지출한다면 워런트 베스팅 주식 수도, 실제 매출도 그만큼 줄어든다. 실제로 확인된 것은 더 좁지만 구체적이다: 12월부터 양산 칩 출하가 시작되고, CFO가 공개적으로 "매우 높은 확신"을 표한 FY2027 데이터센터 매출 목표 $5B다.

## HBM 대신 LPDDR을 쓰는 이유

이 계약에서 가장 흥미로운 부분은 기술적 차별화다. 엔비디아의 B200과 AMD의 Instinct MI350X는 각각 약 180GB, 288GB의 HBM(고대역폭메모리)을 탑재하는데, 이는 대규모 병렬 연산이 동시에 일어나는 AI 학습에 최적화된 방식으로 매우 높은 피크 대역폭을 요구한다. 반면 퀄컴의 AI200은 LPDDR 메모리를 사용해 카드당 최대 768GB를 지원한다 -- 엔비디아 플래그십의 4배가 넘는 용량을, 기가바이트당 훨씬 낮은 비용으로 제공한다. 퀄컴의 베팅은 AI *추론*, 특히 모델이 토큰을 하나씩 순차적으로 생성하는 "디코드" 단계는 피크 대역폭이 아니라 모델 전체가 메모리에 상주할 수 있는지가 병목이라는 것이다. 2027년 출시 예정인 퀄컴의 차세대 AI250 카드는 컴퓨팅 로직을 메모리 바로 옆에 쌓는 "근접 메모리 컴퓨팅" 아키텍처로 이를 한 단계 더 밀어붙인다.

광통신 쪽은 퀄컴의 SerDes IP 전문업체 Alphawave Semi 인수($2.4B, 2025년 6월 발표·약 2025년 12월 완료)로 거슬러 올라간다. 이번 아마존 계약에는 랙 사이를 연결하는 데이터센터 네트워크 패브릭용으로 초당 1.6테라비트까지 확장되는 퀄컴-Alphawave 광연결 기술이 포함된다 -- 컴퓨팅 실리콘 자체와는 별개로, AI 클러스터 규모가 커질수록 점점 더 결정적인 병목이 되는 두 번째 지점이다.

## AWS가 Trainium을 포기하는 게 아닌 이유

AWS는 이미 Marvell과 공동 설계한 자체 캡티브 AI 가속기 프로그램 두 개 -- 학습용 Trainium, 추론용 Inferentia -- 를 운영 중이며, 둘 다 AWS 내부 워크로드와 공개 Trn/Inf 클라우드 인스턴스에 계속 쓰인다. 퀄컴 실리콘은 이를 대체하는 것이 아니라 별개의 보완적 계층이다 -- 자체 프로그램이 아니라 외부 고객을 대상으로 한 AWS의 더 넓은 상업용 클라우드 인프라, 특히 디코드 비중이 큰 추론 서빙을 겨냥한다. 팔키왈라는 골드만삭스 행사에서 이름을 밝히지 않은 두 번째 글로벌 하이퍼스케일러가 "유사한 기술 범위"로 논의 중이라고도 밝혔다 -- 아마존 구조가 일회성이 아니라 반복 가능한 템플릿이라는 뜻이다.

## 퀄컴의 2026년 데이터센터 피벗, 맥락에서 보기

이번 계약은 단독 사건이 아니다 -- 퀄컴이 올해 내내 의도적으로 쌓아온 전략적 전환의 정점이며, 그 배경에는 애플의 퀄컴 모뎀 단계적 퇴출 계획이 있다(퀄컴의 아이폰 모뎀 점유율은 2025년 모델 약 70%에서 2026년 20%, 2027년 0%로 하락할 것으로 예상된다).

| 날짜 | 사건 |
|---|---|
| 2025.6 발표 / 2025.12경 완료 | 퀄컴, Alphawave Semi $2.4B에 인수 (SerDes·광통신 IP) |
| 2026.6.24 | 퀄컴 인베스터 데이(Investor Day): 비휴대폰 매출 목표를 FY2029까지 $40B로 상향, FY2029 데이터센터 AI 매출 목표 $15B 제시 |
| 2026.6 | 퀄컴, Modular Inc. 인수 (범용 AI 컴파일러·소프트웨어 스택, CUDA 종속 완화 목적) |
| 2026.6경 | 퀄컴-메타, 다세대 CPU 계약 체결 (Dragonfly C1000 시리즈) |
| 2026.9.8 | 퀄컴-아마존 계약 공시(SEC 8-K); 2026년 12월 분기부터 매출 발생 확인 |

## 시장 반응: 제로섬이 아닌 동반 상승

QCOM 주가는 장중 최대 9.5% 급등해 $183.49를 기록했다 -- 수년 만의 최대 일일 상승폭이자 2026년 들어 첫 플러스 수익률이다. 주목할 점은 이것이 경쟁사에 악재로 읽히지 않았다는 것이다. 같은 날 AMD도 약 6.7% 올랐고 브로드컴도 약 3% 상승했으며, 아마존 주가는 약 1% 소폭 하락하는 데 그쳤다. 애널리스트와 매체들은 AMD·브로드컴의 동반 상승을, [이 블로그의 9월 7일 글](/sp500/2026/09/07/broadcom-230-billion-ai-revenue-2028/)에서 다룬 브로드컴의 구글·메타·OpenAI·앤트로픽 수주잔고가 경쟁 압박을 받는다는 신호가 아니라, 커스텀 실리콘 추론이라는 카테고리 자체가 견고하고 확장되고 있다는 시장의 검증으로 해석했다. 로젠블랫 증권은 발표 이후 퀄컴에 대해 매수 등급과 목표주가 $225를 유지했다. 엔비디아는 여전히 AI 학습의 90% 이상을 차지하고 상업용 추론 GPU 클라우드에서도 오늘날 지배적 위치에 있다 -- 애널리스트들이 2028년까지 예상하는 엔비디아 추론 점유율 하락(20~30%대까지)은 대부분 하이퍼스케일러 자체 캡티브 칩(Trainium, TPU, Maia, MTIA)으로 흡수될 것으로 보이며, 퀄컴 같은 제3자 공급업체는 이제 막 이 시장에 진입하는 단계다.

## 투자 관점

이번 뉴스는 이 블로그가 5주 사이 추적한 세 번째 "커스텀 실리콘 → 하이퍼스케일러" 흐름이다 -- 엔비디아의 $500B+ 제3자 금융 플랫폼(8월 10일), 앤트로픽의 Nscale·Lambda 대상 $80B 컴퓨팅 임대 한 주(9월 1일), 브로드컴의 사상 첫 FY2028 $230B AI 매출 가이던스(9월 7일)에 이은 것이다. 각 사례는 같은 이야기의 다른 버전을 들려준다: AI 인프라 수요가 마이크로소프트·구글·아마존·메타의 재무제표가 직접 사들이는 엔비디아 GPU 하나로 집중되기보다, 점점 더 많은 공급자와 구조로 분산되고 있다는 것이다. 이번 계약이 다른 점은 *금융 메커니즘*이다 -- 현금 구매주문이나 임대가 아니라 마일스톤 연동 지분 워런트라는 구조는 상호 이행보증처럼 작동한다. 아마존의 지분 수익은 퀄컴이 실제로 규모 있게 공급해야 실현되고, 퀄컴의 매출은 아마존의 AI 구축이 계속 속도를 유지해야 실현된다. (보도에 따르면 아마존이 2026년 초 STMicroelectronics에 발행한 워런트와 유사한 구조라고 한다.) 다른 칩 공급업체들이 채택할 수 있는 템플릿으로서 지켜볼 가치가 있다. 앞으로 몇 분기 동안 확인해야 할 질문은, LPDDR 기반의 "대역폭보다 용량" 실리콘이 실제 프로덕션 디코드 워크로드에서 의미 있는 점유율을 얻어낼 수 있는지, 아니면 퀄컴의 FY2027 $5B 목표가 이 관계의 바닥이 아니라 천장으로 판명될지 여부다.

---

*면책 고지: 이 글은 정보 제공 목적으로 작성됐습니다. 투자 조언이 아니며, 모든 투자 결정은 독자 본인의 책임입니다.*

**출처**: 퀄컴 SEC Form 8-K 공시(2026-09-08); SiliconANGLE "Qualcomm inks AI chip, optical networking deal with Amazon"(2026-09-08); Tech Times "Qualcomm Wins First Western Hyperscaler: AWS Deal Pays Up to $60B for Inference Silicon"(2026-09-08, 퀄컴 CFO 아카시 팔키왈라의 골드만삭스 Communacopia & Technology 컨퍼런스 발언 인용, 2026-09-08); 로이터 "Qualcomm, Amazon develop custom chips for AI data centers"(2026-09-08); 블룸버그 "Qualcomm Lands Amazon as Customer for Push Into AI Chips"(2026-09-08); Barron's "Why Qualcomm's AI Chip Deal Proves Nvidia Is Still Top Dog"(2026-09-09); 야후 파이낸스 "AMD Jumps 6.7% While Amazon Opens a $60 Billion AI-Chip Door"(2026-09-09); 이 블로그의 8월 10일·9월 1일·9월 7일 글(엔비디아의 금융 플랫폼, 앤트로픽 컴퓨팅 계약, 브로드컴 FY2028 가이던스 관련).

</div>
