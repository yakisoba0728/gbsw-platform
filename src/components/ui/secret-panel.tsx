import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 방금 발급돼 이 화면에서만 볼 수 있는 값 — 초대코드·임시 비밀번호·가입코드.
 *
 * 세 곳이 각자 그리고 있었고, 하필 학생이 부모에게 불러 줘야 하는 가입코드가
 * 셋 중 가장 안 눈에 띄었다. 값은 mono로 낸다 — 사람이 한 글자씩 옮겨 적는다.
 */
export function SecretPanel({
  label,
  value,
  note,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 값 아래 한 줄. "이 화면을 벗어나면 다시 볼 수 없습니다" 같은 것. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-btn border border-pri-line bg-pri-soft px-4 py-3",
        className,
      )}
    >
      <p className="text-xs font-medium text-pri-ink">{label}</p>
      <p className="mt-1 font-mono text-title font-semibold break-all text-ink select-all">
        {value}
      </p>
      {note && <p className="mt-1.5 text-xs text-mut">{note}</p>}
    </div>
  );
}
