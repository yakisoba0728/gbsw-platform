import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterRow } from "@/modules/enrollment/roster.parse";

/**
 * 명단 업로드(미리보기·확정·내려받기) 액션의 **경계**.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 admin/students/import/import-form.tsx가 실제로 보내는 name 그대로
 * 만든다 — 미리보기는 `file` 하나, 확정은 `rows`·`year`·`confirmedDeletionIds`·
 * `deletionCount` 넷이다. 넷 중 셋이 **JSON 문자열 또는 빈 문자열**이라
 * 폼과 액션 사이에 모양 계약이 여럿 있고, 그중 하나만 어긋나도 확정이
 * 통째로 막힌다 — 최초 관리자 생성이 그렇게 100% 실패했다.
 */

// 목은 구현 없이 선언하고 기본값은 beforeEach에서 준다.
const requireAuth = vi.fn();
const revalidatePath = vi.fn();

const previewRoster = vi.fn();
const applyRosterPlan = vi.fn();
const exportRoster = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/enrollment/roster.service", () => ({
  RosterError: class RosterError extends Error {},
  previewRoster,
  applyRosterPlan,
  exportRoster,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  AcademicYearError: class AcademicYearError extends Error {},
}));

const { RosterError } = await import("@/modules/enrollment/roster.service");
const { AcademicYearError } = await import(
  "@/modules/academic-year/academic-year.service"
);
const { issuePreviewToken, verifyPreviewToken } = await import(
  "@/app/(app)/admin/students/import/preview-token"
);
const { rosterRowsSchema } = await import("@/modules/enrollment/roster.schema");
const { previewRosterAction, applyRosterAction, exportRosterAction } =
  await import("@/app/(app)/admin/students/import/actions");

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** roster.parse.ts가 미리보기에서 만들어 화면으로 보내는 한 줄 그대로. */
const ROW: RosterRow = {
  line: 2,
  studentCode: "ABCD2345",
  name: "홍길동",
  birthDate: "2010-03-02",
  grade: 1,
  classNo: 2,
  number: 13,
  status: "ENROLLED",
  errors: [],
};

const PLAN = {
  newStudents: [],
  reassign: [],
  statusChange: [],
  newAssignment: [],
  needsAttention: [],
  errorRows: [],
  missingFromFile: [],
  hasBlockingError: false,
};

function tokenFor(fields: {
  rows?: unknown;
  year?: string;
  rosterFingerprint?: string;
  confirmedDeletionIds?: string;
} = {}): string {
  const rows = rosterRowsSchema.safeParse(fields.rows ?? [ROW]);
  let deletionIds: string[] = [];
  try {
    const parsed = JSON.parse(fields.confirmedDeletionIds ?? "[]");
    if (Array.isArray(parsed)) deletionIds = parsed.filter((id) => typeof id === "string");
  } catch {
    deletionIds = [];
  }

  return issuePreviewToken({
    year: Number(fields.year ?? "2026"),
    rows: rows.success ? rows.data : [ROW],
    deletionIds,
    rosterFingerprint: fields.rosterFingerprint ?? "roster-v1",
  });
}

function rowsForToken(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return [ROW];
  }
}

/** import-form.tsx의 확정 폼이 보내는 필드 그대로. */
function applyForm(over: Record<string, string> = {}): FormData {
  const fields = {
    rows: JSON.stringify([ROW]),
    year: "2026",
    rosterFingerprint: "roster-v1",
    confirmedDeletionIds: "[]",
    // 삭제 대상이 없으면 화면에 입력칸이 없어 빈 문자열이 온다 — 정상 경로다.
    // (삭제 대상이 있는데 비어 있으면 서비스가 거부한다 — 이 경계의 몫이 아니다.)
    deletionCount: "",
    ...over,
  };
  const previewToken =
    over.previewToken ??
    tokenFor({
      rows: rowsForToken(fields.rows),
      year: fields.year,
      rosterFingerprint: fields.rosterFingerprint,
      confirmedDeletionIds: fields.confirmedDeletionIds,
    });

  return form({
    ...fields,
    previewToken,
  });
}

