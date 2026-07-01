import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위(모바일 앱) 저장소와 lockfile 이 둘이라 Turbopack 루트를 이 앱으로 고정
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
