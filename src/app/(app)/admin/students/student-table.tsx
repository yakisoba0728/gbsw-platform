"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { setUnsavedEdits } from "@/app/(app)/admin/users/unsaved";
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
} from "@/core/authz/enrollment-status";
import { SAVE_INITIAL } from "./action-state";
import { saveEnrollmentsAction } from "./actions";
import { honorificName } from "@/core/authz/roles";
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

  const submittedDraftsRef = useRef<Record<string, Draft>>({});

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

  const dirty = dirtyIds.length > 0;
  useEffect(() => {
    setUnsavedEdits(dirty);
    return () => setUnsavedEdits(false);
  }, [dirty]);

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
            <ConfirmSubmit
              label="저장"
              title="학적 저장"
              description={`고친 ${dirtyIds.length}명의 학년·반·번호와 학적을 저장합니다.`}
              confirmLabel="저장"
              pendingLabel="저장 중…"
              pending={pending}
              disabled={dirtyIds.length === 0}
              size="sm"
              full={false}
            />
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
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
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
          <>
            <p className="border-b border-line2 px-5 py-2 text-xs text-mut lg:hidden">
              표를 좌우로 밀어 학년·반·번호와 학적을 수정할 수 있습니다.
            </p>
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
                        <span className="font-medium text-ink">
                          {honorificName(row.name, "STUDENT")}
                        </span>
                        <span className="block text-xs text-mut">{row.email}</span>
                      </td>
                      {(["grade", "classNo", "number"] as const).map((f, i) => (
                        <td key={f} className={cell(i + 1)}>
                          <div className="w-20">
                            <Input
                              size="sm"
                              type="number"
                              aria-label={`${honorificName(row.name, "STUDENT")} ${
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
                            size="sm"
                            aria-label={`${honorificName(row.name, "STUDENT")} 학적`}
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
          </>
        )}
      </SectionCard>
    </form>
  );
}
