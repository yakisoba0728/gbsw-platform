import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { SectionCard } from "@/components/ui/section-card";
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
    <PageScaffold
      eyebrow={<BackLink href="/pass">출입증으로 돌아가기</BackLink>}
      title={honorificName(actor.name, "STUDENT")}
      description="정문 스캐너에 아래 학생증 QR을 보여주세요."
      width="compact"
    >
      <SectionCard title="학생증 QR" hint="화면 밝기를 높이면 더 빠르게 인식됩니다." variant="panel">
        <div className="py-2 text-center sm:py-4">
          <StudentQr initial={initial} />
        </div>
      </SectionCard>
    </PageScaffold>
  );
}
