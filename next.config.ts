import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 멀티스테이지 빌드에서 최소 런타임 이미지를 만들기 위해 필요.
  output: "standalone",
};

export default nextConfig;
