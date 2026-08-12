import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  if (await getSessionUser()) redirect("/");

  const { token } = await searchParams;
  const candidate = typeof token === "string" ? token : undefined;

  /*
   * ?token= 이 붙어 있으면 최초 관리자 부트스트랩,
   * 아니면 초대코드 2단계 가입.
   */
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

/**
 * 거부 화면. "토큰이 틀렸다"와 "이미 설정이 끝났다"를 구분해 알리지 않는다 —
 * 시스템 상태를 외부에 흘리지 않기 위해서다.
 */
function Unavailable() {
  return (
    <div className="animate-auth-in">
      <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        만료된 링크
      </h1>
      <p className="mb-[26px] text-[13.5px] leading-relaxed text-mut">
        이미 설정이 끝났거나 링크가 만료되었습니다.
      </p>
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center rounded-btn-lg bg-pri px-[18px] py-3.5 text-[14.5px] font-bold text-white transition-colors hover:bg-pri-press"
      >
        로그인으로
      </Link>
    </div>
  );
}
