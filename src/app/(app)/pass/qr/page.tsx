import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName } from "@/core/authz/roles";
import { PassError } from "@/modules/pass/pass.error";
import { getMyStudentQr } from "@/modules/pass/request.service";
import { StudentQr } from "./student-qr";

export const metadata: Metadata = { title: "학생증" };

export default async function StudentQrPage() {
  const actor = await requireAuth();

  let initial: Awaited<ReturnType<typeof getMyStudentQr>> | null = null;
  try {
    initial = await getMyStudentQr(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    // 재학이 아닌 것은 권한 위반이 아니다 — 왜 비었는지 그 자리에서 알린다.
    if (!(error instanceof PassError)) throw error;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/pass">출입증</BackLink>

      <section className={cardClass("page", "mt-3 text-center")}>
        <h2 className="text-title font-semibold text-ink">
          {honorificName(actor.name, "STUDENT")}
        </h2>
        <p className="mt-1 text-caption text-mut">학생증</p>

        <div className="mt-6">
          {initial ? (
            <StudentQr initial={initial} />
          ) : (
            <EmptyState variant="inside">
              현재 학년도 재학생만 학생증을 쓸 수 있습니다.
            </EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
