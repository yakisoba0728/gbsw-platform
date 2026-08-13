# 명단 일괄 등록 구현 계획 (3단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 명단 파일(CSV·xlsx)을 올려 전교생 소속을 한 번에 갱신하고, 신입생분 초대코드를 일괄 발급한다.

**Architecture:** 파싱과 분류를 순수 함수로 떼어 DB 없이 테스트한다. 확정 전 미리보기 단계가 아무것도 저장하지 않고 무엇이 바뀔지 보여주며, 오류가 하나라도 있으면 확정을 막는다. 확정은 한 트랜잭션에서 그 학년도 배정을 **전부 지우고 새로 넣는다** — 번호 교환·재번호가 유일 제약에 걸리지 않는 유일한 방법이다.

**Tech Stack:** Prisma 7.9 + `@prisma/adapter-pg`, PostgreSQL 18, Next.js 16 App Router (Server Actions), zod 4, vitest 4, `read-excel-file` 9.3.

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`
- 계층: `Route/Server Action → Service → Repo`. **repo에는 Prisma 호출만.**
- 학년도는 service가 `getCurrentYear()`로 읽는다. 확정 요청에는 **학년도를 함께 실어** 렌더와 저장 사이 전환을 거부한다 (2단계에서 같은 사고를 겪었다).
- `can()`은 service 안에서도 호출한다. 액션은 `student:manage`이며, 초대코드를 만들므로 **`invite:create`도 함께** 검사한다.
- 모든 생성/수정/삭제는 `recordAudit()`. **감사로그에는 값이 아니라 항목 이름만.**
- 학적 저장값은 영문 상수(`src/core/authz/enrollment-status.ts`), 엑셀 표기는 한글 라벨. 파서가 라벨→상수로 옮긴다.
- 각 태스크 끝에 `npm run verify` 통과. 마지막 태스크는 `npm run build`도. **lint 경고 0.**
- 주석·커밋 메시지는 한국어로, "왜"를 적는다.

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `src/modules/enrollment/roster.parse.ts` | 파일 → 정규화된 행. 순수 함수 |
| `src/modules/enrollment/roster.plan.ts` | 행 + 현재 상태 → 분류 결과. 순수 함수 |
| `src/modules/enrollment/roster.service.ts` | 권한·미리보기·확정 반영 |
| `src/modules/enrollment/roster.repo.ts` | Prisma 호출만 |
| `src/app/(app)/admin/students/import/page.tsx` | 업로드·미리보기 화면 |
| `src/app/(app)/admin/students/import/import-form.tsx` | 클라이언트 |
| `src/app/(app)/admin/students/import/actions.ts` | 얇은 서버 액션 |
| `src/app/(app)/admin/students/import/action-state.ts` | 상태 타입·초기값 |
| `tests/modules/enrollment/roster.parse.test.ts` | 파싱 |
| `tests/modules/enrollment/roster.plan.test.ts` | 분류 |
| `tests/modules/enrollment/roster.service.test.ts` | 권한·확정 |

**수정**

| 파일 | 무엇을 |
|---|---|
| `package.json` | `read-excel-file` 추가 |
| `src/modules/enrollment/enrollment.repo.ts` | `NumberTakenError`를 공용으로 옮긴 것 반영 |
| `src/modules/admin-users/admin-user.repo.ts` | 같은 이유 |
| `src/core/db/unique-violation.ts` | `NumberTakenError`를 여기로 |
| `src/app/(app)/admin/students/page.tsx` | "명단 올리기" 링크 |

---

### Task 1: 명단 파싱

**Files:**
- Create: `src/modules/enrollment/roster.parse.ts`
- Test: `tests/modules/enrollment/roster.parse.test.ts`
- Modify: `package.json` (`npm i read-excel-file@9.3.10 --save-exact`)

**Interfaces:**
- Consumes: `ENROLLMENT_STATUS_LABELS`, `isEnrollmentStatus` from `@/core/authz/enrollment-status`
- Produces:
  - `type RosterRow = { line: number; name: string; birthDate: string; grade: number | null; classNo: number | null; number: number | null; status: EnrollmentStatus | null; errors: string[] }`
  - `parseCsv(text: string): string[][]`
  - `normalizeRows(table: string[][]): RosterRow[]`
  - `parseRoster(input: { filename: string; buffer: Buffer }): Promise<RosterRow[]>`
  - `ROSTER_COLUMNS: readonly string[]` — `["이름","생년월일","학년","반","번호","학적"]`

- [ ] **Step 1: 의존성을 넣는다**

Run: `npm i read-excel-file@9.3.10 --save-exact`

이 패키지의 `node` 진입점은 **첫 시트만 읽는 함수가 따로 있다.** 기본 export(`readXlsxFile`)는 시트 **전부**를 `{ sheet, data }[]`로 돌려주므로 쓰지 않는다. `readSheet(input)`이 첫 시트의 `Row[]`를 준다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
// tests/modules/enrollment/roster.parse.test.ts
import { describe, expect, it } from "vitest";
import { normalizeRows, parseCsv } from "@/modules/enrollment/roster.parse";

const HEADER = ["이름", "생년월일", "학년", "반", "번호", "학적"];

describe("parseCsv()", () => {
  it("BOM과 CRLF를 걷어낸다 — 엑셀이 CSV UTF-8로 저장하면 둘 다 붙는다", () => {
    const table = parseCsv('﻿이름,학년\r\n김동혁,1\r\n');
    expect(table).toEqual([["이름", "학년"], ["김동혁", "1"]]);
  });

  it("따옴표 안의 쉼표와 줄바꿈을 필드로 지킨다", () => {
    const table = parseCsv('이름,비고\n"김,동혁","두 줄\n주석"\n');
    expect(table).toEqual([["이름", "비고"], ["김,동혁", "두 줄\n주석"]]);
  });

  it('두 겹 따옴표는 따옴표 한 개다', () => {
    expect(parseCsv('a\n"그는 ""안녕"" 했다"\n')).toEqual([["a"], ['그는 "안녕" 했다']]);
  });

  it("빈 줄은 버린다", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("normalizeRows()", () => {
  it("열 순서가 달라도 머리글로 찾아낸다", () => {
    const rows = normalizeRows([
      ["학적", "번호", "반", "학년", "생년월일", "이름"],
      ["재학", "3", "3", "1", "2010-07-28", "김동혁"],
    ]);
    expect(rows[0]).toMatchObject({
      name: "김동혁",
      birthDate: "2010-07-28",
      grade: 1,
      classNo: 3,
      number: 3,
      status: "ENROLLED",
      errors: [],
    });
  });

  it("머리글이 빠지면 그 사실을 첫 줄 오류로 알린다", () => {
    const rows = normalizeRows([["이름", "학년"], ["김동혁", "1"]]);
    expect(rows[0]!.errors.join()).toContain("생년월일");
  });

  it("엑셀이 날짜를 숫자나 슬래시로 바꿔놔도 받아낸다", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2010/7/28", "1", "3", "3", "재학"],
    ]);
    expect(rows[0]!.birthDate).toBe("2010-07-28");
    expect(rows[0]!.errors).toEqual([]);
  });

  it("없는 학적 값은 오류로 잡는다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "휴학"]]);
    expect(rows[0]!.errors.join()).toContain("학적");
  });

  it("재학인데 학년·반·번호가 비면 오류다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "재학"]]);
    expect(rows[0]!.errors.length).toBeGreaterThan(0);
  });

  it("졸업이면 학년·반·번호가 비어도 된다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "졸업"]]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.grade).toBeNull();
  });

  it("줄 번호는 파일 기준이다 — 머리글이 1행이므로 첫 학생은 2행", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "재학"]]);
    expect(rows[0]!.line).toBe(2);
  });

  it("이름이 비면 오류이고, 완전히 빈 줄은 아예 버린다", () => {
    const rows = normalizeRows([
      HEADER,
      ["", "", "", "", "", ""],
      ["", "2010-07-28", "1", "3", "3", "재학"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors.join()).toContain("이름");
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/modules/enrollment/roster.parse.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다.

- [ ] **Step 4: 구현한다**

```ts
// src/modules/enrollment/roster.parse.ts
import { readSheet } from "read-excel-file/node";
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 명단 파일을 정규화된 행으로 옮긴다.
 *
 * CSV와 xlsx가 같은 곳으로 모이도록, 형식별 코드는 `string[][]`를 만드는 데까지만 하고
 * 머리글 해석과 값 검사는 normalizeRows 하나가 맡는다.
 * 순수 함수라 DB 없이 테스트한다 — 분류 규칙 다음으로 자주 바뀔 부분이다.
 */

