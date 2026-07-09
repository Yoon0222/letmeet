# DUPR 연동 — 파트너 신청 가이드

## 진행 상태 (2026-07-09 업데이트)
- 1차 신청 메일 발송함 → **DUPR(Rebecca) 회신 도착.** 결론: **"플랫폼이 라이브·공개 상태여야 승인"**. 초기 컨셉·프로토타입·개발 중 툴은 안 받음.
- 승인 조건 3가지: ① **Live, Operational Platform**(공개 접근·완전 작동) ② **Pickleball-Relevant**(대회/코트예약/리그/커뮤니티 — ✅ 우리 해당) ③ **Scalability & Community Impact**.
- **우리 게이트 = ①번뿐.** 현재 심사 제출 단계라 아직 라이브 아님 → **지금 회신해도 통과 안 됨.**
- **행동 계획**: 스토어 출시(App Store/Play 라이브) → 라이브 URL 확보 → Rebecca에게 "이제 출시됐다" 회신(아래 초안) → 온보딩 진행.
- 원문 발췌: *"prioritizing requests from fully functioning, pickleball-related software businesses… Live, Operational Platform: publicly accessible and fully functioning… revisit the request once your platform is live."*

## 출시 후 회신 초안 (영문)
```
Subject: Re: API Partner Integration Request — Peanut (now live)

Hi Rebecca,

Thanks for the guidance. Peanut is now live and publicly available:
  - App Store: <링크>
  - Google Play: <링크>

It's a fully functioning pickleball platform in South Korea offering
court reservations, meetups/matchmaking, clubs, and tournament
management with bracket engine. We'd love to proceed with the API
partner onboarding to (1) let users verify/display their DUPR rating
in-app and (2) upload tournament/match results to DUPR.

  - Region: South Korea
  - Current scope: rating lookup/verification + match result upload
  - Users/clubs: <채워넣기: 가입자 수·클럽 수·대회 건수 등 지표>
  - Technical contact: <이메일>
  - DUPR Club: <있으면 Club ID>

Could you guide us through the next steps? Thank you!
```

## 현실 요약
- DUPR은 **공개 API가 없다.** 비공개 파트너 API는 **승인받은 파트너**만 접근 가능.
- 스크래핑(비공식 API)은 **ToS 위반 + 불안정** → 사용 금지.
- 따라서 **실제 레이팅 검증/동기화는 DUPR 파트너 승인이 선행**돼야 함.
- 앱 코드/데이터모델(`profiles.dupr_id/dupr_rating/dupr_verified`)은 이미 준비돼 있음 → 승인·키 오면 바로 연결.

## 두 가지 설정 (개념 구분)
1. **DUPR Club** — dupr.com/clubs 에서 클럽 생성 → **Club ID** 발급. 이벤트/경기결과를 클럽으로 업로드하는 단위. (경기결과 → 레이팅 반영에 필요)
2. **API Partner** — 피넛 "앱 자체"를 DUPR과 통합하려면 **API 파트너 승인** 필요. 승인 시 API credential + 파트너 문서 제공.

> 피넛이 원하는 것(앱에서 레이팅 조회·인증, 경기결과 제출)은 **API Partner** 경로.

## 신청 절차
1. **DUPR Club 먼저 생성** (dupr.com/clubs) — Club ID 확보. 무료.
2. **파트너십 문의 메일** → `support@mydupr.com` (또는 계정 매니저). 아래 내용 포함.
3. DUPR이 검토 → **API credential + 파트너 API 문서(Zendesk: API Partner Integrations)** 제공.
4. 문서대로 인증(토큰/키) + 엔드포인트(플레이어 조회·레이팅·경기 제출) 연동.

## 신청 시 준비물 (메일에 담을 내용)
- 서비스 소개: **피넛(PEANUT)** — 한국 피클볼 커뮤니티/예약/대회 앱
- 앱/회사 정보, 링크(스토어 or 소개)
- 예상 사용자·클럽 규모, 지역(**대한민국**)
- 통합 목적: ① 사용자 **DUPR 레이팅 조회·인증** ② 대회/경기 결과 **DUPR 업로드**(레이팅 반영)
- 기술 담당 연락처(이메일)
- DUPR Club ID(있으면)

## 신청 메일 샘플 (영문)
```
Subject: API Partner Integration Request — Peanut (Korea pickleball app)

Hello DUPR team,

We're building "Peanut", a pickleball community app in South Korea
(court reservations, meetups, and tournaments). We'd like to become a
DUPR API integration partner to:
  1) let our users verify/display their DUPR rating in-app, and
  2) upload our tournament/match results to DUPR so ratings update.

Could you share the API partner onboarding process, documentation, and
credential setup? We already have (or can create) a DUPR Club.

- App: Peanut (PEANUT) — Korea
- Expected users/clubs: <채워넣기>
- Integration scope: rating lookup/verification + match result upload
- Technical contact: <이메일>

Thank you!
```

## 승인 후 우리가 붙일 것 (코드 준비됨)
- Edge Function `dupr-verify`: partner API로 DUPR ID/이메일 조회 → 레이팅 받아 `dupr_rating`·`dupr_verified=true` 세팅 (service_role, 시크릿 보관).
- 프로필: "DUPR 인증하기" 버튼 → 위 함수 호출 → 인증 뱃지.
- (2차) 대회 경기결과 → DUPR 업로드(클럽 연동).

## 지금(승인 전) 가능한 것
- **자가입력 + DUPR 공개프로필 링크**: dupr_id 입력 → 본인 DUPR 프로필로 링크(수동 확인) + "미인증" 표시. 파트너 없이 출시 가능.

## 참고 링크
- DUPR 클럽 만들기: https://www.dupr.com/clubs
- 클럽 리소스: https://www.dupr.com/club-resources
- API 파트너 통합(파트너 전용 문서): https://dupr.zendesk.com/hc/en-us/categories/32142598126740-API-Partner-Integrations
- 파트너 API 예시 저장소: https://github.com/Info-Esportes/dupr-partner-api
- 문의: support@mydupr.com
