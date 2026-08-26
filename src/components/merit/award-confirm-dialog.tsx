"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  kindColorClass,
  kindLabel,
  kindLineClass,
  kindPanelClass,
  signedPoints,
} from "@/components/merit/kind-badge";
import type { RuleOption } from "@/components/merit/rule-filter";
import { formatSeat } from "@/lib/student-number";

/** 확인 화면에 세울 학생 한 줄. 명단이 가진 것을 그대로 받는다. */
export type ConfirmStudent = {
  studentProfileId: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/**
 * 부여 직전 확인. 누가·무엇을 받는지 다시 세우고 한 번 더 누르게 한다.
 *
 * **폼 안에 두어야 한다.** 확인 버튼이 `type="submit"`이라 바깥 `<form>`을 제출한다 —
 * 네이티브 `<dialog>`는 화면에서만 맨 위로 올라가고 DOM에서는 제자리에 있어서
 * 폼 소유 관계가 그대로 산다. 확인 버튼을 밖에 두면 눌러도 아무 일이 없다.
 *
 * 상태를 들지 않는다. 여는 것도 닫는 것도 호출부의 `open`·`onClose`가 정한다 —
 * 성공하면 닫고 실패하면 열어 둔 채 오류를 보여야 하는데, 그 판단은 액션 결과를
 * 가진 쪽만 할 수 있다.
 */
export function AwardConfirmDialog({
  open,
  onClose,
  rule,
  note,
  students,
  showClass,
  scopeLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** 고른 항목. 없으면 열지 않으므로 호출부가 먼저 막는다. */
  rule: RuleOption;
  /** 메모. 빈 문자열이면 줄이 안 나온다 — 「메모 없음」은 읽을 것이 없다. */
  note: string;
  students: ConfirmStudent[];
  /** 학급을 함께 적을지. 한 반만 보고 있으면 모두 같은 값이라 군더더기다. */
  showClass: boolean;
  /** 「2학년 3반」·「1학년」·「전교」. 학급 열이 없을 때 어디서 고른 것인지 답한다. */
  scopeLabel: string;
  pending: boolean;
  error: string | null;
  /** 확인을 눌렀을 때. 호출부가 성공 알림에 쓸 값을 찍는다. */
  onConfirm: () => void;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // 버튼이 아니라 내용에 포커스를 준다. 확인 버튼에 주면 방금 트리거를
      // 키보드로 누른 Enter의 keyup이 그대로 이어져 확인까지 눌린다 —
      // 한 번 더 확인받으려고 띄운 모달이 그 자리에서 통과한다.
      bodyRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const tint = kindColorClass(rule.kind);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${baseId}-title`}
      // Esc로 닫히면 브라우저가 close를 준다. 호출부를 되맞추지 않으면 다음에 안 열린다.
      onClose={onClose}
      // 배경 클릭으로 닫지 않는다 — 고른 학생과 메모가 그대로 남아 있어야 한다.
      className="animate-modal-in rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
    >
      <div ref={bodyRef} tabIndex={-1} className="w-115 max-w-full p-6 outline-none">
        <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
          {students.length}명에게 부여합니다
        </h2>

        {/* 무엇을 주는가. 종류가 면적으로 드러나 상점과 벌점을 눈이 먼저 가른다. */}
        <div className={`mt-4 rounded-card border px-4 py-3.5 ${kindPanelClass(rule.kind)}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-caption font-medium ${tint}`}>{kindLabel(rule.kind)}</p>
              {/* 항목명은 자르지 않는다 — 확인받으려는 것이 이 문장이라
                  말줄임표가 붙으면 확인할 것이 사라진다. */}
              <p className="mt-1 font-medium text-ink">{rule.label}</p>
            </div>
            <p className={`shrink-0 text-title font-semibold ${tint}`}>
              {signedPoints(rule.kind, rule.points)}
            </p>
          </div>

          {note !== "" && (
            <p
              className={`mt-3 border-t pt-3 text-caption text-ink ${kindLineClass(rule.kind)}`}
            >
              <span className={`mr-1.5 font-medium ${tint}`}>메모</span>
              {note}
            </p>
          )}
        </div>

        {/* 누가 받는가. 머리글 띠는 스크롤 밖에 둔다 — 안에 두면 함께 밀려 올라간다. */}
        <div className="mt-3 overflow-hidden rounded-card border border-line">
          <div className="flex items-center justify-between border-b border-line bg-soft px-4 py-2.5">
            <span className="text-caption font-medium text-ink">받는 학생</span>
            {/* 학급 열이 없으면 어디서 고른 것인지가 여기서만 보인다. */}
            <span className="text-caption text-mut">{scopeLabel}</span>
          </div>

          {/* 목록이 길면 마지막 줄이 반쯤 잘려 더 있다는 것이 보인다. */}
          <ul className="max-h-56 divide-y divide-line2 overflow-y-auto">
            {students.map((student) => (
              <li
                key={student.studentProfileId}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {/* 학급과 번호는 한 덩어리다 — 사이를 벌리면 번호가 이름 쪽으로
                    떠서 어느 학생의 것인지 한눈에 안 붙는다. */}
                <span className="flex shrink-0 items-baseline gap-2 text-xs text-mut2">
                  {/* w-12 — 학번(1307)은 4글자지만 번호가 10번을 넘으면
                    「1-3 12」꼴 6글자가 온다. w-10이면 그때 넘친다. */}
                {showClass ? (
                    <span className="w-12 tabular-nums">
                      {formatSeat(student) ?? "미배정"}
                    </span>
                  ) : (
                    <span className="w-5 text-right tabular-nums">
                      {student.number ?? "—"}
                    </span>
                  )}
                </span>
                <TruncatedText full={student.name} className="text-caption font-medium text-ink">
                  {student.name}
                </TruncatedText>
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <Note tone="error" className="mt-3">
            {error}
          </Note>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            닫기
          </Button>
          {/* 여는 버튼과 같은 이름이다 — 한 동작은 흐름 내내 한 이름으로 부른다. */}
          <Button type="submit" disabled={pending} onClick={onConfirm}>
            {pending ? "부여하는 중…" : "부여"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