const PREVIEW_INITIAL = {
  error: null,
  year: null,
  rows: [],
  plan: null,
  notices: [],
  rosterFingerprint: null,
  previewToken: null,
};
const APPLY_INITIAL = {
  error: null,
  saved: null,
  deleted: null,
  excludedNew: [],
  invites: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  previewRoster.mockResolvedValue({
    year: 2026,
    rows: [ROW],
    plan: PLAN,
    notices: [],
    rosterFingerprint: "roster-v1",
  });
  applyRosterPlan.mockResolvedValue({
    saved: 2,
    deleted: 0,
    invites: [],
    excludedNewStudents: [],
  });
  exportRoster.mockResolvedValue({ year: 2026, rows: [] });
});

describe("previewRosterAction — 경계 검증", () => {
  it("파일을 고르면 서비스까지 도달한다", async () => {
    const file = new File(["학생코드,이름\n"], "명단.csv", { type: "text/csv" });

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).toHaveBeenCalledOnce();
    expect(previewRoster.mock.calls[0]?.[1].filename).toBe("명단.csv");
    expect(previewRoster.mock.calls[0]?.[1].buffer).toBeInstanceOf(Buffer);
    expect(state.error).toBeNull();
    expect(state.year).toBe(2026);
    expect(state.rosterFingerprint).toBe("roster-v1");
    expect(state.previewToken).toEqual(expect.any(String));
    expect(
      verifyPreviewToken(state.previewToken!, {
        year: 2026,
        rows: [ROW],
        deletionIds: [],
        rosterFingerprint: "roster-v1",
      }),
    ).toBe(true);
  });

  it("파일을 안 고르면 서비스를 부르지 않는다", async () => {
    const state = await previewRosterAction(PREVIEW_INITIAL, new FormData());

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일을 선택해 주세요.");
  });

  it("빈 파일은 서비스를 부르지 않는다", async () => {
    const file = new File([], "빈파일.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일을 선택해 주세요.");
  });

  it("5MB를 넘는 파일은 읽기 전에 막는다", async () => {
    const file = new File(["x".repeat(5 * 1024 * 1024 + 1)], "큰파일.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일이 너무 큽니다.");
  });

  it("현재 학년도가 없으면 파일 문제로 안내하지 않는다", async () => {
    previewRoster.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));
    const file = new File(["a"], "명단.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toContain("현재 학년도가 없습니다");
  });

  it("읽을 줄이 없으면 서식 파일을 안내한다", async () => {
    previewRoster.mockRejectedValueOnce(new RosterError("EMPTY"));
    const file = new File(["a"], "명단.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toBe("읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    previewRoster.mockRejectedValueOnce(new Error("Corrupt zip"));
    const file = new File(["a"], "명단.xlsx");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toBe("파일을 읽지 못했습니다.");
  });

  it("xlsx 사전 검사 오류는 원인을 한국어로 알린다", async () => {
    previewRoster.mockRejectedValueOnce(new Error("XLSX_ZIP_BOMB"));
    const file = new File(["a"], "명단.xlsx");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toBe("압축을 풀었을 때 너무 큰 엑셀 파일입니다.");
  });
});

describe("preview-token — HMAC 정규형", () => {
  const input = {
    year: 2026,
    rows: [ROW],
    deletionIds: [],
    rosterFingerprint: "roster-v1",
  };

  it("정상 토큰만 통과한다", () => {
    const token = issuePreviewToken(input);

    expect(verifyPreviewToken(token, input)).toBe(true);
  });

  it("base64url 문자가 아닌 MAC은 decode 전에 거부한다", () => {
    const token = issuePreviewToken(input).replace(/.$/u, "!");

    expect(verifyPreviewToken(token, input)).toBe(false);
  });

  it("패딩이 붙은 대체 base64url 표기도 거부한다", () => {
    const token = `${issuePreviewToken(input)}=`;

    expect(verifyPreviewToken(token, input)).toBe(false);
  });
});

