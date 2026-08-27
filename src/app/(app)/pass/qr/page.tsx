import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { pageClass } from "@/components/ui/page-shell";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName } from "@/core/authz/roles";
import { getMyStudentQr } from "@/modules/pass/request.service";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "학생증" };

/**
 * 학생증 한 장. **출입증 한 건이 아니라 사람에 붙는다** — 승인된 것이 없어도
 * 그대로 있고, 정문에서 찍으면 서버가 그 자리에서 「지금 나가도 되는가」를
 * 판정한다. 그래서 이 화면에는 유효 시각도 남은 시간도 없다.
 *
 * 학생 본인만 연다. 교사·보호자가 대신 띄울 수 있으면 학생증이 아니게 된다.
 */
export default async function StudentQrPage() {
  const actor = await requireAuth();

  let card: Awaited<ReturnType<typeof getMyStudentQr>>;
  try {
    card = await getMyStudentQr(actor);
  } catch (error) {
    // `forbidden()`이 아니라 redirect다 — 저장소가 authInterrupts를 켜지 않았고,
    // requireAuth/requirePermission도 같은 방식으로 /forbidden에 보낸다.
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
  }

  return (
    <div className={pageClass("form")}>
      <BackLink href="/pass">출입증</BackLink>

      <section className={cardClass("page", "mt-3 text-center")}>
        <h2 className="text-title font-semibold text-ink">
          {honorificName(actor.name, "STUDENT")}
        </h2>
        <p className="mt-1 text-caption text-mut">학생증</p>

        {/* 흰 바탕 위 근검정 잉크. QR은 대비가 전부라 토큰을 쓰지 않고 순수한
            검정·흰색으로 그린다 — 판독기가 회색조로 읽는다. */}
        <div className="mt-6 flex justify-center">
          <svg
            viewBox={`0 0 ${card.qr.size} ${card.qr.size}`}
            className="h-auto w-full max-w-[264px]"
            role="img"
            aria-label="학생증 QR 코드"
            shapeRendering="crispEdges"
          >
            <rect width={card.qr.size} height={card.qr.size} fill="#ffffff" />
            <path d={card.qr.d} fill="#000000" />
          </svg>
        </div>

        {/* Note는 결과·오류 배너다. 이건 늘 같은 안내라 평범한 문단으로 둔다. */}
        <p className="mt-6 text-caption text-mut">
          정문에서 이 코드를 보여 주세요. 나갈 수 있는지는 찍는 순간 서버가
          판정합니다 — 승인된 외출·외박이 없으면 「출입증 없음」이 뜹니다.
        </p>
      </section>
    </div>
  );
}
