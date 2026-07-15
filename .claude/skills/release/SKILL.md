---
name: release
description: 버전 태그(vX.Y.Z)를 남기는 릴리스를 처리한다. app.json 버전 bump·커밋·태그·푸시에 더해 반드시 web-admin 을 Vercel 프로덕션에 배포한다. "버전 올려/릴리스/태그 남겨/1.x.x 로 올려" 라고 하거나 새 버전 태그를 만들 때 사용.
---

# 릴리스 (버전 태그 + Vercel 프로덕션 배포)

**규칙: 버전 태그(`vX.Y.Z`)를 남길 때마다 web-admin 을 Vercel 프로덕션에 배포한다.** 태그만 남기고 배포를 빼먹지 말 것.

## 절차

1. **버전 결정** (semver): 버그픽스=patch, 기능=minor, 대규모/호환깨짐=major. 이미 `app.json`의 `version`이 목표 버전이면 그대로.
2. **app.json bump**: `expo.version` 을 목표 버전으로. (Android versionCode / iOS buildNumber 는 EAS `autoIncrement` 가 자동 → 건드리지 말 것.)
3. **커밋**: `버전 X.Y.Z — <요약>` 로 커밋.
4. **태그**: `git tag -a vX.Y.Z -m "<릴리스 요약>"`.
5. **푸시**: 커밋 + 태그를 원격에. `git push && git push origin vX.Y.Z` (또는 `git push --tags`).
6. **Vercel 프로덕션 배포 (필수)**:
   - 저장소 루트(`.vercel/project.json` 있는 곳)에서 실행.
   - 로그인 확인: `npx vercel whoami` → 이름 나오면 OK. 안 나오면 사용자에게 `npx vercel login` 안내 후 대기.
   - 배포: `npx vercel --prod --yes` (linked project `web-admin`, root dir는 Vercel 설정을 따름).
   - 성공 시 배포 URL(`https://...vercel.app`)이 출력됨 → 사용자에게 알림. 커스텀 도메인(pinut.org/admin.pinut.org)은 자동 반영.
7. **기록**: `docs/WORKLOG.md`(worklog 스킬)와 `docs/HANDOFF.md`(handoff)에 "버전 X.Y.Z 릴리스 + Vercel 배포" 남기기.

## 주의
- 앱 스토어 빌드(EAS)는 별개다. 필요하면 `eas build -p android/ios --profile production` 도 안내(태그와 함께 자주 같이 감).
- Vercel 배포에 로그인/권한이 없으면 **건너뛰지 말고** 사용자에게 명령을 그대로 주고 실행하게 한 뒤 확인한다.
- `.vercel` 폴더는 커밋 대상 아님(로컬 링크). `.gitignore` 확인.
- 운영 DB 마이그레이션이 필요한 릴리스면(스키마 변경 포함) 그 SQL도 함께 챙긴다.
