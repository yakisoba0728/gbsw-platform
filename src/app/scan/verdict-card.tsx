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

/** 정문에서 팔 뻗은 거리로 읽는 화면이라 배지가 크다. */
export function VerdictCard({
  result,
  headingLevel = 2,
}: {
  result: VerifyResult;
  headingLevel?: 2 | 3;
}) {
  const { verdict, student, pass, detailed } = result;
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="학생증 판정 결과"
      className={cardClass("page")}
    >
      <div className="text-center">
        <Heading>
          <Badge tone={VERDICT_TONES[verdict]} className="px-4 py-2 text-lg">
            {VERDICT_LABELS[verdict]}
          </Badge>
        </Heading>
        <p className="mt-3 text-caption text-mut">{VERDICT_HINTS[verdict]}</p>
      </div>

      {/* **학생 칸이 출입증 칸과 갈렸다.** 학생증은 먼저 누구인지를 말한다 —
          나갈 것이 없어도(NO_PASS) 이름과 학번은 뜬다. 정문에서 사람과 화면을
          맞춰 보는 일이 이 코드가 하는 일의 절반이다. */}
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
              {/* 유형마다 눈금이 다르다 — 외출은 날짜를 한 번만, 외박은 양끝 모두.
                  화면 셋이 같게 그리도록 규칙은 pass.labels가 소유한다. */}
              <Line label="유효">
                <span className="tabular-nums">{passPeriod(pass)}</span>
              </Line>

              {/* 사유·행선지는 교사에게만. 같은 학년 학생이 「병원 진료」를 읽을 이유가 없다. */}
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
