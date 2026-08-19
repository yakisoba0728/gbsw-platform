"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
} from "@/core/authz/enrollment-status";
import { SAVE_INITIAL } from "./action-state";
import { saveEnrollmentsAction } from "./actions";
import {
  clearUnchangedSubmittedDrafts,
  draftFor,
  sameAsRow,
  type Draft,
} from "./student-table-drafts";

export type StudentRow = {
  studentProfileId: string;
  enrollmentUpdatedAt: string | null;
  name: string;
  email: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  accountActive: boolean;
};

const HEADERS = ["이름", "학년", "반", "번호", "학적", "계정"] as const;

/** 본문 셀의 여백. 머리글과 같은 규칙을 써야 세로줄이 맞는다. */
const cell = (index: number) => `${tableCellPadding(index, HEADERS.length)} py-2.5`;

export function StudentTable({
  rows,
  year,
}: {
  rows: StudentRow[];
  year: number;
}) {
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({});
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("ALL");
  const [state, formAction, pending] = useActionState(
    saveEnrollmentsAction,
    SAVE_INITIAL,
  );

  const dirtyRows = useMemo(
    () => rows.filter((r) => !sameAsRow(r, draftFor(r, drafts))),
    [rows, drafts],
  );
  const dirtyIds = useMemo(
    () => dirtyRows.map((r) => r.studentProfileId),
    [dirtyRows],
  );

  // 제출 시점의 값을 붙잡아 둔다 — 저장 중에 고친 줄까지 저장됐다고 착각하면 안 된다.
  const submittedDraftsRef = useRef<Record<string, Draft>>({});

  // 성공하면 보낸 값과 여전히 같은 override만 지워 서버 값을 다시 읽는다. 실패하거나
  // 저장 중에 더 고친 줄은 그대로 둔다.
  useEffect(() => {
    if (state.saved === null || state.error) return;
    setDrafts((prev) =>
      clearUnchangedSubmittedDrafts(rows, prev, submittedDraftsRef.current),
    );
  }, [rows, state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const d = draftFor(r, drafts);
      if (gradeFilter !== "ALL" && d.grade !== gradeFilter) return false;
      if (!q) return true;
      return [r.name, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [rows, drafts, query, gradeFilter]);

  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // 바뀐 줄만 보낸다. 서버가 다시 대조하므로 여기가 최종 방어선은 아니다.
  const payload = JSON.stringify(
    dirtyRows.map((row) => {
      const d = draftFor(row, drafts);
      const num = (v: string) => (v === "" ? null : Number(v));
      return {
        studentProfileId: row.studentProfileId,
        expectedUpdatedAt: row.enrollmentUpdatedAt,
        grade: num(d.grade),
        classNo: num(d.classNo),
        number: num(d.number),
        status: d.status,
      };
    }),
  );

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submittedDraftsRef.current = Object.fromEntries(
          dirtyRows.map((row) => [row.studentProfileId, draftFor(row, drafts)]),
        );
      }}
    >
      <input type="hidden" name="changes" value={payload} />
      <input type="hidden" name="year" value={year} />

      <SectionCard
        title="학생"
        aside={
          <div className="flex items-center gap-2.5">
            {dirtyIds.length > 0 && (
              <span className="text-xs font-medium text-amber-ink">
                {dirtyIds.length}명 고침
              </span>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={pending || dirtyIds.length === 0}
            >
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        }
        controls={
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {["ALL", "1", "2", "3"].map((g) => (
                <Button
                  key={g}
                  type="button"
                  variant="chip"
                  size="sm"
                  active={gradeFilter === g}
                  onClick={() => setGradeFilter(g)}
                >
                  {g === "ALL" ? "전체" : `${g}학년`}
                </Button>
              ))}
            </div>

            <Input
              dense
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              // Enter가 이 폼을 제출시키지 않게 막는다 — 검색은 저장이 아니다.
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-label="이름 · 이메일 검색"
              placeholder="이름 · 이메일 검색"
              className="mt-2.5"
            />
          </>
        }
        flush
      >
        {state.error && (
          <Note tone="error" className="mx-5 mt-4">
            {state.error}
          </Note>
        )}
        {state.saved !== null && !state.error && (
          <Note tone="success" className="mx-5 mt-4">
            {state.saved === 0
              ? "바뀐 내용이 없습니다."
              : `${state.saved}명 저장했습니다.`}
          </Note>
        )}

        {filtered.length === 0 ? (
          <EmptyState variant="inside">조건에 맞는 학생이 없습니다.</EmptyState>
        ) : (
          <TableFrame minWidth={820} headers={HEADERS}>
            <tbody>
              {filtered.map((row) => {
                const d = draftFor(row, drafts);
                const dirty = !sameAsRow(row, d);
                const enrolled = d.status === "ENROLLED";

                return (
                  <tr
                    key={row.studentProfileId}
                    className={
                      dirty
                        ? "border-b border-line2 bg-amber-soft last:border-0"
                        : "border-b border-line2 last:border-0"
                    }
                  >
                    <td className={cell(0)}>
                      <span className="font-medium text-ink">{row.name}</span>
                      <span className="block text-xs text-mut">{row.email}</span>
                    </td>
                    {(["grade", "classNo", "number"] as const).map((f, i) => (
                      <td key={f} className={cell(i + 1)}>
                        {/* 폭은 바깥에서 준다 — cn()이 w-full을 못 덮는다. */}
                        <div className="w-20">
                          <Input
                            dense
                            type="number"
                            aria-label={`${row.name} ${
                              { grade: "학년", classNo: "반", number: "번호" }[f]
                            }`}
                            value={d[f]}
                            disabled={!enrolled}
                            onChange={(e) =>
                              set(row.studentProfileId, { [f]: e.currentTarget.value })
                            }
                          />
                        </div>
                      </td>
                    ))}
                    <td className={cell(4)}>
                      <div className="w-28">
                        <Select
                          dense
                          aria-label={`${row.name} 학적`}
                          value={d.status}
                          onChange={(e) =>
                            set(row.studentProfileId, {
                              status: e.currentTarget.value as Draft["status"],
                            })
                          }
                        >
                          {ENROLLMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {ENROLLMENT_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td className={`${cell(5)} text-xs text-mut`}>
                      {row.accountActive ? "활성" : "비활성"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        )}
      </SectionCard>
    </form>
  );
}
