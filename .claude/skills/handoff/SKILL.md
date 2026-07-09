---
name: handoff
description: 코덱스↔Claude 협업 핸드오프(docs/HANDOFF.md) 읽기/쓰기. 세션을 시작할 때 코덱스 요청·최신 변경을 파악하고, 의미 있는 작업을 끝낼 때 "Claude → Codex" 항목을 남긴다. "핸드오프/handoff" 라고 하거나, 피넛 작업을 시작/마무리할 때 사용.
---

# 협업 핸드오프 (피넛 pinut-v2.0)

피넛은 **코덱스(디자인) ↔ Claude(로직)** 가 `pinut-v2.0` 계열 브랜치를 공유해 협업한다.
`docs/HANDOFF.md` 가 두 에이전트의 **비동기 소통 창구**다. 관련 메모리: `pickleball-codex-collab`.

## 세션 시작 시 — 읽기 (먼저)
1. `docs/HANDOFF.md` 를 읽는다. 특히:
   - **"Codex → Claude" 요청** — 코덱스가 나에게 남긴 요청/필요(타입·쿼리 추가 등)
   - **최신 "Codex → …" 로그** — 코덱스가 최근 바꾼 것(파일·이유·검증)
   - **"Roles / Boundary"** — 파일 경계(코덱스=`components/ui`·`theme`·화면 비주얼 / 나=`contexts`·`lib`·`supabase`·데이터/로직)
2. 코덱스가 건드린 파일과 내 작업이 겹치는지 확인 → 겹치면 **로직만** 손댄다.
3. 작업 전 **`git pull`** (원격 최신 반영).
4. 코덱스 요청이 있으면 처리하거나, 못 하면 그 이유를 핸드오프에 남긴다.

## 세션 마무리 시 — 쓰기 (반드시)
의미 있는 작업(코드 변경·중요 결정·조사·차단·사용자 선호)을 했으면
`docs/HANDOFF.md` 의 Session Log 영역에 **"### Claude → Codex (YYYY-MM-DD, 요약)"** 항목을 추가한다. 최소 포함:
- **What changed** — 무엇을 바꿨나
- **Why** — 왜
- **Files touched** — 건드린 파일
- **Validation** — tsc/lint/프리뷰 결과(실패·스킵도 명시)
- **Follow-ups / requests** — 다음 에이전트에게 남길 것·코덱스에게 요청
- 코드 변경이 없어도 중요한 결정·조사·차단이 있었으면 짧게라도 남긴다.
- 맨 위 **`Last updated:` 날짜** 갱신. 날짜는 세션 컨텍스트의 currentDate 사용.

## 규칙
- 파일은 반드시 **UTF-8** 로 저장(한글 깨짐 방지 — 과거 WORKLOG 인코딩 손상 사례 있음).
- 코덱스가 실시간 편집 중이면 **경합 주의** — 안정된 앵커(예: "Roles / Boundary" 헤딩)에 추가하고, 충돌 나면 사용자에게 알린다.
- HANDOFF 는 코덱스도 편집하는 공유 파일이니, 내 섹션("Claude → Codex")만 손대고 코덱스 항목은 건드리지 않는다.
