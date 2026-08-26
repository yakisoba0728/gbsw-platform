import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import {
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { formatDateTimeShort } from "@/lib/datetime";
import { formatSeat } from "@/lib/student-number";
import { PassError } from "@/modules/pass/pass.error";
import { PASS_STATUS_TONES } from "@/modules/pass/pass.labels";
import {
  canSeePassQr,
  getPassDetail,
  getPassQr,
} from "@/modules/pass/request.service";
import { passPeriod } from "../pass-card";
import { PassQr, type QrPayload } from "../pass-qr";

export const metadata: Metadata = { title: "출입증" };

export default async function PassDetailPage({
  params,
}: {
  params: Promise<{ passId: string }>;
}) {
  const { passId } = await params;
  const actor = await requireAuth();

  // 없는 출입증은 404다. 권한 없는 접근은 서비스가 ForbiddenError를 던지고
  // (app)/error.tsx가 받는다 — 「없다」와 「못 본다」를 화면에서 섞지 않는다.
  let pass: Awaited<ReturnType<typeof getPassDetail>>;
  try {
    pass = await getPassDetail(actor, passId);
  } catch (error) {
    if (error instanceof PassError) notFound();
    throw error;
  }

  const now = new Date();
  let qr: QrPayload | null = null;
  const active =
    pass.status === "APPROVED" && pass.endAt.getTime() >= now.getTime();

  // 보호자는 자녀 상세를 읽을 수는 있어도 QR은 못 받는다. **먼저 물어보고 부른다** —
  // 그냥 부르고 실패를 삼키면 보호자가 상세를 열 때마다 authz:denied가 한 줄씩
  // 쌓여, 감사로그에서 「권한 밖 시도」를 세는 일이 잡음에 묻힌다.
  if (active && (await canSeePassQr(actor, pass.studentProfileId))) {
    qr = await getPassQr(actor, passId, now).catch(() => null);
  }

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
        {qr && (
          <div className="mb-5">
            <PassQr passId={pass.id} initial={qr} />
          </div>
        )}

        <dl className="grid gap-3 @sm:grid-cols-[7rem_1fr]">
          <Row label="기간" value={passPeriod(pass)} numeric />
          <Row label="행선지" value={pass.destination} />
          <Row label="사유" value={pass.reason} />
          <Row
            label="신청"
            value={`${pass.requestedByName} · ${formatDateTimeShort(pass.createdAt)}`}
          />
          {pass.consentedAt && (
            <Row
              label="보호자 확인"
              value={`${pass.consentedByName ?? "—"}${pass.consentByProxy ? " (대행)" : ""} · ${formatDateTimeShort(pass.consentedAt)}${pass.consentNote ? ` · ${pass.consentNote}` : ""}`}
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
