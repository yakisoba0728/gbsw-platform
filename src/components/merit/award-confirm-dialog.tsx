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
import { honorificName } from "@/core/authz/roles";

export type ConfirmStudent = {
  studentProfileId: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/* requestSubmit()을 호출하므로 부여 폼 안에 배치해야 한다. */
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
  rule: RuleOption;
  note: string;
  students: ConfirmStudent[];
  showClass: boolean;
  scopeLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      bodyRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  function confirm() {
    onConfirm();
    confirmRef.current?.form?.requestSubmit();
  }

  const tint = kindColorClass(rule.kind);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${baseId}-title`}
      onClose={onClose}
      className="animate-modal-in rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
    >
      <div ref={bodyRef} tabIndex={-1} className="w-115 max-w-full p-6 outline-none">
        <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
          {students.length}명에게 부여합니다
        </h2>

        <div className={`mt-4 rounded-card border px-4 py-3.5 ${kindPanelClass(rule.kind)}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-caption font-medium ${tint}`}>{kindLabel(rule.kind)}</p>
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

        <div className="mt-3 overflow-hidden rounded-card border border-line">
          <div className="flex items-center justify-between border-b border-line bg-soft px-4 py-2.5">
            <span className="text-caption font-medium text-ink">받는 학생</span>
            <span className="text-caption text-mut">{scopeLabel}</span>
          </div>

          <ul className="max-h-56 divide-y divide-line2 overflow-y-auto">
            {students.map((student) => (
              <li
                key={student.studentProfileId}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="flex shrink-0 items-baseline gap-2 text-xs text-mut2">
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
                <TruncatedText
                  full={honorificName(student.name, "STUDENT")}
                  className="text-caption font-medium text-ink"
                >
                  {honorificName(student.name, "STUDENT")}
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
          <Button ref={confirmRef} type="button" disabled={pending} onClick={confirm}>
            {pending ? "부여하는 중…" : "부여"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
