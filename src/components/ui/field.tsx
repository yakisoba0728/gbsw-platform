import type { ReactNode } from "react";

/**
 * 정의 목록(`<dl>`) 한 칸 — 작은 라벨과 그 아래 값.
 *
 * 계정 상세와 학생 상세의 「학생 정보」 탭이 같은 표를 그린다. 손으로 두 벌
 * 그리면 라벨 크기·간격이 조용히 갈라진다.
 *
 * **바깥 `<dl>`은 호출부가 정한다** — 몇 칸으로 접을지는 놓이는 자리의 폭이
 * 답할 일이라 `@container` 격자를 여기서 못 정한다.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-mut">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
