import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ForbiddenError } from "@/core/authz/errors";
import { isPassStatus, isPassType, PASS_TYPE_LABELS } from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { formatDateTimeShort } from "@/lib/datetime";
import { formatSeat } from "@/lib/student-number";
import { PassError } from "@/modules/pass/pass.error";
import {
  consenterRole,
  PASS_STATUS_TONES,
  passStatusLabel,
  requesterRole,
} from "@/modules/pass/pass.labels";
import { isRevocable } from "@/modules/pass/pass.policy";
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

  let pass: Awaited<ReturnType<typeof getPassDetail>>;
  try {
    pass = await getPassDetail(actor, passId);
  } catch (error) {
    if (error instanceof PassError) notFound();
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
  }

  const canCancel =
    can(actor, "pass:cancel") && isRevocable(pass.status, pass.endAt, new Date());

  const enrollment = pass.studentProfile.enrollments[0];
  const seat = formatSeat({
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
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
              {passStatusLabel(pass)}
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
