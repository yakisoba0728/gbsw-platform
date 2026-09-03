import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  isPassStatus,
  isPassType,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import {
  consenterRole,
  passEndLabel,
  passPeriod,
  PASS_STATUS_TONES,
  passStatusLabel,
} from "@/modules/pass/pass.labels";
import type { PassCardView } from "@/modules/pass/pass.view";
import { honorificName } from "@/core/authz/roles";

export { passEndLabel, passPeriod };

export function PassCard({
  pass,
  children,
}: {
  pass: PassCardView;
  children?: React.ReactNode;
}) {
  const type = isPassType(pass.type) ? PASS_TYPE_LABELS[pass.type] : pass.type;
  const status = isPassStatus(pass.status) ? pass.status : null;
  const statusLabel = passStatusLabel(pass);
  const student = honorificName(pass.studentProfile.user.name, "STUDENT");
  const period = passPeriod(pass);

  return (
    <li className="group relative border-b border-line px-5 py-4 last:border-b-0">
      <Link
        href={`/pass/${pass.id}`}
        aria-label={`${type} · ${period} · ${statusLabel} · ${student} 상세`}
        className="absolute inset-0 rounded-btn focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-ink">
            <span className="font-medium underline decoration-line-strong underline-offset-2 group-hover:decoration-ink">
              {type}
            </span>
            {status && (
              <Badge tone={PASS_STATUS_TONES[status]}>
                {statusLabel}
              </Badge>
            )}
          </p>
          <p className="mt-1 text-caption text-mut tabular-nums">
            {period}
          </p>
          <p className="mt-0.5 text-caption text-mut">
            {pass.destination}
            <span className="mx-1.5 text-mut2" aria-hidden>
              ·
            </span>
            {pass.reason}
          </p>
          {pass.decisionNote && (
            <p
              className={
                pass.status === "REJECTED"
                  ? "mt-1 text-xs text-rose"
                  : "mt-1 text-xs text-mut"
              }
            >
              {pass.status === "REJECTED" ? "반려 사유" : "승인 메모"}: {pass.decisionNote}
            </p>
          )}
          {pass.consentByProxy && pass.consentedByName && (
            <p className="mt-1 text-xs text-mut">
              보호자 확인 대행 · {honorificName(pass.consentedByName, consenterRole(pass))}
            </p>
          )}
        </div>
        {children != null && <div className="relative z-10">{children}</div>}
      </div>
    </li>
  );
}
