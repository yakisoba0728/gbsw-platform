import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName } from "@/core/authz/roles";
import { getMyStudentQr } from "@/modules/pass/request.service";
import { StudentQr } from "./student-qr";

export const metadata: Metadata = { title: "학생증" };

/**
 * 학생증 한 장. **출입증 한 건이 아니라 사람에 붙는다** — 승인된 것이 없어도
 * 그대로 있고, 정문에서 찍으면 서버가 그 자리에서 「지금 나가도 되는가」를
 * 판정한다. 코드 자체는 20초마다 갈린다(`pass.token.ts`).
 *
 * 학생 본인만 연다. 교사·보호자가 대신 띄울 수 있으면 학생증이 아니게 된다.
 */
export default async function StudentQrPage() {
  const actor = await requireAuth();

  let initial: Awaited<ReturnType<typeof getMyStudentQr>>;
  try {
    initial = await getMyStudentQr(actor);
  } catch (error) {
    // `forbidden()`이 아니라 redirect다 — 저장소가 authInterrupts를 켜지 않았고,
    // requireAuth/requirePermission도 같은 방식으로 /forbidden에 보낸다.
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
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
          <StudentQr initial={initial} />
        </div>
      </section>
    </div>
  );
}
