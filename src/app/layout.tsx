import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GBSW 통합관리시스템",
    template: "%s · GBSW 통합관리시스템",
  },
  description: "경북소프트웨어마이스터고등학교 통합관리시스템",
};

export const viewport: Viewport = {
  themeColor: "#00876c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/*
          Pretendard (dynamic subset) — 한글 서브셋이라 static 전체본보다 훨씬 가볍다.
          교내망에서 CDN이 막히면 시스템 폰트로 자연스럽게 폴백된다.
          완전 오프라인 배포가 필요해지면 woff2를 public/에 넣고 next/font/local로 교체.
        */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
