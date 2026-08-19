import { describe, expect, it } from "vitest";
import { previewFingerprintFor } from "@/app/(app)/admin/students/import/preview-fingerprint";
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

function rosterRow(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    line: 2,
    studentCode: "ABCD2345",
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 7,
    status: "ENROLLED",
    errors: [],
    ...overrides,
  };
}

function plan(overrides: Partial<RosterPlan> = {}): RosterPlan {
  return {
    newStudents: [],
    reassign: [],
    statusChange: [],
    newAssignment: [],
    needsAttention: [],
    errorRows: [],
    missingFromFile: [],
    hasBlockingError: false,
    ...overrides,
  };
}

describe("previewFingerprintFor()", () => {
  it("줄 수와 첫/끝 줄이 같아도 중간 줄 내용이 바뀌면 지문이 바뀐다", () => {
    const rows = [
      rosterRow({ line: 2, name: "첫학생" }),
      rosterRow({ line: 3, name: "중간학생", number: 8 }),
      rosterRow({ line: 4, name: "끝학생" }),
    ];

    const before = previewFingerprintFor({
      year: 2026,
      rows,
      plan: plan(),
      notices: [],
      rosterFingerprint: "roster-before",
      previewToken: "token-before",
    });
    const after = previewFingerprintFor({
      year: 2026,
      rows: rows.map((row) =>
        row.line === 3 ? { ...row, number: 9 } : row,
      ),
      plan: plan(),
      notices: [],
      rosterFingerprint: "roster-before",
      previewToken: "token-before",
    });

    expect(after).not.toBe(before);
  });

  it("계획과 안내문까지 지문에 포함한다", () => {
    const base = {
      year: 2026,
      rows: [rosterRow()],
      notices: [],
    };

    expect(previewFingerprintFor({ ...base, plan: plan(), rosterFingerprint: "roster-v1", previewToken: "token-v1" })).not.toBe(
      previewFingerprintFor({
        ...base,
        plan: plan({ hasBlockingError: true, errorRows: [rosterRow({ errors: ["오류"] })] }),
        rosterFingerprint: "roster-v1",
        previewToken: "token-v1",
      }),
    );
    expect(previewFingerprintFor({ ...base, plan: plan(), rosterFingerprint: "roster-v1", previewToken: "token-v1" })).not.toBe(
      previewFingerprintFor({
        ...base,
        plan: plan(),
        notices: ["학생코드 열 없음"],
        rosterFingerprint: "roster-v1",
        previewToken: "token-v1",
      }),
    );
  });

  it("DB 명단 지문과 미리보기 토큰이 바뀌면 같은 파일이어도 지문이 바뀐다", () => {
    const base = {
      year: 2026,
      rows: [rosterRow()],
      plan: plan(),
      notices: [],
    };

    expect(
      previewFingerprintFor({
        ...base,
        rosterFingerprint: "roster-before",
        previewToken: "token-before",
      }),
    ).not.toBe(
      previewFingerprintFor({
        ...base,
        rosterFingerprint: "roster-after",
        previewToken: "token-after",
      }),
    );
  });

  it("32비트 FNV로 충돌하던 미리보기 상태도 서로 다른 키가 된다", () => {
    const base = {
      year: 2026,
      rows: [rosterRow()],
      plan: plan(),
      rosterFingerprint: "roster-v1",
      previewToken: "token-v1",
    };

    expect(previewFingerprintFor({ ...base, notices: ["I2Cca"] })).not.toBe(
      previewFingerprintFor({ ...base, notices: ["eCada"] }),
    );
  });
});
