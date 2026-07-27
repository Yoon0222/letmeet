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

### 2) 시크릿 등록
DUPR 이 주는 방식에 따라 둘 중 하나:
```bash
# (a) 고정 Bearer 토큰을 주는 경우
supabase secrets set DUPR_API_BASE=https://backend.mydupr.com
supabase secrets set DUPR_BEARER=<토큰>

# (b) client key/secret 방식
supabase secrets set DUPR_API_BASE=https://backend.mydupr.com
supabase secrets set DUPR_CLIENT_KEY=<키> DUPR_CLIENT_SECRET=<시크릿>
```
(dev: `--project-ref pjfhxkvdjipvdmfsacie` / prod: `jbvtdthtmrlndduqiikj`)

### 3) 함수 배포
```bash
supabase functions deploy dupr-verify --project-ref <ref>
```

### 4) ⚠️ 파트너 문서로 확정할 것 (현재 코드는 추정)
`supabase/functions/dupr-verify/index.ts` 의 TODO(dupr):
- **토큰 발급 경로/바디** (`getDuprToken`) — 실제 auth 엔드포인트
- **조회 엔드포인트** (`lookupPlayer`) — get-player / search 경로·바디
- **응답 필드명** (`parseRatings`) — doubles/singles 위치

문서 받으면 이 3곳만 실제 값으로 맞추면 됨. 파싱은 방어적으로 여러 후보를 훑게 해둠.

### 5) 검증
dev 함수 배포 후, 앱 프로필 편집 → DUPR ID 입력 → "레이팅 불러오기":
- 키 미설정: `503 dupr_not_configured` → "아직 준비 중" 토스트(정상)
- 정상: 복식/단식 표시 + `dupr_status='linked'` 배지

## Level B — 소유 인증(OAuth) (후속)
DB(`dupr_status='verified'`)와 UI 배지("DUPR 인증됨")는 준비됨.
실제 흐름(DUPR 로그인 → 본인 계정 연결)은 **DUPR 파트너 OAuth 스펙**이 있어야
구현 가능 → 키 승인 시 함께 받는 문서로 착수. 그때 `dupr-oauth` 함수 추가 예정.
