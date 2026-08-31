import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 체크박스 + 손가락으로 누를 자리.
 *
 * 반 명단이 표 안과 카드 목록에서 같은 상자를 각자 그리고 있었고, 감싸는 방식이
 * 달라 탭 영역이 서로 달랐다 — 한쪽은 36px, 다른 쪽은 상자 크기 그대로였다.
 *
 * 상자 자체는 16px이고 사감은 어두운 복도에서 이걸 누른다. `<label>`이 음수
 * 여백으로 바깥까지 먹어 실제 누를 자리를 36px로 넓힌다 — 줄 높이는 그대로다.
 */
export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  /** 접근 가능한 이름. `<label>`에 글자가 없으므로 input이 직접 갖는다. */
  label: string;
}) {
  return (
    <label className={cn("-m-3.5 inline-flex cursor-pointer p-3.5", className)}>
      <input
        type="checkbox"
        aria-label={label}
        className="size-4 accent-pri"
        {...props}
      />
    </label>
  );
}

/**
 * 글자가 딸린 체크박스. 좁은 폭 카드 목록의 「전체 선택」처럼 상자 옆에 이름이
 * 보이는 자리가 쓴다 — 이때는 `<label>`이 글자를 감싸므로 음수 여백을 안 쓴다.
 */
export function CheckboxField({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 py-2.5 text-xs font-medium text-mut",
        className,
      )}
    >
      <input type="checkbox" className="size-4 accent-pri" {...props} />
      {label}
    </label>
  );
}
