import type { Metadata, Viewport } from "next";
/*
 * Pretendard (dynamic subset) — npm 패키지에서 받아 같은 출처로 서빙한다.
 *
 * 전에는 jsDelivr <link> 한 줄이었다. 무결성 검증이 없어서 CDN이나 상류 태그가
 * 바뀌면 학생 개인정보를 다루는 모든 화면에 남의 CSS가 그대로 들어온다.
 * SRI로는 부족하다 — CSS 자체는 해시로 묶어도 그게 부르는 woff2 92개는 안 묶인다.
 * 패키지로 받으면 lockfile의 integrity 해시가 그 역할을 하고, 번들러가 woff2를
 * 해시 붙은 /_next/static/media 자산으로 내보낸다. 교내망이 외부를 막아도 뜬다.
 *
 * 서브셋 CSS라서 화면이 실제로 쓰는 유니코드 구간만 내려받는다 (전체본은 2MB).
 */
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
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
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
