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

## Level B — 소유 인증(OAuth) (후속)
DB(`dupr_status='verified'`)와 UI 배지("DUPR 인증됨")는 준비됨.
실제 흐름(DUPR 로그인 → 본인 계정 연결)은 **DUPR 파트너 OAuth 스펙**이 있어야
구현 가능 → 키 승인 시 함께 받는 문서로 착수. 그때 `dupr-oauth` 함수 추가 예정.
