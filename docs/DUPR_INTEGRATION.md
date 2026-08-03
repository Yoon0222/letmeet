# DUPR 연동 가이드 (키 승인 후 켜기)

> 상태(2026-07-25): **파트너 키 승인 대기 중**. 스캐폴드는 커밋 `141eb86`.
> 신청: DUPR API 폼(티켓 #269756) · scope "Display Rating Data".

## 구조
```
앱(profile/edit) → verifyDupr(duprId) → Edge Function dupr-verify
                                          │  (DUPR 파트너 키는 여기서만)
                                          ├→ DUPR 파트너 API 조회(복식/단식)
                                          └→ profiles 갱신(service_role)
```
- 🔒 `profiles.dupr_rating/verified/status` 는 **service_role 만** 변경 가능(트리거 `protect_dupr_columns`). 사용자는 `dupr_id`(조회 키)만 입력.
- `dupr_status`: `none` 미연동 / `linked` 레이팅 표시(A) / `verified` 소유 인증(B).

## 켜는 순서 (키 승인 후)

### 1) 마이그레이션 실행 (dev·prod)
`supabase/migrations/0056_dupr_integration.sql` — 컬럼 + 보안 트리거.

### 2) 시크릿 등록 (DUPR = ClientKey + ClientSecret 방식 확정)
```bash
supabase secrets set DUPR_API_BASE=https://uat.mydupr.com/api   # UAT (운영은 운영 URL)
supabase secrets set DUPR_CLIENT_KEY=<ClientKey> DUPR_CLIENT_SECRET=<ClientSecret>
# (선택) supabase secrets set DUPR_API_VERSION=v1.0
```
(dev: `--project-ref pjfhxkvdjipvdmfsacie` / prod: `jbvtdthtmrlndduqiikj`)

### 3) 함수 배포
```bash
supabase functions deploy dupr-verify --project-ref <ref>
```

### 4) ✅ 실제 API 스펙으로 확정 완료 (2026-08, OpenAPI 확인)
`uat.mydupr.com/api/v3/api-docs` 로 확인해 함수를 실제 값으로 맞춤:
- **인증** `POST {BASE}/auth/{version}/token`, 헤더 `x-authorization: base64(ClientKey:ClientSecret)`, 바디 없음 → `{ result: { token, expiry } }`
- **조회** `GET {BASE}/user/{version}/{id}` → `{ result: { ratings:{doubles,singles}, fullName } }`
- **검색** `POST {BASE}/user/{version}/search` `{query,offset,limit}` → `{ result:{ hits:[...] } }`
- **레이팅**: `ratings.doubles`/`ratings.singles` 는 문자열("3.5"/"NR") → 함수가 parseFloat + 범위검증
- version 기본 `v1.0`

### 5) 검증
dev 함수 배포 후, 앱 프로필 편집 → DUPR ID 입력 → "레이팅 불러오기":
- 키 미설정: `503 dupr_not_configured` → "아직 준비 중" 토스트(정상)
- 정상: 복식/단식 표시 + `dupr_status='linked'` 배지

## 레이팅 변경 웹훅 (자동 갱신) — 2026-08-03 구현·검증

DUPR 가 구독한 선수의 레이팅이 경기 후 바뀌면 우리 서버로 POST → 프로필/그래프 자동 갱신.

```
경기 종료 → DUPR 레이팅 재계산 → (RATING 웹훅) → Edge Function dupr-webhook
   → profiles 갱신 + dupr_rating_history append + 푸시 알림
```

### 구성요소
- **`dupr-webhook`** (공개 함수, `--no-verify-jwt`): DUPR 가 호출. URL 의 `?s=<DUPR_WEBHOOK_SECRET>` 로 진위 검증(ClientHookRequest 에 secret 필드 없음). 페이로드 `RatingWebhookEnvelope{ message:{ duprId, timestamp, rating:{doubles,singles(문자열),matchId} } }` 파싱 → `dupr_id` 로 유저 매칭 → 갱신.
- **`dupr-verify`** 확장:
  - 연결(verify) 성공 시 `POST /user/{v}/subscribe/webhook-event {duprIds,[topic:RATING]}` 로 **자동 구독**.
  - `setup` 액션(시크릿 게이트): 웹훅 URL 등록 / 스키마 조회 / 구독목록.

### 켜는 순서 (dev 완료 · prod 시 동일)
```bash
# 1) 웹훅 시크릿 생성·등록 (임의값)
supabase secrets set DUPR_WEBHOOK_SECRET=<랜덤32자> --project-ref <ref>
# 2) 함수 배포 (웹훅은 반드시 --no-verify-jwt)
supabase functions deploy dupr-verify  --project-ref <ref>
supabase functions deploy dupr-webhook --no-verify-jwt --project-ref <ref>
# 3) DUPR 에 우리 웹훅 URL 등록 (setup 액션, register:true)
curl -X POST ".../functions/v1/dupr-verify" -H "Authorization: Bearer <anon>" \
  -d '{"setup":true,"secret":"<DUPR_WEBHOOK_SECRET>","register":true,"list":true}'
#   → webhookUrl = https://<ref>.supabase.co/functions/v1/dupr-webhook?s=<secret>
```
- 기존 연결자(구독 코드 추가 전 연결)는 **재연결** 하거나, duprId 목록으로 일괄 `subscribe/webhook-event` 호출 필요.

### 검증(dev, 2026-08-03)
- 등록 `200 registered ok` · 잘못된 시크릿 `401` · 정상 이벤트 `200 + 프로필/히스토리 갱신`(합성 6포인트로 그래프 실데이터 확인).
- ⚠️ dev 의 `관리자`(JZKMXM) 프로필엔 테스트용 합성 레이팅/히스토리가 들어있음(실데이터 아님).

## 운영키(Production Key) 심사 — 요건 & 전환 (2026-08-03)

발급: `tech@mydupr.com` 로 (1) 플랫폼 URL (2) 테스트계정 (3) 요건 충족 요약+테스트 절차 이메일 → 심사 영업일 10일 → 통과 시 운영키.

**요건 현황** (GitBook `dupr-raas` 기준): SSO전용연결·레이팅표시·웹훅·경기CRUD(권한자만)·**엔티틀먼트(BASIC_L1) 게이팅**·**SSO토큰 저장+refresh**·**자격 24h 재조회**·**지원/분쟁 창구** → 전부 구현 완료. (남은 실무: SUPPORT_EMAIL 도메인 메일 실동작, 실사용 검증)

**운영 전환 시 바꿀 것** (env/시크릿):
- `DUPR_API_BASE` = `https://api.mydupr.com/api` (또는 DUPR 안내 운영 URL)
- `DUPR_SSO_BASE` = `https://dashboard.dupr.com/login-external-app` (UAT: uat.dupr.gg)
- `DUPR_PUBLIC_BASE` = `https://api.dupr.gg` (UAT: api.uat.dupr.gg)
- `DUPR_CLIENT_KEY`/`SECRET` = 운영키, `DUPR_WEBHOOK_SECRET` 재생성 + `setup register` 로 운영 웹훅 URL 등록
- 운영 토큰수명: access 30일 / refresh 90일 (UAT 7/30)

**API Access 제약(문서)**: 미연결 유저는 User Details/Match History 403, search 는 연결유저만, rating 구독은 미연결 시 400, 미연결 선수 경기데이터는 "A DUPR User" 로 마스킹. (경기 제출은 미연결자도 가능하나 결과조회는 연결 후) → 우리는 연결(verified)+BASIC 게이트라 안전.

## Level B — 소유 인증(OAuth) (후속)
DB(`dupr_status='verified'`)와 UI 배지("DUPR 인증됨")는 준비됨.
실제 흐름(DUPR 로그인 → 본인 계정 연결)은 **DUPR 파트너 OAuth 스펙**이 있어야
구현 가능 → 키 승인 시 함께 받는 문서로 착수. 그때 `dupr-oauth` 함수 추가 예정.
