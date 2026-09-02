import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { getSessionUser } from "@/core/auth/session";
import { canShowBootstrapForm } from "@/modules/bootstrap/bootstrap.service";
import { AuthPanel } from "../auth-panel";
import { BootstrapForm } from "./bootstrap-form";
import { RegisterFlow } from "./register-flow";

export const metadata: Metadata = { title: "가입" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessionUser = await getSessionUser();
  if (sessionUser?.status === "ACTIVE") redirect("/");

  const { token } = await searchParams;
  const candidate = typeof token === "string" ? token : undefined;

  if (!candidate) {
    return (
      <AuthPanel>
        <RegisterFlow />
      </AuthPanel>
    );
  }

  const allowed = await canShowBootstrapForm(candidate);

  return (
    <AuthPanel>
      {allowed ? <BootstrapForm token={candidate} /> : <Unavailable />}
    </AuthPanel>
  );
}

function Unavailable() {
  return (
    <div className="animate-auth-in">
      <h1 className="mb-2 text-title font-semibold text-ink">열 수 없는 링크</h1>
      <p className="mb-8 text-caption text-mut">
        이 링크로는 계정을 만들 수 없습니다.
      </p>
      <Link href="/login" className={buttonClass({ variant: "secondary", size: "lg", full: true })}>
        로그인
      </Link>
    </div>
  );
}
