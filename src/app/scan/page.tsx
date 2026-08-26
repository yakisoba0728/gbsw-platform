import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { scanOrigin } from "@/modules/pass/pass.url";
import { verifyPassToken, type VerifyResult } from "@/modules/pass/verify.service";
import { Scanner } from "./scanner";
import { VerdictCard } from "./verdict-card";

export const metadata: Metadata = { title: "출입증 확인" };

/**
 * 판독 화면. **`(app)` 밖이다** — 앱 셸의 layout은 자기 경로를 몰라 `/login`으로
 * 보낼 때 돌아올 주소를 못 들고 간다. 그러면 정문에서 스캔 → 로그인 →
 * 대시보드로 떨어져 다시 스캔해야 한다.
 *
 * 앱 셸이 없는 대신 판정 배지가 화면을 채운다 — 팔 뻗은 거리로 보는 화면이라
 * 그편이 맞다.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { c } = await searchParams;
  const token = typeof c === "string" ? c : null;

  const user = await getSessionUser();
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    // 질의 문자열까지 살려야 한다 — 그게 판정할 코드다.
    const back = token ? `/scan?c=${token}` : "/scan";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  // (app) 레이아웃이 하는 가로채기를 여기서도 한다.
  if (user.mustChangePassword) redirect("/change-password");

  // **GET은 아무것도 쓰지 않는다.** 판정은 읽기다 — 방문기록 재방문·프리페치가
  // 행을 만들면 안 된다.
  let result: VerifyResult | null = null;
  let error: string | null = null;
  if (token) {
    try {
      result = await verifyPassToken(user, token);
    } catch (caught) {
      if (caught instanceof ForbiddenError) {
        error = "이 계정으로는 확인할 수 없습니다.";
      } else {
        throw caught;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-center text-lg font-semibold text-ink">출입증 확인</h1>

      {error && <Note tone="error">{error}</Note>}
      {result && <VerdictCard result={result} />}

      {/* 코드를 들고 왔어도 스캐너를 함께 띄운다 — 정문은 다음 학생이 바로 온다. */}
      <Scanner origin={scanOrigin()} />

      <Link href="/pass" className={buttonClass({ variant: "secondary", full: true })}>
        출입증으로
      </Link>
    </main>
  );
}
