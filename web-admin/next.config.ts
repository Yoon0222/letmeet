import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위(모바일 앱) 저장소와 lockfile 이 둘이라 Turbopack 루트를 이 앱으로 고정
  turbopack: {
    root: path.join(__dirname),
  },
  // 링크 미리보기 수집기(카카오톡 등)가 메타 태그를 <head> 에서 바로 읽게 한다. 기본 목록에는 카카오톡·텔레그램 등이 없어
  // 번개 공유 주소(/m/[id])의 미리보기가 비어 보일 수 있다. 메타데이터를 데이터로 만드는 화면은 /m/[id] 뿐이라 느려질 것은 없다.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
