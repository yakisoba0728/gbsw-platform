import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { formatDateTimeShort } from "@/lib/datetime";
import { getMyPasses, getPassQr } from "@/modules/pass/request.service";
import { PassCard, passPeriod } from "./pass-card";
import { PassQr, type QrPayload } from "./pass-qr";
import { WithdrawButton } from "./withdraw-button";

export async function StudentView({ actor }: { actor: SessionUser }) {
  const passes = await getMyPasses(actor);
  const now = new Date();

  // 지금 보여줄 수 있는 것 하나. 승인됐고 아직 안 끝난 것 중 가장 빨리 시작하는 것이다.
  const showable = passes
    .filter((p) => p.status === "APPROVED" && p.endAt.getTime() >= now.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];

  let qr: QrPayload | null = null;
  if (showable) {
    // 화면이 서는 시점의 첫 장. 이후 20초마다 클라이언트가 새로 받는다.
    //
    // 실패를 삼킨다 — 목록을 읽은 뒤 교사가 취소하면 PASS_NOT_ACTIVE가 올라오는데,
    // 그것 때문에 신청 내역까지 못 보게 되면 안 된다. QR만 빠지고 나머지는 선다.
    qr = await getPassQr(actor, showable.id, now).catch(() => null);
  }

  return (
    <div className="@container mx-auto max-w-3xl space-y-4">
      <SectionCard
        title="내 출입증"
        hint={
          showable
            ? `${passPeriod(showable)} · ${showable.destination}`
            : "지금 보여줄 출입증이 없습니다."
        }
        aside={
          <Link href="/pass/new" className={buttonClass({ size: "sm" })}>
            신청하기
          </Link>
        }
        variant="panel"
      >
        {showable && qr ? (
          <>
            {showable.startAt.getTime() > now.getTime() && (
              <p className="mb-3 text-center text-caption text-mut">
                {/* 포맷된 문자열을 되파싱하지 않는다 — 구분자가 바뀌면 조용히
                    깨지고, 외박은 시각이 통째로 빠진다. */}
                {formatDateTimeShort(showable.startAt)}부터 유효합니다.
              </p>
            )}
            <PassQr passId={showable.id} initial={qr} />
          </>
        ) : (
          <EmptyState variant="inside">
            승인된 출입증이 있으면 여기에 QR이 뜹니다.
          </EmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="신청 내역"
        aside={<span className="text-xs text-mut">{passes.length}건</span>}
        flush
      >
        {passes.length === 0 ? (
          <EmptyState variant="inside">아직 신청한 출입증이 없습니다.</EmptyState>
        ) : (
          <ul>
            {passes.map((pass) => (
              <PassCard key={pass.id} pass={pass}>
                {(pass.status === "REQUESTED" || pass.status === "CONSENTED") && (
                  <WithdrawButton passId={pass.id} />
                )}
              </PassCard>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
