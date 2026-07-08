-- 0020: 코트 좌표(지도 표시용). 주소 → 지오코딩으로 채운다.
alter table public.courts add column if not exists latitude  double precision;
alter table public.courts add column if not exists longitude double precision;

-- 지도 영역 조회 최적화용(선택). 좌표 있는 코트만.
create index if not exists courts_geo_idx on public.courts (latitude, longitude)
  where latitude is not null and longitude is not null;
