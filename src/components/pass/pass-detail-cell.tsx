import { TruncatedText } from "@/components/ui/truncated-text";

export type PassDetail = {
  status: string;
  destination: string;
  reason: string;
  decisionNote: string | null;
  cancelReason: string | null;
};

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
