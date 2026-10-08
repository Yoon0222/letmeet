-- PROD 적용: app_config.ios_url 설정 (2026-10-06)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
--
-- 왜: prod 의 ios_url 이 비어 있어서, 강제 업데이트(min_version) 화면이 iPhone 에서
--     "지금 업데이트" 버튼 없이 뜬다(막다른 화면). 이미 배포된 3.1.1 이상 모든 iOS 빌드가
--     이 값을 읽으므로, DB 만 채우면 기존 빌드까지 바로 해결된다.
-- 부작용: 없음. ios_url 은 강제 업데이트 화면에서만 읽힌다(min_version 은 그대로 0.0.0).
-- 링크 확인: https://apps.apple.com/kr/app/id6789043942 → HTTP 200 (App Store 공개, 2026-10-06)

-- 1) 실행 전 확인 — ios_url 이 '' 인지
select id, min_version, ios_url, android_url, updated_at
from public.app_config
where id = 1;

-- 2) 적용
update public.app_config
   set ios_url    = 'https://apps.apple.com/kr/app/id6789043942',
       updated_at = now()
 where id = 1
returning id, min_version, ios_url, android_url, updated_at;
