import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { scanOrigin } from "@/modules/pass/pass.url";
import { verifyStudentQr, type VerifyResult } from "@/modules/pass/verify.service";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "학생증 확인" };

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { c } = await searchParams;
  const code = typeof c === "string" ? c : null;

  const user = await getSessionUser();
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    const back = code ? `/scan?c=${code}` : "/scan";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  if (user.mustChangePassword) redirect("/change-password");

  let result: VerifyResult | null = null;
  let error: string | null = null;
  if (code) {
    try {
      result = await verifyStudentQr(user, code);
    } catch (caught) {
      if (caught instanceof ForbiddenError) {
        error = "이 계정으로는 확인할 수 없습니다.";
      } else {
        throw caught;
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-4 p-4 sm:p-6">
      <h1 className="text-center text-lg font-semibold text-ink">학생증 확인</h1>

      <Scanner origin={scanOrigin()} initial={{ result, error }} />

      <Link
        href="/pass"
        className={buttonClass({
          variant: "secondary",
          full: true,
          className: "sm:mx-auto sm:max-w-xs",
        })}
      >
        출입증으로
      </Link>
    </main>
  );
}
