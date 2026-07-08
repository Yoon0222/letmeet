# 코트 예약 결제 (PG) 설계

## 개요
코트 예약(유료)에 결제를 붙인다. **주문(court_payments) 1건 = 예약 슬롯 N개**. 무료 코트(요금 0)는 결제 없이 즉시 예약.

## 상태 흐름
```
슬롯 선택 → [결제하기]
  ├─ 무료(amount=0): court_reservations insert → 완료
  └─ 유료:
       1) court_payments(pending) 생성 (order_id = 멱등키)
       2) court_reservations insert (payment_id 연결) — 슬롯 홀드(유니크 인덱스로 중복 차단)
       3) PG 결제창 호출 (provider)
       4) 성공 → 서버 검증(Edge Function pay-verify) → court_payments.status=paid
          실패/취소 → 슬롯 해제(예약 삭제) + status=canceled/failed
```
- 예약 "확정" = `payment_id is null`(무료/구제도) **또는** 연결된 `court_payments.status='paid'`.

## 데이터 모델 (0026)
- `court_payments`: order_id(unique), user_id, court_id, slot_date, hours[], amount, status(pending/paid/failed/canceled/refunded), provider, provider_tx, paid_at.
- `court_reservations.payment_id` → court_payments(id). null = 무료/구제도.
- RLS: 결제 조회는 본인/코트owner/super, 생성/수정은 본인. **paid 확정은 Edge Function(service_role)만** — 클라이언트가 스스로 paid로 못 바꾸게(실 PG).

## provider 추상화 (`src/lib/payments.ts`)
- `EXPO_PUBLIC_PAYMENT_PROVIDER` = `mock`(기본, 개발용 자동성공) | `portone`(실 SDK).
- `startCourtPayment()` 가 주문생성·홀드·결제창·확정을 오케스트레이션.
- **mock**: 결제창 없이 성공 처리 + 클라이언트가 paid 세팅(개발 검증용). 실 배포 금지.
- **portone**: `@portone/react-native-sdk` requestPayment() 로 결제창 → 성공 시 `pay-verify` **서버 검증**으로만 paid 확정.

## 서버 검증 (`supabase/functions/pay-verify`)
- 클라이언트 성공 콜백은 신뢰 X → 서버에서 PG(포트원 V2 `GET /payments/{paymentId}`)로 상태·금액 재확인 후 paid 확정.
- 시크릿: `supabase secrets set PORTONE_API_SECRET=...`
- 배포: `supabase functions deploy pay-verify`

## 실 PG 붙이기 체크리스트
1. **법적 선행**: 사업자등록 + 통신판매업 신고 → PG(포트원/토스) 가맹 계약·심사.
2. 포트원 콘솔: storeId / channelKey(결제채널) / API Secret 발급.
3. 앱: `npx expo install @portone/react-native-sdk`, `payments.ts`의 `launchPayment()` portone 분기 구현, `EXPO_PUBLIC_PAYMENT_PROVIDER=portone`.
4. Edge Function: `pay-verify` 배포 + `PORTONE_API_SECRET` 시크릿. (필요 시 `pay-webhook` 추가 — 가상계좌 입금/취소 등 비동기.)
5. **네이티브 SDK라 EAS 개발 빌드 필요**(Expo Go·웹 미지원). 실 결제는 개발/실기기 빌드에서 검증.

## 마켓플레이스(정산) — 이후 단계
코트 이용료가 **코트 owner** 에게 가는 구조면 하위가맹점/정산대행(또는 전자금융업) 검토 필요. 1차는 **단일 가맹(피넛 정산)** 로 단순화 권장.

## 남은 TODO
- [ ] 실 PortOne SDK 연동(`launchPayment` portone 분기) + 키/시크릿
- [ ] `pay-webhook`(가상계좌·비동기 상태), 환불(취소 시 PG refund API)
- [ ] 24h 미결제 pending 자동 취소(스케줄러: pg_cron / Supabase scheduled)
- [ ] '내 예약'·상세에서 결제대기(pending) 상태 구분 표시
- [ ] 대회 참가비(tournaments.fee)도 동일 흐름 재사용
