import { TruncatedText } from "@/components/ui/truncated-text";

/** 표 한 줄이 담는 출입증의 사연. 없는 사유는 줄 자체가 서지 않는다. */
export type PassDetail = {
  status: string;
  destination: string;
  reason: string;
  decisionNote: string | null;
  cancelReason: string | null;
};

/**
 * 행선지 · 사유 · 승인 메모/반려·취소 사유 — **각각 제 줄에 선다.** 한 줄로 이어 붙이면
 * 잘린 자리가 어디까지 행선지고 어디부터 사유인지 알 수 없다 (최근 부여에서
 * 같은 실수를 한 번 했다).
 *
 * 출입증 전체 내역(`/pass/history`)과 학생 상세의 출입증 탭이 같은 칸을 쓴다.
 */
export function PassDetailCell({ pass }: { pass: PassDetail }) {
  const decisionLabel = pass.status === "REJECTED" ? "반려 사유" : "승인 메모";

  return (
    <div className="min-w-0">
      <TruncatedText full={pass.destination} className="text-caption text-ink">
        {pass.destination}
      </TruncatedText>

      <TruncatedText full={`사유 · ${pass.reason}`} className="mt-0.5 text-xs text-mut2">
        <span className="text-mut">사유</span> · {pass.reason}
      </TruncatedText>

      {pass.decisionNote && (
        <TruncatedText
          full={`${decisionLabel} · ${pass.decisionNote}`}
          className="mt-0.5 text-xs text-mut2"
        >
          <span className={pass.status === "REJECTED" ? "text-rose" : "text-mut"}>
            {decisionLabel}
          </span>{" "}
          · {pass.decisionNote}
        </TruncatedText>
      )}

      {pass.cancelReason && (
        <TruncatedText
          full={`취소 사유 · ${pass.cancelReason}`}
          className="mt-0.5 text-xs text-mut2"
        >
          <span className="text-rose">취소 사유</span> · {pass.cancelReason}
        </TruncatedText>
      )}
    </div>
  );
}
