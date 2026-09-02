import type { NextConfig } from "next";

// Next의 인라인 부트스트랩을 허용하고 개발 모드에서만 eval을 허용한다.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const ATTACHMENT_HEADERS = [
  { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  // Next가 직접 복사하는 환경 파일은 sanitize:standalone에서도 제거한다.
  outputFileTracingExcludes: {
    "/*": [
      ".env",
      ".env.*",
      ".git/**/*",
      ".gitattributes",
      ".gitignore",
      ".uploads/**/*",
      ".playwright-mcp/**/*",
      ".superpowers/**/*",
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      "coverage/**/*",
      "dev-local/**/*",
      "docs/**/*",
      "playwright-report/**/*",
      "test-results/**/*",
      "tests/**/*",
    ],
  },
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },

  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/api/community/attachments/:id*",
        headers: ATTACHMENT_HEADERS,
      },
    ];
  },
};

export default nextConfig;
