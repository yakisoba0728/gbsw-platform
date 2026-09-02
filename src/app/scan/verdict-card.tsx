import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import { PASS_TYPE_LABELS } from "@/core/authz/pass-type";
import {
  passPeriod,
  VERDICT_HINTS,
  VERDICT_LABELS,
  VERDICT_TONES,
} from "@/modules/pass/pass.labels";
import type { VerifyResult } from "@/modules/pass/verify.service";
import { honorificName } from "@/core/authz/roles";

export function VerdictCard({ result }: { result: VerifyResult }) {
  const { verdict, student, pass, detailed } = result;

  return (
    <section className={cardClass("page")}>
      <div className="text-center">
        <Badge tone={VERDICT_TONES[verdict]} className="px-4 py-2 text-lg">
          {VERDICT_LABELS[verdict]}
        </Badge>
        <p className="mt-3 text-caption text-mut">{VERDICT_HINTS[verdict]}</p>
      </div>

      {student && (
        <dl className="mt-6 space-y-3 border-t border-line pt-5">
          <Line label="학생">
            <span className="text-lg font-medium text-ink">
              {honorificName(student.studentName, "STUDENT")}
            </span>
            {student.studentNumber && (
              <span className="ml-2 text-caption text-mut tabular-nums">
                {student.studentNumber}
              </span>
            )}
          </Line>
          {pass && (
            <>
              <Line label="유형">{PASS_TYPE_LABELS[pass.type]}</Line>
              <Line label="유효">
                <span className="tabular-nums">{passPeriod(pass)}</span>
              </Line>

              {detailed && pass.destination && (
                <Line label="행선지">{pass.destination}</Line>
              )}
              {detailed && pass.reason && <Line label="사유">{pass.reason}</Line>}
            </>
          )}
        </dl>
      )}
    </section>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-caption text-mut">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}
