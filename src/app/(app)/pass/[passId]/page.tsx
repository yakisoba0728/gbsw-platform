import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ForbiddenError } from "@/core/authz/errors";
import {
  isPassStatus,
  isPassType,
  isRevocable,
  PASS_STATUS_LABELS,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { formatDateTimeShort } from "@/lib/datetime";
import { formatSeat } from "@/lib/student-number";
import { PassError } from "@/modules/pass/pass.error";
import {
  consenterRole,
  PASS_STATUS_TONES,
  requesterRole,
} from "@/modules/pass/pass.labels";
import { getPassDetail } from "@/modules/pass/request.service";
import { CancelButton } from "../cancel-button";
import { passPeriod } from "../pass-card";

export const metadata: Metadata = { title: "출입증" };

export default async function PassDetailPage({
  params,
}: {
  params: Promise<{ passId: string }>;
}) {
  const { passId } = await params;
  const actor = await requireAuth();

  // 없는 출입증은 404, 남의 출입증은 403이다 — 「없다」와 「못 본다」를 섞지 않는다.
  // 403을 흘려 보내면 pass/error.tsx의 「출입증을 불러오지 못했습니다」가 떠서
  // 원인을 안 알려 준다. 거부 감사로그는 서비스가 이미 남겼다.
  let pass: Awaited<ReturnType<typeof getPassDetail>>;
  try {
    pass = await getPassDetail(actor, passId);
  } catch (error) {
    if (error instanceof PassError) notFound();
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
  }

  // QR은 이 화면에 없다. 학생증 한 장(`/pass/qr`)이 그 일을 하고, 여기는
  // 「이 신청이 지금 어떤 상태인가」만 답한다.
  // 결재가 끝난 출입증을 무를 수 있는 **유일한 자리**다. `/pass`의 취소 버튼은
  // 「지금 나가 있는 학생」 구역에만 있어 아직 시작 전인 건은 손댈 곳이 없었다 —
  // 다음 주말 외박을 승인한 뒤 취소하려면 그 주말까지 기다려야 했다.
  const canCancel =
    can(actor, "pass:cancel") && isRevocable(pass.status, pass.endAt, new Date());

  const enrollment = pass.studentProfile.enrollments[0];
  const seat = formatSeat({
    grade: enrollment?.schoolClass?.grade ?? null,
    classNo: enrollment?.schoolClass?.classNo ?? null,
    number: enrollment?.number ?? null,
  });

  return (
    <div className="@container mx-auto max-w-2xl">
      <BackLink href="/pass">출입증</BackLink>

      <SectionCard
        title={isPassType(pass.type) ? PASS_TYPE_LABELS[pass.type] : pass.type}
        hint={`${seat ?? "미배정"} ${honorificName(pass.studentProfile.user.name, "STUDENT")}`}
        aside={
          isPassStatus(pass.status) ? (
            <Badge tone={PASS_STATUS_TONES[pass.status]}>
              {PASS_STATUS_LABELS[pass.status]}
            </Badge>
          ) : null
        }
        variant="panel"
        className="mt-3"
      >
        <dl className="grid gap-3 @sm:grid-cols-[7rem_1fr]">
          <Row label="기간" value={passPeriod(pass)} numeric />
          <Row label="행선지" value={pass.destination} />
          <Row label="사유" value={pass.reason} />
          <Row
            label="신청"
            value={`${honorificName(pass.requestedByName, requesterRole(pass))} · ${formatDateTimeShort(pass.createdAt)}`}
          />
          {pass.consentedAt && (
            <Row
              label="보호자 확인"
              value={`${
                pass.consentedByName
                  ? honorificName(pass.consentedByName, consenterRole(pass))
                  : "—"
              }${pass.consentByProxy ? " (대행)" : ""} · ${formatDateTimeShort(pass.consentedAt)}${pass.consentNote ? ` · ${pass.consentNote}` : ""}`}
            />
          )}
          {pass.decidedAt && (
            <Row
              label={pass.status === "REJECTED" ? "반려" : "승인"}
              value={`${pass.decidedByName ?? "—"} · ${formatDateTimeShort(pass.decidedAt)}${pass.decisionNote ? ` · ${pass.decisionNote}` : ""}`}
            />
          )}
          {pass.cancelledAt && (
            <Row
              label="취소"
              value={`${pass.cancelledByName ?? "—"} · ${formatDateTimeShort(pass.cancelledAt)}${pass.cancelReason ? ` · ${pass.cancelReason}` : ""}`}
            />
          )}
        </dl>

        {canCancel && <CancelButton passId={pass.id} />}
      </SectionCard>
    </div>
  );
}

function Row({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <>
      <dt className="text-caption text-mut">{label}</dt>
      <dd className={numeric ? "text-sm text-ink tabular-nums" : "text-sm text-ink"}>
        {value}
      </dd>
    </>
  );
}
