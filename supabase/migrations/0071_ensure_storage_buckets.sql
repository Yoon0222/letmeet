-- 0071: 스토리지 버킷 재보장.
--   운영/개발 DB 분리 시 storage.buckets 행이 딸려오지 않아 'bucket not found' 발생.
--   앱이 쓰는 모든 공개 버킷을 재삽입한다(이미 있으면 무시).

insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('meetup-images', 'meetup-images', true),
  ('club-images', 'club-images', true),
  ('tournament-images', 'tournament-images', true),
  ('court-images', 'court-images', true),
  ('event-images', 'event-images', true),
  ('community-images', 'community-images', true)
on conflict (id) do nothing;