export const ROSTER_COLUMNS = [
  "이름",
  "생년월일",
  "학년",
  "반",
  "번호",
  "학적",
] as const;

export type RosterRow = {
  /** 파일 기준 줄 번호. 머리글이 1행이므로 첫 학생은 2행이다. */
  line: number;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: EnrollmentStatus | null;
  errors: string[];
};

/** 한글 라벨 → 저장 상수. 파서만 이 방향을 안다. */
const STATUS_BY_LABEL = new Map(
  Object.entries(ENROLLMENT_STATUS_LABELS).map(([k, v]) => [v, k as EnrollmentStatus]),
);

/**
 * CSV를 표로 만든다.
 *
 * 라이브러리를 쓰지 않는다 — 필요한 건 따옴표·BOM·CRLF 처리뿐이고,
 * 그건 아래 40줄이면 된다. 의존성을 하나 줄이는 편이 낫다.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // 전부 빈 칸인 줄은 버린다 — 엑셀이 끝에 빈 줄을 잘 남긴다.
    if (row.some((c) => c.trim() !== "")) table.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) endRow();

  return table;
}

/** 엑셀이 날짜를 어떻게 비틀어 놓든 YYYY-MM-DD로 되돌린다. */
function toDateString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // 엑셀 날짜 일련번호 (1900-01-01 = 1, 1900 윤년 버그 보정 포함)
  if (/^\d{5}$/.test(v)) {
    const ms = (Number(v) - 25569) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

function toInt(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function normalizeRows(table: string[][]): RosterRow[] {
  if (table.length === 0) return [];

  const header = table[0]!.map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  const missing = ROSTER_COLUMNS.filter((c) => at(c) === -1);

  const idx = Object.fromEntries(
    ROSTER_COLUMNS.map((c) => [c, at(c)]),
  ) as Record<(typeof ROSTER_COLUMNS)[number], number>;

  const cell = (r: string[], name: (typeof ROSTER_COLUMNS)[number]) =>
    idx[name] === -1 ? "" : (r[idx[name]] ?? "").trim();

  return table.slice(1).flatMap((raw, i) => {
    // 전부 빈 줄은 파일 끝의 잔여물이다. 오류로 세지 않는다.
    if (raw.every((c) => c.trim() === "")) return [];

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`머리글에 ${missing.join("·")} 열이 없습니다.`);
    }

    const name = cell(raw, "이름");
    if (!name) errors.push("이름이 비어 있습니다.");

    const birthDate = toDateString(cell(raw, "생년월일"));
    if (!birthDate) errors.push("생년월일을 읽을 수 없습니다.");

    const statusLabel = cell(raw, "학적");
    const status = STATUS_BY_LABEL.get(statusLabel) ?? null;
    if (!status) {
      errors.push(
        `학적이 올바르지 않습니다. (${[...STATUS_BY_LABEL.keys()].join("·")} 중 하나)`,
      );
    }

    const grade = toInt(cell(raw, "학년"));
    const classNo = toInt(cell(raw, "반"));
    const number = toInt(cell(raw, "번호"));

    // 반과 번호는 재학일 때만 의미가 있다. 졸업·자퇴 줄에 비어 있는 건 정상이다.
    if (status === "ENROLLED" && (grade === null || classNo === null || number === null)) {
      errors.push("재학이면 학년·반·번호가 모두 있어야 합니다.");
    }

    return [{
      line: i + 2,
      name,
      birthDate: birthDate ?? "",
      grade: status === "ENROLLED" ? grade : null,
      classNo: status === "ENROLLED" ? classNo : null,
      number: status === "ENROLLED" ? number : null,
      status,
      errors,
    }];
  });
}