describe("applyRosterAction — 경계 검증", () => {
  it("확정 폼이 보내는 네 필드 그대로면 서비스까지 도달한다", async () => {
    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(applyRosterPlan).toHaveBeenCalledWith(
      expect.anything(),
      2026,
      [ROW],
      "roster-v1",
      [],
      null, // 빈 deletionCount는 "입력 안 함"이라 null로 접힌다
    );
    expect(state).toEqual({
      error: null,
      saved: 2,
      deleted: 0,
      excludedNew: [],
      invites: [],
    });
  });

  it("서비스에는 스키마가 정규화한 행만 넘긴다", async () => {
    const decomposedName = "홍길동";
    const tampered = {
      ...ROW,
      name: `  ${decomposedName}  `,
      errors: ["클라이언트 조작 오류"],
    };

    await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan.mock.calls[0]?.[2]).toEqual([
      { ...ROW, name: "홍길동", errors: [] },
    ]);
  });

  it("비재학 행의 조작된 학년·반·번호는 서비스에 닿기 전에 null이 된다", async () => {
    const tampered = {
      ...ROW,
      status: "WITHDRAWN",
      grade: 1,
      classNo: 2,
      number: 13,
    };

    await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan.mock.calls[0]?.[2]).toEqual([
      {
        ...ROW,
        status: "WITHDRAWN",
        grade: null,
        classNo: null,
        number: null,
      },
    ]);
  });

  it("미리보기가 본 삭제 대상 id 목록이 그대로 서비스에 닿는다", async () => {
    await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ confirmedDeletionIds: JSON.stringify(["sp-10", "sp-9"]) }),
    );

    expect(applyRosterPlan.mock.calls[0]?.[4]).toEqual(["sp-10", "sp-9"]);
  });

  it("삭제 인원 확인 건수를 숫자로 넘긴다", async () => {
    await applyRosterAction(APPLY_INITIAL, applyForm({ deletionCount: "42" }));

    expect(applyRosterPlan.mock.calls[0]?.[5]).toBe(42);
  });

  it("1명이 빠져도 건수를 그대로 넘긴다", async () => {
    await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ confirmedDeletionIds: JSON.stringify(["sp-9"]), deletionCount: "1" }),
    );

    expect(applyRosterPlan.mock.calls[0]?.[4]).toEqual(["sp-9"]);
    expect(applyRosterPlan.mock.calls[0]?.[5]).toBe(1);
  });

  it("미리보기 토큰이 없으면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ previewToken: "" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("미리보기 정보가 바뀌었습니다. 파일을 다시 읽어 주세요.");
  });

  it("미리보기 이후 행을 조작하면 HMAC 대조에서 거부한다", async () => {
    const previewToken = tokenFor();
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({
        rows: JSON.stringify([{ ...ROW, number: 14 }]),
        previewToken,
      }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("미리보기 정보가 바뀌었습니다. 파일을 다시 읽어 주세요.");
  });

  it("미리보기 이후 명단 지문을 조작하면 HMAC 대조에서 거부한다", async () => {
    const previewToken = tokenFor();
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({
        rosterFingerprint: "roster-v2",
        previewToken,
      }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("미리보기 정보가 바뀌었습니다. 파일을 다시 읽어 주세요.");
  });

  it("건수 칸에 숫자가 아닌 값이 오면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ deletionCount: "마흔둘" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("빠지는 인원 수를 정확히 입력해 주세요.");
  });

  it("미리보기 지문이 없으면 서비스를 부르지 않는다", async () => {
    const fd = applyForm();
    fd.delete("rosterFingerprint");

    const state = await applyRosterAction(APPLY_INITIAL, fd);

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("미리보기 정보가 없습니다. 파일을 다시 읽어 주세요.");
  });

  /*
   * 미리보기가 돌려준 값을 그대로 믿지 않는다 (I3) — errors를 지워 보내거나
   * status/학년·반·번호 조합을 조작한 요청이 여기서 막혀야 한다.
   */
  it("재학인데 자리가 비어 있으면 서비스를 부르지 않는다", async () => {
    const tampered = { ...ROW, grade: null, classNo: null, number: null, errors: [] };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("재학이면 학년·반·번호가 모두 있어야 합니다.");
  });

  it("학생코드 형식이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const tampered = { ...ROW, studentCode: "1234" };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("학생코드 형식이 올바르지 않습니다.");
  });

  it("빈 학생코드는 신규 학생이라 통과한다", async () => {
    const fresh = { ...ROW, studentCode: "" };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([fresh]) }),
    );

    expect(applyRosterPlan).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
  });

  it("rows JSON이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: "{not json" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("반영할 내용을 읽지 못했습니다.");
  });

  it("삭제 확인 JSON이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ confirmedDeletionIds: "{not json" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("확인 정보를 읽지 못했습니다.");
  });

  it("학년도가 범위 밖이면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(APPLY_INITIAL, applyForm({ year: "1999" }));

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("학년도가 올바르지 않습니다.");
  });

  /*
   * 서비스가 애써 돌려준 excludedNewStudents를 액션이 구조분해에서 빠뜨리면
   * 화면까지 닿지 않는다 — 관리자는 안 만들어진 계정을 만들어졌다고 믿는다.
   */
  it("계정이 안 만들어진 신규 줄을 화면까지 전달한다", async () => {
    applyRosterPlan.mockResolvedValueOnce({
      saved: 3,
      deleted: 1,
      invites: [{ code: "GBSWAAAA1111" }],
      excludedNewStudents: [{ line: 7, name: "김철수" }],
    });

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.excludedNew).toEqual([{ line: 7, name: "김철수" }]);
    expect(state.invites).toHaveLength(1);
    expect(state.deleted).toBe(1);
  });

  it("삭제 대상이 바뀌었으면 다시 확인하라고 안내한다", async () => {
    applyRosterPlan.mockRejectedValueOnce(new RosterError("DELETION_SET_CHANGED"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.error).toBe("빠지는 학생이 달라졌습니다. 새로고침 후 다시 확인해 주세요.");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    applyRosterPlan.mockRejectedValueOnce(new RosterError("SOME_NEW_CODE"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.error).toBe("반영하지 못했습니다.");
  });

  it("명단 밖 계정이 자리를 붙들고 있으면 어디를 고쳐야 하는지 알린다", async () => {
    applyRosterPlan.mockRejectedValueOnce(new RosterError("NUMBER_TAKEN"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    // 파일을 고쳐도 풀리지 않는 오류다 — "반영하지 못했습니다."로 뭉뚱그리면
    // 관리자가 엉뚱한 곳을 계속 고친다.
    expect(state.error).toContain("같은 반·번호");
  });

  it("예상 못 한 오류는 화면에 흘리지 않되 서버 로그에는 남긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    applyRosterPlan.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.error).toBe("반영하지 못했습니다.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await applyRosterAction(APPLY_INITIAL, applyForm({ rows: "{not json" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("exportRosterAction — 경계 검증", () => {
  it("인수 없이 부르면 서비스까지 도달한다", async () => {
    const result = await exportRosterAction();

    expect(exportRoster).toHaveBeenCalledOnce();
    expect(result).toEqual({ error: null, year: 2026, rows: [] });
  });

  it("현재 학년도가 없으면 그 이유를 알린다", async () => {
    exportRoster.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));

    const result = await exportRosterAction();

    expect(result.error).toContain("현재 학년도가 없습니다");
  });

  it("예상 못 한 오류는 영문을 화면에 흘리지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    exportRoster.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const result = await exportRosterAction();

    expect(result.error).toBe("명단을 내보내지 못했습니다.");
    // 화면에는 일반 문구만 나가므로 서버 로그에는 남겨야 한다.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * 파일 크기 상한은 두 곳이 맞물려야 안내가 나간다 — 액션의 검사와 next.config.ts의
 * `bodySizeLimit`. 상한이 본문 상한보다 커지면 그 사이 파일은 액션에 닿기도 전에
 * 잘려 안내 대신 오류 경계가 뜬다.
 */
describe("명단 파일 크기 상한", () => {
  it("서버 액션 본문 상한보다 작다", async () => {
    const { readFile } = await import("node:fs/promises");
    const { ROSTER_FILE_MAX_BYTES } = await import("@/modules/enrollment/roster.schema");

    const config = await readFile(`${process.cwd()}/next.config.ts`, "utf8");
    const matched = /bodySizeLimit:\s*"(\d+)mb"/.exec(config);

    expect(matched, "next.config.ts에서 bodySizeLimit을 찾지 못했다").not.toBeNull();
    expect(ROSTER_FILE_MAX_BYTES).toBeLessThan(Number(matched![1]) * 1024 * 1024);
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await previewRosterAction(PREVIEW_INITIAL, new FormData());

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
