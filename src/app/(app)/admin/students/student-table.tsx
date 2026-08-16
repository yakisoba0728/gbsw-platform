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

const HEADERS = ["이름", "학년", "반", "번호", "학적", "계정"] as const;

/** 본문 셀의 좌우 여백. 머리글과 같은 규칙을 써야 세로줄이 맞는다. */
const cell = (index: number) => `${tableCellPadding(index, HEADERS.length)} py-2`;

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

/**
 * 사용자가 실제로 건드린 필드만 들고 있는 override.
 *
 * 이전엔 마운트 시점에 `rows` 전체를 한 번 복사해 두고 그 사본만 읽었다.
 * 그래서 저장 후 rows가 새로 내려와도(초대코드 가입으로 새 학생이 생기거나,
 * 졸업 저장으로 서버가 반·번호를 비우거나) 화면은 옛 사본을 계속 보여줬다 —
 * 마운트 뒤에 늘어난 studentProfileId는 아예 없어서 크래시까지 났다 (I4).
 *
 * 필드 단위 override + 미지정 필드는 항상 rows에서 읽는 이 구조는 그 둘의
 * 뿌리를 같이 없앤다: 편집하지 않은 값은 늘 최신 rows를 그대로 반영한다.
 */
function draftFor(
  row: StudentRow,
  overrides: Record<string, Partial<Draft>>,
): Draft {
  return { ...toDraft(row), ...overrides[row.studentProfileId] };
}

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

  // 지금 폼을 제출하면 실제로 서버로 나가는 id들. 클릭 시점 값을 그대로 붙잡아 둔다 —
  // 저장이 진행되는 동안 사용자가 다른 줄을 마저 고칠 수 있어서, 응답이 온 시점의
  // dirtyIds를 그대로 쓰면 그 사이에 새로 생긴(아직 서버에 보내지 않은) 편집까지
  // "저장됐다"고 착각해 지워버릴 수 있다.
  const submittedIdsRef = useRef<string[]>([]);

  // 저장이 성공하면 이번에 보낸 줄들의 override를 지운다 — 다음 렌더의 draftFor가
  // 새로 내려온 rows를 그대로 읽으면서 서버 값과 다시 맞아떨어진다. 실패하면
  // 사용자가 입력 중이던 값을 잃으면 안 되므로 건드리지 않는다.
  useEffect(() => {
    if (state.saved === null || state.error) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of submittedIdsRef.current) delete next[id];
      return next;
    });
  }, [state]);

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
        submittedIdsRef.current = dirtyIds;
      }}
    >
      <input type="hidden" name="changes" value={payload} />
      <input type="hidden" name="year" value={year} />

      <SectionCard
        title="학생"
        aside={
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
              // Enter가 이 폼 전체를 제출시키지 않게 막는다 — 검색은 저장이 아니다 (M1).
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
                      <span className="font-semibold text-ink">{row.name}</span>
                      <span className="block text-[12px] text-mut">
                        {row.email}
                      </span>
                    </td>
                    {(["grade", "classNo", "number"] as const).map((f, i) => (
                      <td key={f} className={cell(i + 1)}>
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
                    <td className={cell(4)}>
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
                    <td className={`${cell(5)} text-[12px] text-mut`}>
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
