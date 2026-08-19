import { describe, expect, it } from "vitest";
import type { StudentRow } from "@/app/(app)/admin/students/student-table";
import { clearUnchangedSubmittedDrafts } from "@/app/(app)/admin/students/student-table-drafts";

const row: StudentRow = {
  studentProfileId: "sp-1",
  enrollmentUpdatedAt: null,
  name: "김동혁",
  email: "student@example.com",
  grade: 1,
  classNo: 3,
  number: 7,
  status: "ENROLLED",
  accountActive: true,
};

describe("clearUnchangedSubmittedDrafts()", () => {
  it("저장 성공 뒤 제출 당시 값과 그대로 같으면 draft를 지운다", () => {
    const drafts = { "sp-1": { classNo: "4" } };
    const submitted = {
      "sp-1": { grade: "1", classNo: "4", number: "7", status: "ENROLLED" as const },
    };

    expect(clearUnchangedSubmittedDrafts([row], drafts, submitted)).toEqual({});
  });

  it("저장 대기 중 같은 줄을 더 고쳤으면 새 draft를 보존한다", () => {
    const drafts = { "sp-1": { classNo: "5" } };
    const submitted = {
      "sp-1": { grade: "1", classNo: "4", number: "7", status: "ENROLLED" as const },
    };

    expect(clearUnchangedSubmittedDrafts([row], drafts, submitted)).toEqual(drafts);
  });
});
