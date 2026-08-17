import type { Metadata, Viewport } from "next";
/**
 * Pretendard를 CDN이 아니라 패키지에서 받아 같은 출처로 서빙한다 — CDN `<link>`는
 * 무결성 검증이 없어 상류가 바뀌면 남의 CSS가 학생 정보 화면에 들어온다.
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
  themeColor: "#ffffff",
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