export async function parseRoster(input: {
  filename: string;
  buffer: Buffer;
}): Promise<RosterRow[]> {
  const isXlsx = /\.xlsx$/i.test(input.filename);

  if (!isXlsx) return normalizeRows(parseCsv(input.buffer.toString("utf8")));

  // 기본 export는 시트를 전부 돌려준다. 첫 시트만 필요하므로 readSheet를 쓴다.
  const rows = await readSheet(input.buffer);
  const table = rows.map((row) =>
    row.map((c) => {
      if (c === null || c === undefined) return "";
      // 엑셀이 날짜 서식이면 Date로 준다. KST 기준으로 잘라야 하루가 밀리지 않는다.
      if (c instanceof Date) {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(c);
      }
      return String(c);
    }),
  );
  return normalizeRows(table);
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/modules/enrollment/roster.parse.test.ts && npm run verify`
Expected: 둘 다 PASS.

`read-excel-file`이 타입 오류를 내면 `node` 진입점 경로(`read-excel-file/node`)와 `readSheet` 이름을 확인한다. 기본 export를 쓰지 마라 — 반환 타입이 다르다.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json src/modules/enrollment/roster.parse.ts tests/modules/enrollment/roster.parse.test.ts
git commit -m "feat(enrollment): 명단 파일을 정규화된 행으로 읽는다

CSV와 xlsx가 같은 곳으로 모이도록, 형식별 코드는 string[][]까지만 만들고
머리글 해석과 값 검사는 한 함수가 맡는다. 순수 함수라 DB 없이 테스트한다.

CSV는 라이브러리를 쓰지 않는다 — 필요한 건 따옴표·BOM·CRLF 처리뿐이라 40줄이면 되고
의존성을 하나 줄이는 편이 낫다. 엑셀이 CSV UTF-8로 저장하면 BOM과 CRLF가 둘 다 붙는다.

날짜는 엑셀이 일련번호나 슬래시로 바꿔놓는 경우까지 되돌린다. Date로 오는 경우는
KST 기준으로 잘라야 하루가 밀리지 않는다."
```

---

### Task 2: 분류

**Files:**
- Create: `src/modules/enrollment/roster.plan.ts`
- Test: `tests/modules/enrollment/roster.plan.test.ts`

**Interfaces:**
- Consumes: `RosterRow` (Task 1)
- Produces:
  - `type ExistingStudent = { studentProfileId: string; userId: string; name: string; birthDate: string; grade: number | null; classNo: number | null; number: number | null; status: string | null }`
  - `type PlannedRow = RosterRow & { studentProfileId: string | null }`
  - `type RosterPlan = { newStudents: PlannedRow[]; reassign: PlannedRow[]; statusChange: PlannedRow[]; needsAttention: (PlannedRow & { reason: string })[]; errorRows: RosterRow[]; missingFromFile: ExistingStudent[]; hasBlockingError: boolean }`
  - `planRoster(rows: RosterRow[], existing: ExistingStudent[]): RosterPlan`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/modules/enrollment/roster.plan.test.ts
import { describe, expect, it } from "vitest";
import { planRoster } from "@/modules/enrollment/roster.plan";
import type { RosterRow } from "@/modules/enrollment/roster.parse";

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    line: 2,
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    errors: [],
    ...over,
  };
}

const 재학생 = {
  studentProfileId: "sp-1",
  userId: "u-1",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
};

