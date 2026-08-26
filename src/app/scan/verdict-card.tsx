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

/** 정문에서 팔 뻗은 거리로 읽는 화면이라 배지가 크다. */
export function VerdictCard({ result }: { result: VerifyResult }) {
  const { verdict, pass, detailed } = result;

  return (
    <section className={cardClass("page")}>
      <div className="text-center">
        <Badge tone={VERDICT_TONES[verdict]} className="px-4 py-2 text-lg">
          {VERDICT_LABELS[verdict]}
        </Badge>
        <p className="mt-3 text-caption text-mut">{VERDICT_HINTS[verdict]}</p>
      </div>

      {pass && (
        <dl className="mt-6 space-y-3 border-t border-line pt-5">
          <Line label="학생">
            <span className="text-lg font-medium text-ink">{pass.studentName}</span>
            {pass.studentNumber && (
              <span className="ml-2 text-caption text-mut tabular-nums">
                {pass.studentNumber}
              </span>
            )}
          </Line>
          <Line label="유형">{PASS_TYPE_LABELS[pass.type]}</Line>
          {/* 외박은 endAt이 종료일 다음 날 자정이라 그대로 그리면 하루 밀린다.
              화면 셋이 같은 눈금을 쓰도록 규칙은 pass.labels가 소유한다. */}
          <Line label="유효">
            <span className="tabular-nums">{passPeriod(pass)}</span>
          </Line>

          {/* 사유·행선지는 교사에게만. 같은 학년 학생이 「병원 진료」를 읽을 이유가 없다. */}
          {detailed && pass.destination && <Line label="행선지">{pass.destination}</Line>}
          {detailed && pass.reason && <Line label="사유">{pass.reason}</Line>}
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
