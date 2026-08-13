"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";
import { SAVE_INITIAL } from "./action-state";
import { saveEnrollmentsAction } from "./actions";

export type StudentRow = {
  studentProfileId: string;
  name: string;
  email: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  accountActive: boolean;
};

/** 편집 중인 값. 표시용 문자열로 들고 있다가 보낼 때 숫자로 바꾼다. */
type Draft = {
  grade: string;
  classNo: string;
  number: string;
  status: EnrollmentStatus;
};

function toDraft(row: StudentRow): Draft {
  return {
    grade: row.grade == null ? "" : String(row.grade),
    classNo: row.classNo == null ? "" : String(row.classNo),
    number: row.number == null ? "" : String(row.number),
    // 배정이 없는 학생은 재학으로 시작한다 — 이 화면에서 채우는 게 보통이다.
    status: (row.status as EnrollmentStatus) ?? "ENROLLED",
  };
}

function sameAsRow(row: StudentRow, d: Draft): boolean {
  return (
    d.grade === (row.grade == null ? "" : String(row.grade)) &&
    d.classNo === (row.classNo == null ? "" : String(row.classNo)) &&
    d.number === (row.number == null ? "" : String(row.number)) &&
    d.status === ((row.status as EnrollmentStatus) ?? "ENROLLED")
  );
}

export function StudentTable({ rows }: { rows: StudentRow[] }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentProfileId, toDraft(r)])),
  );
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("ALL");
  const [state, formAction, pending] = useActionState(
    saveEnrollmentsAction,
    SAVE_INITIAL,
  );

  const dirtyIds = useMemo(
    () =>
      rows
        .filter((r) => !sameAsRow(r, drafts[r.studentProfileId]!))
        .map((r) => r.studentProfileId),
    [rows, drafts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const d = drafts[r.studentProfileId]!;
      if (gradeFilter !== "ALL" && d.grade !== gradeFilter) return false;
      if (!q) return true;
      return [r.name, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [rows, drafts, query, gradeFilter]);

  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  // 바뀐 줄만 보낸다. 서버가 다시 대조하므로 여기가 최종 방어선은 아니다.
  const payload = JSON.stringify(
    dirtyIds.map((id) => {
      const d = drafts[id]!;
      const num = (v: string) => (v === "" ? null : Number(v));
      return {
        studentProfileId: id,
        grade: num(d.grade),
        classNo: num(d.classNo),
        number: num(d.number),
        status: d.status,
      };
    }),
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="changes" value={payload} />

      <section className="rounded-card border border-line bg-surface">
        <header className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-ink">학생</h2>
            <div className="flex items-center gap-2.5">
              {dirtyIds.length > 0 && (
                <span className="text-[12px] font-semibold text-amber-ink">
                  {dirtyIds.length}명 수정됨
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
          </div>

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
            placeholder="이름 · 이메일 검색"
            className="mt-2.5"
          />
        </header>

        {state.error && (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
          >
            {state.error}
          </p>
        )}
        {state.saved !== null && !state.error && (
          <p className="mx-5 mt-4 rounded-btn bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
            {state.saved === 0
              ? "바뀐 내용이 없습니다."
              : `${state.saved}명 저장했습니다.`}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-mut">
            조건에 맞는 학생이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line2 text-[12px] text-mut">
                  <th className="px-5 py-2.5 font-semibold">이름</th>
                  <th className="px-3 py-2.5 font-semibold">학년</th>
                  <th className="px-3 py-2.5 font-semibold">반</th>
                  <th className="px-3 py-2.5 font-semibold">번호</th>
                  <th className="px-3 py-2.5 font-semibold">학적</th>
                  <th className="px-5 py-2.5 font-semibold">계정</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const d = drafts[row.studentProfileId]!;
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
                      <td className="px-5 py-2">
                        <span className="font-semibold text-ink">{row.name}</span>
                        <span className="block text-[12px] text-mut">
                          {row.email}
                        </span>
                      </td>
                      {(["grade", "classNo", "number"] as const).map((f) => (
                        <td key={f} className="px-3 py-2">
                          <Input
                            dense
                            type="number"
                            aria-label={`${row.name} ${
                              { grade: "학년", classNo: "반", number: "번호" }[f]
                            }`}
                            value={d[f]}
                            disabled={!enrolled}
                            onChange={(e) => set(row.studentProfileId, { [f]: e.currentTarget.value })}
                            className="w-20"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <Select
                          dense
                          aria-label={`${row.name} 학적`}
                          value={d.status}
                          onChange={(e) =>
                            set(row.studentProfileId, {
                              status: e.currentTarget.value as EnrollmentStatus,
                            })
                          }
                          className="w-28"
                        >
                          {ENROLLMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {ENROLLMENT_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-5 py-2 text-[12px] text-mut">
                        {row.accountActive ? "활성" : "비활성"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </form>
  );
}