describe("planRoster()", () => {
  it("기존 학생과 이름+생년월일로 이어붙인다", () => {
    const plan = planRoster([row({ classNo: 5, number: 7 })], [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(1);
    expect(plan.reassign[0]!.studentProfileId).toBe("sp-1");
  });

  it("바뀐 게 없으면 어느 분류에도 넣지 않는다", () => {
    const plan = planRoster([row()], [재학생]);

    expect(plan.reassign).toHaveLength(0);
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
  });

  it("없던 학생은 신규다 — 초대코드가 나갈 대상", () => {
    const plan = planRoster([row({ name: "새학생" })], [재학생]);

    expect(plan.newStudents).toHaveLength(1);
    expect(plan.newStudents[0]!.studentProfileId).toBeNull();
  });

  it("학적이 바뀌면 재배정이 아니라 학적변동이다", () => {
    const plan = planRoster([row({ status: "GRADUATED", grade: null, classNo: null, number: null })], [재학생]);

    expect(plan.statusChange).toHaveLength(1);
    expect(plan.reassign).toHaveLength(0);
  });

  it("이름과 생년월일이 똑같은 사람이 둘이면 자동으로 잇지 않는다", () => {
    const plan = planRoster([row()], [
      재학생,
      { ...재학생, studentProfileId: "sp-2", userId: "u-2" },
    ]);

    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.reason).toContain("여럿");
    expect(plan.reassign).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
  });

  it("파싱 오류가 있는 줄은 분류하지 않고 확정을 막는다", () => {
    const plan = planRoster([row({ errors: ["생년월일을 읽을 수 없습니다."] })], [재학생]);

    expect(plan.errorRows).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(true);
  });

  it("같은 반에 번호가 겹치면 확정을 막는다", () => {
    const plan = planRoster(
      [row({ name: "가", birthDate: "2010-01-01" }), row({ line: 3, name: "나", birthDate: "2010-01-02" })],
      [],
    );

    expect(plan.hasBlockingError).toBe(true);
    expect(plan.errorRows.some((r) => r.errors.join().includes("번호"))).toBe(true);
  });

  it("같은 학생이 파일에 두 번 나오면 확정을 막는다", () => {
    const plan = planRoster([row(), row({ line: 3, number: 9 })], [재학생]);

    expect(plan.hasBlockingError).toBe(true);
  });

  it("확인 필요가 있으면 확정을 막는다 — 잘못 이으면 남의 상벌점이 붙는다", () => {
    const plan = planRoster([row()], [
      재학생,
      { ...재학생, studentProfileId: "sp-2", userId: "u-2" },
    ]);

    expect(plan.hasBlockingError).toBe(true);
  });

  it("명단에 없는 재학생을 따로 모은다 — 추측하지 않고 관리자에게 보여준다", () => {
    const plan = planRoster([], [재학생]);

    expect(plan.missingFromFile).toHaveLength(1);
    // 경고일 뿐 확정을 막지는 않는다.
    expect(plan.hasBlockingError).toBe(false);
  });

  it("문제가 없으면 확정을 막지 않는다", () => {
    const plan = planRoster([row({ classNo: 5 })], [재학생]);
    expect(plan.hasBlockingError).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/modules/enrollment/roster.plan.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현한다**

```ts
// src/modules/enrollment/roster.plan.ts
import type { RosterRow } from "./roster.parse";

/**
 * 명단 행과 현재 상태를 맞대어 무엇이 바뀔지 가른다.
 *
 * 순수 함수다 — DB를 모른다. 이 기능에서 규칙이 가장 자주 바뀔 곳이라
 * 저장 경로와 떼어 두어야 마음 놓고 고칠 수 있다.
 */

export type ExistingStudent = {
  studentProfileId: string;
  userId: string;
  name: string;
  /** YYYY-MM-DD */
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
};

export type PlannedRow = RosterRow & { studentProfileId: string | null };

export type RosterPlan = {
  newStudents: PlannedRow[];
  reassign: PlannedRow[];
  statusChange: PlannedRow[];
  needsAttention: (PlannedRow & { reason: string })[];
  errorRows: RosterRow[];
  missingFromFile: ExistingStudent[];
  /** 하나라도 있으면 확정 버튼을 막는다. 절반만 반영되는 게 제일 나쁘다. */
  hasBlockingError: boolean;
};

const key = (name: string, birthDate: string) => `${name}|${birthDate}`;

export function planRoster(
  rows: RosterRow[],
  existing: ExistingStudent[],
): RosterPlan {
  const byKey = new Map<string, ExistingStudent[]>();
  for (const s of existing) {
    const k = key(s.name, s.birthDate);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }

  const plan: RosterPlan = {
    newStudents: [],
    reassign: [],
    statusChange: [],
    needsAttention: [],
    errorRows: [],
    missingFromFile: [],
    hasBlockingError: false,
  };

  // 파일 안에서 같은 학생이 두 번 나오거나 한 반에 번호가 겹치는지 먼저 본다.
  // DB 유일 제약에 닿기 전에 사람이 읽을 수 있는 오류로 돌려주기 위해서다.
  const seenPerson = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const dupErrors = new Map<number, string[]>();

  for (const r of rows) {
    if (r.errors.length > 0) continue;

    const pk = key(r.name, r.birthDate);
    const prevPerson = seenPerson.get(pk);
    if (prevPerson !== undefined) {
      dupErrors.set(r.line, [`${prevPerson}행과 같은 학생입니다.`]);
    } else seenPerson.set(pk, r.line);

    if (r.status === "ENROLLED") {
      const sk = `${r.grade}-${r.classNo}-${r.number}`;
      const prevSeat = seenSeat.get(sk);
      if (prevSeat !== undefined) {
        dupErrors.set(r.line, [
          ...(dupErrors.get(r.line) ?? []),
          `${prevSeat}행과 학년·반·번호가 같습니다.`,
        ]);
      } else seenSeat.set(sk, r.line);
    }
  }

  const matchedIds = new Set<string>();

  for (const r of rows) {
    const extra = dupErrors.get(r.line) ?? [];
    if (r.errors.length > 0 || extra.length > 0) {
      plan.errorRows.push({ ...r, errors: [...r.errors, ...extra] });
      continue;
    }

    const candidates = byKey.get(key(r.name, r.birthDate)) ?? [];

    if (candidates.length > 1) {
      // 잘못 이으면 남의 상벌점이 붙는다. 자동으로 정하지 않는다.
      plan.needsAttention.push({
        ...r,
        studentProfileId: null,
        reason: "이름과 생년월일이 같은 학생이 여럿입니다. 직접 지정해야 합니다.",
      });
      continue;
    }

    if (candidates.length === 0) {
      plan.newStudents.push({ ...r, studentProfileId: null });
      continue;
    }

    const before = candidates[0]!;
    matchedIds.add(before.studentProfileId);
    const planned: PlannedRow = { ...r, studentProfileId: before.studentProfileId };

    if (before.status !== r.status) {
      plan.statusChange.push(planned);
    } else if (
      before.grade !== r.grade ||
      before.classNo !== r.classNo ||
      before.number !== r.number
    ) {
      plan.reassign.push(planned);
    }
    // 셋 다 같으면 아무 분류에도 넣지 않는다 — 바뀔 게 없다.
  }

  // 명단에 없는 재학생. 졸업인지 전출인지 파일만으로는 모르므로 추측하지 않고 보여준다.
  plan.missingFromFile = existing.filter(
    (s) => s.status === "ENROLLED" && !matchedIds.has(s.studentProfileId),
  );

  plan.hasBlockingError =
    plan.errorRows.length > 0 || plan.needsAttention.length > 0;

  return plan;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/modules/enrollment/roster.plan.test.ts && npm run verify`
Expected: 둘 다 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/modules/enrollment/roster.plan.ts tests/modules/enrollment/roster.plan.test.ts
git commit -m "feat(enrollment): 명단을 현재 상태와 맞대어 분류한다

신규·재배정·학적변동·확인필요·오류 다섯으로 가른다. 순수 함수라 DB를 모른다 —
규칙이 가장 자주 바뀔 곳이라 저장 경로와 떼어 두어야 마음 놓고 고칠 수 있다.

이름+생년월일이 여럿과 겹치면 자동으로 잇지 않는다. 잘못 이으면 남의 상벌점이 붙는다.
파일 안의 중복(같은 학생 두 줄, 한 반 같은 번호)도 DB 제약에 닿기 전에 잡아
몇 행이 문제인지 알려준다.

명단에 없는 재학생은 추측하지 않고 따로 모아 보여준다. 경고일 뿐 확정을 막지는 않는다."
```

---

### Task 3: 확정 반영

**Files:**
- Create: `src/modules/enrollment/roster.repo.ts`, `roster.service.ts`
- Test: `tests/modules/enrollment/roster.service.test.ts`
- Modify: `src/core/db/unique-violation.ts`, `src/modules/enrollment/enrollment.repo.ts`, `src/modules/admin-users/admin-user.repo.ts`

**Interfaces:**
- Consumes: `parseRoster`, `planRoster`, `getCurrentYear()`, `generateInviteCode()` from `@/lib/invite-code`
- Produces:
  - repo: `listExisting(year)`, `applyRoster(year, input)`
  - service: `previewRoster(actor, file)`, `applyRosterPlan(actor, expectedYear, rows)`, `class RosterError extends Error`

- [ ] **Step 1: `NumberTakenError`를 공용으로 옮긴다**

지금 `enrollment.repo.ts`와 `admin-user.repo.ts`에 같은 이름의 **별개 클래스**가 있다. 명단 반영이 두 경로를 다 쓰게 되므로 `instanceof`가 모듈을 건너 통해야 한다.

`src/core/db/unique-violation.ts`로 옮기고 두 repo가 **re-export**하게 한다 (기존 import 경로를 깨지 않기 위해서다).

```ts
// src/core/db/unique-violation.ts 맨 아래에 추가
/**
 * 한 반에 같은 번호가 이미 있을 때.
 *
 * 소속을 쓰는 경로가 셋(사용자 상세·학생 표·명단 반영)이라 여기 둔다.
 * 모듈마다 같은 이름의 별개 클래스를 두면 instanceof가 모듈을 건너 통하지 않아
 * 조용히 새는 자리가 된다.
 */
export class NumberTakenError extends Error {}
```

두 repo에서 `export class NumberTakenError extends Error {}` 정의를 지우고 아래로 바꾼다.

```ts
export { NumberTakenError } from "@/core/db/unique-violation";
```

`npm run verify`로 기존 테스트가 그대로 통과하는지 확인한다. 실패하면 목에서 만든 별개 클래스와 실물이 갈린 것이다 — 테스트가 `@/core/db/unique-violation`의 것을 쓰게 고친다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
// tests/modules/enrollment/roster.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listExisting = vi.fn();
const applyRoster = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/enrollment/roster.repo", () => ({ listExisting, applyRoster }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const { RosterError, applyRosterPlan } = await import(
  "@/modules/enrollment/roster.service"
);

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return { id, name: "테스트", email: "t@gbsw.hs.kr", role, status: "ACTIVE", mustChangePassword: false };
}
const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

const 재학생 = {
  studentProfileId: "sp-1",
  userId: "u-1",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
};

const row = {
  line: 2,
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 5,
  number: 7,
  status: "ENROLLED" as const,
  errors: [],
};

beforeEach(() => {
  listExisting.mockReset().mockResolvedValue([재학생]);
  applyRoster.mockReset().mockResolvedValue({ invites: [] });
  recordAudit.mockReset();
});

describe("applyRosterPlan()", () => {
  it("관리자가 아니면 반영하지 못한다", async () => {
    await expect(applyRosterPlan(student, 2026, [row])).rejects.toThrow("FORBIDDEN");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("학년도가 그 사이 바뀌었으면 거부한다", async () => {
    await expect(applyRosterPlan(admin, 2025, [row])).rejects.toThrow("YEAR_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("확정을 막아야 하는 명단이면 아무것도 쓰지 않는다", async () => {
    const bad = { ...row, errors: ["생년월일을 읽을 수 없습니다."] };

    await expect(applyRosterPlan(admin, 2026, [bad])).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("클라이언트가 보낸 행을 다시 분류한다 — 미리보기 결과를 믿지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row]);

    // 미리보기 때와 같은 현재 상태를 서버가 다시 읽어야 한다.
    expect(listExisting).toHaveBeenCalledWith(2026);
  });

  it("반영하고 요약을 감사로그에 남긴다 — 값이 아니라 건수만", async () => {
    await applyRosterPlan(admin, 2026, [row]);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:import");
    expect(audit.metadata).toMatchObject({ year: 2026, reassign: 1 });
    // 학생 이름이 로그에 남으면 감사로그가 개인정보 사본이 된다.
    expect(JSON.stringify(audit)).not.toContain("김동혁");
  });

  it("신규 학생 수만큼 초대코드를 만들어 돌려준다", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockResolvedValue({
      invites: [{ name: "김동혁", code: "GBSW1234ABCD", grade: 1, classNo: 5, number: 7 }],
    });

    const result = await applyRosterPlan(admin, 2026, [row]);

    expect(result.invites).toHaveLength(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);
  });
});
```

- [ ] **Step 3: repo를 만든다**

```ts
// src/modules/enrollment/roster.repo.ts
import { prisma } from "@/core/db/client";
import type { PlannedRow } from "./roster.plan";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function listExisting(year: number) {
  const profiles = await prisma.studentProfile.findMany({
    where: { user: { role: "STUDENT" } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          status: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });

  return profiles.map((p) => {
    const e = p.enrollments[0];
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      name: p.user.name,
      // 파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다.
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
    };
  });
}

export type ApplyInput = {
  /** 기존 학생의 그 학년도 배정 (신규 제외) */
  assignments: PlannedRow[];
  /** 초대코드를 만들 신규 학생 */
  newStudents: { row: PlannedRow; code: string }[];
  createdById: string;
};

/**
 * 명단을 반영한다.
 *
 * **그 학년도 배정을 전부 지우고 새로 넣는다.** 번호 교환(3↔4)이나 일괄 재번호는
 * 갱신으로는 성립하지 않는다 — Postgres 유일 제약은 DEFERRABLE이 아니면 문장 단위로
 * 검사하므로, 한 트랜잭션 안이라도 중간 상태에서 걸린다. 지우고 넣으면 그 창이 없다.
 *
 * 명단에 없던 학생의 그 학년도 배정도 함께 사라진다. 미리보기가 그걸 경고로 보여준 뒤다.
 */
export async function applyRoster(year: number, input: ApplyInput) {
  return prisma.$transaction(
    async (tx) => {
      await tx.enrollment.deleteMany({ where: { year } });

      for (const row of input.assignments) {
        let classId: string | null = null;
        if (row.grade !== null && row.classNo !== null) {
          const cls = await tx.schoolClass.upsert({
            where: {
              year_grade_classNo: { year, grade: row.grade, classNo: row.classNo },
            },
            create: { year, grade: row.grade, classNo: row.classNo },
            update: {},
          });
          classId = cls.id;
        }

        await tx.enrollment.create({
          data: {
            studentProfileId: row.studentProfileId!,
            year,
            classId,
            number: row.number,
            status: row.status!,
          },
        });
      }

      // 계정 상태를 학적에 맞춘다. 비활성으로 넘어가는 계정은 세션도 끊는다.
      const inactive = input.assignments
        .filter((r) => r.status !== "ENROLLED")
        .map((r) => r.studentProfileId!);
      const active = input.assignments
        .filter((r) => r.status === "ENROLLED")
        .map((r) => r.studentProfileId!);

      if (inactive.length > 0) {
        const users = await tx.studentProfile.findMany({
          where: { id: { in: inactive } },
          select: { userId: true },
        });
        const ids = users.map((u) => u.userId);
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { status: "INACTIVE" } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
      }
      if (active.length > 0) {
        const users = await tx.studentProfile.findMany({
          where: { id: { in: active } },
          select: { userId: true },
        });
        await tx.user.updateMany({
          where: { id: { in: users.map((u) => u.userId) } },
          data: { status: "ACTIVE" },
        });
      }

      const invites: {
        name: string;
        code: string;
        grade: number | null;
        classNo: number | null;
        number: number | null;
      }[] = [];

      for (const { row, code } of input.newStudents) {
        await tx.invite.create({
          data: {
            code,
            role: "STUDENT",
            status: "PENDING",
            createdById: input.createdById,
            // 가입 때 2차 요소로 대조하는 값이다. 기존 발급 경로와 같은 모양이어야 한다.
            metadata: {
              name: row.name,
              birthDate: row.birthDate,
              grade: row.grade,
              classNo: row.classNo,
              number: row.number,
            },
          },
        });
        invites.push({
          name: row.name,
          code,
          grade: row.grade,
          classNo: row.classNo,
          number: row.number,
        });
      }

      return { invites };
    },
    // 전교생 규모 × 학생당 두어 문장. 기본 5초로는 부족하다.
    { timeout: 120_000, maxWait: 10_000 },
  );
}
```

- [ ] **Step 4: service를 만든다**

```ts
// src/modules/enrollment/roster.service.ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { generateInviteCode } from "@/lib/invite-code";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { parseRoster, type RosterRow } from "./roster.parse";
import { planRoster, type RosterPlan } from "./roster.plan";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

function assertMayImport(actor: SessionUser) {
  // 소속을 바꾸고 초대코드도 만든다. 둘 다 확인한다.
  if (!can(actor, "student:manage") || !can(actor, "invite:create")) {
    throw new Error("FORBIDDEN");
  }
}

/** 미리보기. **아무것도 저장하지 않는다.** */
export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{ year: number; rows: RosterRow[]; plan: RosterPlan }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  const rows = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const plan = planRoster(rows, await repo.listExisting(year));
  return { year, rows, plan };
}

/**
 * 확정 반영.
 *
 * 클라이언트가 돌려보낸 행을 **서버가 다시 분류한다.** 미리보기 결과를 그대로 믿으면
 * 중간에 손댄 값이 그대로 들어가고, 그 사이 DB가 바뀌었을 수도 있다.
 */
export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
): Promise<{ saved: number; invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"] }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  if (year !== expectedYear) throw new RosterError("YEAR_CHANGED");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  if (plan.hasBlockingError) throw new RosterError("BLOCKED");

  // 지우고 새로 넣으므로, 바뀌지 않은 학생의 배정도 다시 만들어야 한다.
  const untouched = existing
    .filter(
      (s) =>
        s.status !== null &&
        !plan.reassign.some((r) => r.studentProfileId === s.studentProfileId) &&
        !plan.statusChange.some((r) => r.studentProfileId === s.studentProfileId) &&
        !plan.missingFromFile.some((m) => m.studentProfileId === s.studentProfileId),
    )
    .map((s) => ({
      line: 0,
      name: s.name,
      birthDate: s.birthDate,
      grade: s.grade,
      classNo: s.classNo,
      number: s.number,
      status: s.status as RosterRow["status"],
      errors: [],
      studentProfileId: s.studentProfileId,
    }));

  const assignments = [...plan.reassign, ...plan.statusChange, ...untouched];
  const newStudents = plan.newStudents.map((row) => ({
    row,
    code: generateInviteCode(),
  }));

  const { invites } = await repo.applyRoster(year, {
    assignments,
    newStudents,
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "enrollment:import",
    targetType: "AcademicYear",
    targetId: String(year),
    // 건수만 남긴다. 학생 이름·소속이 들어가면 감사로그가 명단 사본이 된다.
    metadata: {
      year,
      reassign: plan.reassign.length,
      statusChange: plan.statusChange.length,
      newStudents: plan.newStudents.length,
      removed: plan.missingFromFile.length,
    },
  });

  return { saved: assignments.length, invites };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/modules/enrollment && npm run verify`
Expected: 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/core/db/unique-violation.ts src/modules/enrollment src/modules/admin-users/admin-user.repo.ts tests/modules/enrollment
git commit -m "feat(enrollment): 명단 확정 반영과 초대코드 일괄 발급

그 학년도 배정을 전부 지우고 새로 넣는다. 번호 교환이나 일괄 재번호는 갱신으로는
성립하지 않는다 — 유일 제약이 문장 단위로 검사되므로 한 트랜잭션 안이라도 중간
상태에서 걸린다. 지우고 넣으면 그 창이 없다.

클라이언트가 돌려보낸 행을 서버가 다시 분류한다. 미리보기 결과를 그대로 믿으면
중간에 손댄 값이 들어가고, 그 사이 DB가 바뀌었을 수도 있다. 학년도도 함께 받아
렌더와 확정 사이에 넘어갔으면 거부한다.

감사로그에는 건수만 남긴다. 학생 이름과 소속이 들어가면 감사로그가 명단 사본이 된다.

NumberTakenError를 core/db로 옮겼다. 소속을 쓰는 경로가 셋이 되면서, 모듈마다 같은
이름의 별개 클래스를 두면 instanceof가 모듈을 건너 통하지 않아 조용히 새는 자리가 된다."
```

---

### Task 4: 업로드 화면

**Files:**
- Create: `src/app/(app)/admin/students/import/{page.tsx,import-form.tsx,actions.ts,action-state.ts}`
- Modify: `src/app/(app)/admin/students/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `previewRoster`, `applyRosterPlan`, `RosterError`
- Produces: 없음

- [ ] **Step 1: 상태 타입**

```ts
// src/app/(app)/admin/students/import/action-state.ts
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

/*
 * `"use server"` 모듈은 async 함수만 내보낼 수 있다.
 * 상수를 거기 두면 클라이언트에서 undefined로 들어와 useActionState가 빈 상태로 시작한다.
 */
export type PreviewState = {
  error: string | null;
  year: number | null;
  rows: RosterRow[];
  plan: RosterPlan | null;
};

export const PREVIEW_INITIAL: PreviewState = {
  error: null,
  year: null,
  rows: [],
  plan: null,
};

export type ApplyState = {
  error: string | null;
  saved: number | null;
  invites: { name: string; code: string; grade: number | null; classNo: number | null; number: number | null }[];
};

export const APPLY_INITIAL: ApplyState = { error: null, saved: null, invites: [] };
```

- [ ] **Step 2: 서버 액션**

```ts
// src/app/(app)/admin/students/import/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import {
  applyRosterPlan,
  previewRoster,
  RosterError,
} from "@/modules/enrollment/roster.service";
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
};

/** 파일 크기 상한. 전교생 300명이면 수십 KB면 충분하다. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function previewRosterAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const actor = await requireAuth();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택해 주세요.", year: null, rows: [], plan: null };
  }
  if (file.size > MAX_BYTES) {
    return { error: "파일이 너무 큽니다.", year: null, rows: [], plan: null };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { year, rows, plan } = await previewRoster(actor, {
      filename: file.name,
      buffer,
    });
    return { error: null, year, rows, plan };
  } catch (error) {
    if (error instanceof RosterError) {
      return {
        error: MESSAGES[error.message] ?? "파일을 읽지 못했습니다.",
        year: null,
        rows: [],
        plan: null,
      };
    }
    return { error: "파일을 읽지 못했습니다.", year: null, rows: [], plan: null };
  }
}

export async function applyRosterAction(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const actor = await requireAuth();

  let rows: RosterRow[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "반영할 내용을 읽지 못했습니다.", saved: null, invites: [] };
  }
  const year = Number(formData.get("year"));

  try {
    const { saved, invites } = await applyRosterPlan(actor, year, rows);
    revalidatePath("/admin/students");
    return { error: null, saved, invites };
  } catch (error) {
    if (error instanceof RosterError) {
      return { error: MESSAGES[error.message] ?? "반영하지 못했습니다.", saved: null, invites: [] };
    }
    return { error: "반영하지 못했습니다.", saved: null, invites: [] };
  }
}
```

- [ ] **Step 3: 화면**

`page.tsx`는 `requirePermission("student:manage")`만 하고 클라이언트 폼을 렌더한다. `import-form.tsx`가 두 단계를 들고 있다.

요구사항:
- **1단계**: `<input type="file" accept=".csv,.xlsx">` + "미리보기" 버튼. 서식 파일 내려받기 링크(아래 Step 4).
- **2단계**: 미리보기 결과를 다섯 묶음으로 보여준다. 각 묶음은 접었다 펼 수 있고, 머리에 건수를 쓴다.
  - 오류 / 확인 필요는 **빨간 계열**(`rose`·`rose-soft`), 줄 번호와 사유를 함께.
  - 신규 / 재배정 / 학적변동은 중립.
  - 명단에 없는 재학생은 **경고 계열**(`amber-soft`·`amber-ink`)로, "이 학생들의 올해 배정이 사라집니다"라고 분명히 적는다.
- `plan.hasBlockingError`가 true면 **확정 버튼을 `disabled`** 로 두고, 왜 막혔는지 한 줄 쓴다.
- 확정 폼은 `rows`(JSON)와 `year`를 hidden으로 싣는다.
- 확정 성공 후 **초대코드 목록**을 표로 보여주고 "코드 목록 CSV 받기" 버튼을 둔다. 코드는 이 화면을 벗어나면 다시 모아볼 수 없다는 안내를 함께 적는다.
- CSV 다운로드는 서버를 거치지 않는다. 클라이언트에서 문자열을 만들어 `Blob` + `URL.createObjectURL`로 내려받는다. **BOM(`﻿`)을 앞에 붙여라** — 없으면 엑셀에서 한글이 깨진다.

기존 화면의 규격을 그대로 따른다: 카드는 `rounded-card border border-line bg-surface`, 표는 `src/app/(app)/admin/students/student-table.tsx`와 같은 머리글·행 클래스. **새 색을 만들지 마라.**

- [ ] **Step 4: 서식 파일 내려받기**

별도 라우트를 만들지 말고 클라이언트에서 만든다. 머리글 한 줄과 예시 한 줄, 그리고 학적 선택지를 주석처럼 넣지 말고 **예시 행으로** 보여준다.

```ts
const TEMPLATE = [
  ["이름", "생년월일", "학년", "반", "번호", "학적"],
  ["김example", "2010-03-05", "1", "3", "1", "재학"],
  ["이example", "2008-11-20", "", "", "", "졸업"],
];
```

내려받을 때 BOM을 붙이고 파일명은 `학생명단서식.csv`로 한다.

- [ ] **Step 5: 학생 관리 화면에 링크**

`src/app/(app)/admin/students/page.tsx`의 `YearSwitcher` 아래(또는 헤더 옆)에 `/admin/students/import`로 가는 링크를 하나 둔다. 라벨은 "명단 올리기".

- [ ] **Step 6: 검증**

Run: `npm run verify && npm run build`
Expected: 둘 다 통과, lint 경고 0.

- [ ] **Step 7: 화면에서 직접 확인한다**

`npm run dev` 후 관리자로 `/admin/students/import`에 들어가 아래를 확인한다. 로그인이 어려우면 서비스 함수를 직접 호출해 확인하고 무엇으로 했는지 보고서에 적는다.

CSV 파일을 손으로 만들어 쓴다 (김동혁은 실제 계정이므로 **생년월일 2010-07-28을 정확히** 넣어야 재배정으로 잡힌다).

| 확인 | 기대 |
|---|---|
| 서식 파일을 받아 엑셀에서 열면 한글이 안 깨진다 | BOM |
| 김동혁 1/3/3 재학만 있는 파일 → 미리보기 | 어느 분류에도 안 들어감, 확정 가능 |
| 김동혁 1/5/7 재학 → 미리보기 | 재배정 1건 |
| 없는 이름 한 줄 추가 → 미리보기 | 신규 1건 |
| 학적을 `휴학`으로 → 미리보기 | 오류 1건, **확정 버튼 비활성** |
| 같은 반 같은 번호 두 줄 → 미리보기 | 오류, 몇 행끼리 겹치는지 표시 |
| 김동혁을 뺀 파일 → 미리보기 | "명단에 없는 재학생" 경고에 김동혁 |
| 신규 1명 포함해 확정 | 초대코드 1개가 표에 뜨고 CSV로 받아진다 |
| 확정 후 `/admin/students` | 소속이 파일대로 바뀌어 있다 |

**확인이 끝나면 원래 상태로 되돌려라**: 김동혁을 1학년 3반 3번·재학·계정 활성으로, 확인 중 만들어진 **초대코드와 빈 SchoolClass 행은 지운다**. 사용자의 실제 데이터(계정 2개)는 절대 지우지 마라.

- [ ] **Step 8: DB 확인**

Run:
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"select u.email,u.status,e.year,e.status,sc.grade,sc.\"classNo\",e.number
 from \"Enrollment\" e join \"StudentProfile\" sp on sp.id=e.\"studentProfileId\"
 join \"user\" u on u.id=sp.\"userId\" left join \"SchoolClass\" sc on sc.id=e.\"classId\";
 select count(*) as invites from \"Invite\";
 select count(*) as classes from \"SchoolClass\";"
```
Expected: 김동혁 1행 · ACTIVE · 2026 · ENROLLED · 1 · 3 · 3. 확인용으로 만든 초대코드와 학급은 남아 있지 않아야 한다.

- [ ] **Step 9: 커밋**

```bash
git add "src/app/(app)/admin/students"
git commit -m "feat(admin): 명단 파일 업로드와 미리보기

확정 전에 무엇이 바뀔지 다섯 묶음으로 보여준다. 오류나 확인 필요가 하나라도 있으면
확정을 막는다 — 300명 명단이 절반만 반영되는 게 제일 나쁘다.

명단에 없는 재학생은 경고로 따로 보여준다. 확정하면 그 학생들의 올해 배정이 사라지므로
그 사실을 화면에 분명히 적는다.

CSV 내려받기에 BOM을 붙인다. 없으면 엑셀에서 한글이 깨진다."
```

---

## Self-Review

**스펙 대조**

| 스펙 절 | 태스크 |
|---|---|
| 파일 형식 (CSV·xlsx, `read-excel-file`) | Task 1 |
| 서식 파일 제공 | Task 4 Step 4 |
| 학생 매칭 (이름+생년월일, 모호하면 확인 필요) | Task 2 |
| 미리보기 다섯 분류 | Task 2·4 |
| 오류 있으면 확정 차단 | Task 2 (`hasBlockingError`) · Task 3 (`BLOCKED`) · Task 4 (버튼) |
| 확정은 트랜잭션·지우고 새로 넣기 | Task 3 |
| 명단에서 빠진 학생 경고 | Task 2 (`missingFromFile`) · Task 4 |
| 신규 학생 초대코드 일괄 발급 + 목록 CSV | Task 3·4 |
| 2단계 이월: `NumberTakenError` 통합 | Task 3 Step 1 |
| 2단계 이월: 번호 교환 불가 | Task 3 (지우고 새로 넣기로 해소) |

**미해결로 남기는 것**

- **`setCurrentYear`의 감사 `from` TOCTOU.** 1·2단계에서 두 번 미뤘고 이번에도 넣지 않는다.
  영향은 감사로그 값 하나이고 데이터 무결성은 부분 유니크 인덱스가 지킨다. 이 계획이
  건드리는 파일과 겹치지도 않는다. **설계서의 이월 목록에 남겨 둔다.**
- **"확인 필요"를 화면에서 직접 지정하는 기능은 넣지 않는다.** 지금은 확정을 막기만 한다.
  동명이인이 실제로 나오면 관리자가 파일을 고치거나 표에서 손으로 처리하면 된다.
  자동 매칭 UI는 실제로 필요해진 뒤에 만든다 (YAGNI).

**확인한 API** — `read-excel-file@9.3.10`의 기본 export는 `Promise<{sheet,data}[]>`(전 시트)이고,
첫 시트의 `Row[]`가 필요하면 `readSheet(input)`이다. Task 1이 후자를 쓴다.
