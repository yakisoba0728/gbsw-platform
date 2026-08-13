# 학생 표 직접 편집 구현 계획 (2단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/students`에서 학생의 반·번호·학적을 표에서 직접 고치고 한 번에 저장한다. 학년도를 화면에서 전환할 수 있게 한다.

**Architecture:** 새 `enrollment` 모듈이 학년도별 소속 조회와 일괄 수정을 맡는다. 표는 클라이언트에서 변경분을 모았다가 한 번에 서버 액션으로 보낸다. 저장은 한 트랜잭션에서 소속과 계정 상태를 함께 바꾸고, 감사로그는 학생 1명당 1줄에 배치 식별자를 달아 묶어 본다.

**Tech Stack:** Prisma 7.9 + `@prisma/adapter-pg`, PostgreSQL 18, Next.js 16 App Router (Server Actions), zod 4, vitest 4, Tailwind v4.

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`
- 계층: `Route/Server Action → Service → Repo`. **repo에는 Prisma 호출만.** 페이지·서버액션에 업무 로직을 두지 않는다.
- 학년도는 **service가** `getCurrentYear()`로 읽어 repo에 인자로 넘긴다. repo가 다른 모듈의 service를 부르면 안 된다.
- `can()`은 service 안에서도 호출한다. 이 모듈의 액션은 **`student:manage`** 다 (새 액션을 만들지 않는다 — 1단계에서 이 액션을 소속 관리용으로 쓰기로 정했다).
- 모든 생성/수정/삭제는 `recordAudit()`. **감사로그에는 값이 아니라 바뀐 항목 이름만.**
- zod 검증은 경계(서버 액션)에서 한 번만. service는 타입이 맞는 입력을 신뢰한다.
- 학적 상수는 `src/core/authz/enrollment-status.ts`에 이미 있다. 새로 만들지 마라.
- 날짜 파싱은 `src/lib/datetime.ts`의 `parseDateInputKst`/`formatDateInput`만 쓴다.
- 각 태스크 끝에 `npm run verify`가 통과해야 한다. 마지막 태스크는 `npm run build`도.
- 주석·커밋 메시지는 한국어로, "왜"를 적는다.

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `src/components/ui/select.tsx` | 시안 규격 드롭다운. `Input`과 같은 API(`dense`, `className`) |
| `src/modules/enrollment/enrollment.schema.ts` | 일괄 저장 입력 zod |
| `src/modules/enrollment/enrollment.repo.ts` | Prisma 호출만 |
| `src/modules/enrollment/enrollment.service.ts` | 권한·검증·계정 상태 연동·감사로그 |
| `src/app/(app)/admin/students/page.tsx` | 서버 컴포넌트. 조회 후 표에 넘김 |
| `src/app/(app)/admin/students/student-table.tsx` | 클라이언트. 필터 + 인라인 편집 + 일괄 저장 |
| `src/app/(app)/admin/students/actions.ts` | 얇은 서버 액션 |
| `src/app/(app)/admin/students/action-state.ts` | 상태 타입·초기값 (`"use server"` 모듈은 async 함수만 export 가능) |
| `src/app/(app)/admin/students/year-switcher.tsx` | 학년도 전환·생성 (클라이언트) |
| `tests/modules/enrollment/enrollment.service.test.ts` | 권한·검증·상태연동·감사로그 |

**수정**

| 파일 | 무엇을 |
|---|---|
| `src/components/app-shell/nav.ts` | `ADMIN_NAV_ITEMS`에 "학생 관리" 한 줄 |
| `src/modules/admin-users/admin-user.repo.ts` | `updateEnrollment`의 upsert가 `status`를 `ENROLLED`로 되돌리게 |

---

### Task 1: enrollment 모듈

**Files:**
- Create: `src/modules/enrollment/enrollment.schema.ts`, `enrollment.repo.ts`, `enrollment.service.ts`
- Test: `tests/modules/enrollment/enrollment.service.test.ts`

**Interfaces:**
- Consumes: `can()`, `recordAudit()`, `getCurrentYear()` from `@/modules/academic-year/academic-year.service`, `ENROLLMENT_STATUSES`·`keepsAccountActive` from `@/core/authz/enrollment-status`
- Produces:
  - schema: `saveEnrollmentsSchema` (zod), `type EnrollmentChange = { studentProfileId: string; grade: number | null; classNo: number | null; number: number | null; status: EnrollmentStatus }`
  - repo: `listByYear(year)`, `applyChange(year, change, active)`, `class NumberTakenError extends Error`
  - service: `listStudents(actor)`, `saveEnrollments(actor, changes)`, `class EnrollmentError extends Error`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/modules/enrollment/enrollment.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listByYear = vi.fn();
const applyChange = vi.fn();
const recordAudit = vi.fn();

class NumberTakenError extends Error {}

vi.mock("@/modules/enrollment/enrollment.repo", () => ({
  NumberTakenError,
  listByYear,
  applyChange,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const { EnrollmentError, listStudents, saveEnrollments } = await import(
  "@/modules/enrollment/enrollment.service"
);

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

/** 현재 상태: 1학년 3반 3번, 재학 */
function current(overrides: Record<string, unknown> = {}) {
  return {
    studentProfileId: "sp-1",
    userId: "u-1",
    name: "김동혁",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    ...overrides,
  };
}

const unchanged = {
  studentProfileId: "sp-1",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED" as const,
};

beforeEach(() => {
  listByYear.mockReset().mockResolvedValue([current()]);
  applyChange.mockReset();
  recordAudit.mockReset();
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listStudents(student)).rejects.toThrow("FORBIDDEN");
    await expect(saveEnrollments(student, [unchanged])).rejects.toThrow("FORBIDDEN");
    expect(applyChange).not.toHaveBeenCalled();
  });
});

describe("saveEnrollments()", () => {
  it("바뀐 게 없으면 저장도 기록도 하지 않는다", async () => {
    const { saved } = await saveEnrollments(admin, [unchanged]);

    expect(saved).toBe(0);
    expect(applyChange).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("바뀐 학생만 저장한다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
    ]);

    const { saved } = await saveEnrollments(admin, [
      unchanged,
      { ...unchanged, studentProfileId: "sp-2", number: 9 },
    ]);

    expect(saved).toBe(1);
    expect(applyChange).toHaveBeenCalledTimes(1);
    expect(applyChange.mock.calls[0]![1].studentProfileId).toBe("sp-2");
  });

  it("학생 1명당 감사로그 1줄이고, 값이 아니라 항목 이름만 남긴다", async () => {
    await saveEnrollments(admin, [{ ...unchanged, classNo: 5 }]);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:update");
    expect(audit.targetId).toBe("sp-1");
    expect(audit.metadata.changed).toEqual(["classNo"]);
    // 새 반 번호(5)가 값으로 남으면 안 된다.
    expect(audit.metadata.classNo).toBeUndefined();
  });

  it("같은 저장에 속한 줄들은 같은 배치 식별자를 단다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", number: 4 }),
    ]);

    await saveEnrollments(admin, [
      { ...unchanged, number: 7 },
      { ...unchanged, studentProfileId: "sp-2", number: 8 },
    ]);

    const [a, b] = recordAudit.mock.calls.map((c) => c[0].metadata.batch);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("재학이면 반·번호가 있어야 한다", async () => {
    await expect(
      saveEnrollments(admin, [{ ...unchanged, classNo: null }]),
    ).rejects.toThrow("INCOMPLETE_ENROLLED");
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("재학이 아니면 반·번호를 지운다 — 졸업생에게 반은 의미가 없다", async () => {
    await saveEnrollments(admin, [
      { ...unchanged, status: "GRADUATED", grade: 1, classNo: 3, number: 3 },
    ]);

    const change = applyChange.mock.calls[0]![1];
    expect(change.grade).toBeNull();
    expect(change.classNo).toBeNull();
    expect(change.number).toBeNull();
  });

  it("재학이 아니게 되면 계정을 비활성으로 넘긴다", async () => {
    await saveEnrollments(admin, [{ ...unchanged, status: "WITHDRAWN" }]);

    expect(applyChange.mock.calls[0]![2]).toBe(false);
  });

  it("다시 재학이 되면 계정을 되살린다", async () => {
    listByYear.mockResolvedValue([current({ status: "DEFERRED" })]);

    await saveEnrollments(admin, [unchanged]);

    expect(applyChange.mock.calls[0]![2]).toBe(true);
  });

  it("같은 반 번호가 겹치면 우리 오류로 옮긴다", async () => {
    applyChange.mockRejectedValue(new NumberTakenError());

    await expect(
      saveEnrollments(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow("NUMBER_TAKEN");
  });

  it("명단에 없는 학생을 보내면 거부한다 — 클라이언트가 지어낸 id일 수 있다", async () => {
    await expect(
      saveEnrollments(admin, [{ ...unchanged, studentProfileId: "없음" }]),
    ).rejects.toThrow("UNKNOWN_STUDENT");
    expect(applyChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/modules/enrollment`
Expected: FAIL — `Failed to resolve import "@/modules/enrollment/enrollment.service"`

- [ ] **Step 3: schema를 만든다**

```ts
// src/modules/enrollment/enrollment.schema.ts
import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";

/**
 * 표에서 고친 줄들. 바뀌지 않은 줄이 섞여 와도 되며, 서비스가 걸러낸다.
 *
 * 반·번호가 null인 것은 "재학이 아니라 비운다"는 뜻이다.
 * 재학인데 비어 있으면 서비스가 거부한다 — 그건 업무 규칙이라 여기서 보지 않는다.
 */
export const enrollmentChangeSchema = z.object({
  studentProfileId: z.string().min(1),
  grade: z.coerce.number().int().min(1).max(3).nullable(),
  classNo: z.coerce.number().int().min(1).max(20).nullable(),
  number: z.coerce.number().int().min(1).max(50).nullable(),
  status: z.enum(ENROLLMENT_STATUSES),
});

export const saveEnrollmentsSchema = z.object({
  changes: z.array(enrollmentChangeSchema).min(1, "바뀐 내용이 없습니다.").max(500),
});

export type EnrollmentChange = z.infer<typeof enrollmentChangeSchema>;
```

- [ ] **Step 4: repo를 만든다**

```ts
// src/modules/enrollment/enrollment.repo.ts
import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 한 반에 같은 번호가 이미 있을 때. (admin-user.repo의 같은 이름과 짝을 이룬다) */
export class NumberTakenError extends Error {}

/**
 * 그 학년도의 학생 전원. 소속이 아직 없는 학생도 포함한다 —
 * 학년도가 막 넘어가면 전원이 배정 없는 상태이고, 그때 이 화면에서 채워야 한다.
 */
export async function listByYear(year: number) {
  const profiles = await prisma.studentProfile.findMany({
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true, email: true, status: true } },
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
      email: p.user.email,
      birthDate: p.birthDate,
      accountActive: p.user.status === "ACTIVE",
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      // 배정이 없으면 아직 아무 학적도 아니다. 화면에서 재학으로 채우게 둔다.
      status: e?.status ?? null,
    };
  });
}

/**
 * 한 학생의 소속·학적과 계정 상태를 **한 트랜잭션에서** 바꾼다.
 *
 * 둘을 따로 쓰면 학적만 졸업으로 바뀌고 계정은 활성인 상태가 남을 수 있다.
 */
export async function applyChange(
  year: number,
  change: EnrollmentChange & { userId: string },
  accountActive: boolean,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      let classId: string | null = null;

      if (change.grade !== null && change.classNo !== null) {
        const schoolClass = await tx.schoolClass.upsert({
          where: {
            year_grade_classNo: {
              year,
              grade: change.grade,
              classNo: change.classNo,
            },
          },
          create: { year, grade: change.grade, classNo: change.classNo },
          update: {},
        });
        classId = schoolClass.id;
      }

      await tx.enrollment.upsert({
        where: {
          studentProfileId_year: {
            studentProfileId: change.studentProfileId,
            year,
          },
        },
        create: {
          studentProfileId: change.studentProfileId,
          year,
          classId,
          number: change.number,
          status: change.status,
        },
        update: { classId, number: change.number, status: change.status },
      });

      await tx.user.update({
        where: { id: change.userId },
        data: { status: accountActive ? "ACTIVE" : "INACTIVE" },
      });

      // 비활성으로 넘어가면 남아 있는 세션도 끊는다.
      if (!accountActive) {
        await tx.session.deleteMany({ where: { userId: change.userId } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
```

- [ ] **Step 5: service를 만든다**

```ts
// src/modules/enrollment/enrollment.service.ts
import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { can } from "@/core/authz/can";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./enrollment.repo";
import type { EnrollmentChange } from "./enrollment.schema";

export class EnrollmentError extends Error {}

export async function listStudents(actor: SessionUser) {
  if (!can(actor, "student:manage")) throw new Error("FORBIDDEN");
  return repo.listByYear(await getCurrentYear());
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const FIELDS = ["grade", "classNo", "number", "status"] as const;

/**
 * 표에서 고친 것을 한 번에 저장한다.
 *
 * 바뀐 줄만 쓴다. 표가 전체를 보내오더라도 여기서 현재 값과 대조해 걸러낸다 —
 * 안 그러면 아무것도 안 고치고 저장만 눌러도 전교생 감사로그가 쌓인다.
 *
 * 감사로그는 학생 1명당 1줄이다. 일괄 작업이어도 나중에 "이 학생이 왜 3반이 됐지"를
 * 추적하려면 건별이어야 한다. 같은 저장에 속한 줄은 batch로 묶어 본다.
 */
export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
): Promise<{ saved: number }> {
  if (!can(actor, "student:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const currentRows = await repo.listByYear(year);
  const byId = new Map(currentRows.map((r) => [r.studentProfileId, r]));

  // 먼저 전부 검증한다. 절반만 저장되는 게 제일 나쁘다.
  const planned: {
    change: EnrollmentChange & { userId: string };
    active: boolean;
    changed: string[];
  }[] = [];

  for (const input of changes) {
    const before = byId.get(input.studentProfileId);
    // 세션에서 유도할 수 없는 식별자라 반드시 대조한다.
    if (!before) throw new EnrollmentError("UNKNOWN_STUDENT");

    const enrolled = input.status === "ENROLLED";
    if (enrolled && (input.grade === null || input.classNo === null || input.number === null)) {
      throw new EnrollmentError("INCOMPLETE_ENROLLED");
    }

    // 재학이 아니면 반·번호를 지운다 — 졸업·자퇴에 반과 번호는 의미가 없다.
    const change = {
      ...input,
      grade: enrolled ? input.grade : null,
      classNo: enrolled ? input.classNo : null,
      number: enrolled ? input.number : null,
      userId: before.userId,
    };

    const changed = FIELDS.filter(
      (f) => before[f] !== change[f],
    ) as unknown as string[];
    if (changed.length === 0) continue;

    planned.push({ change, active: keepsAccountActive(input.status), changed });
  }

  if (planned.length === 0) return { saved: 0 };

  const batch = randomUUID();

  for (const { change, active, changed } of planned) {
    try {
      await repo.applyChange(year, change, active);
    } catch (error) {
      if (error instanceof repo.NumberTakenError) {
        throw new EnrollmentError("NUMBER_TAKEN");
      }
      throw error;
    }

    await recordAudit({
      actorUserId: actor.id,
      action: "enrollment:update",
      targetType: "StudentProfile",
      targetId: change.studentProfileId,
      // 바뀐 값이 아니라 바뀐 항목 이름만. batch로 같은 저장임을 묶는다.
      metadata: { changed, batch, year },
    });
  }

  return { saved: planned.length };
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/modules/enrollment`
Expected: PASS (11개)

- [ ] **Step 7: 소속 upsert가 학적을 되돌리게 고친다**

`src/modules/admin-users/admin-user.repo.ts`의 `updateEnrollment`에서 `update:` 절에 `status`를 넣는다. 사용자 상세에서 반·번호를 고치는 것은 "이 학생은 재학 중"이라는 뜻이므로, 비재학 행에 반·번호만 채워지는 조합을 막는다.

```ts
      update: { classId: schoolClass.id, number: data.number, status: "ENROLLED" },
```

바로 위에 왜인지 한 줄 남긴다.

```ts
      // 상세에서 반·번호를 고치는 건 재학 중이라는 뜻이다. 졸업 행에 반만 채워지면 안 된다.
```

- [ ] **Step 8: 전체 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add src/modules/enrollment tests/modules/enrollment src/modules/admin-users/admin-user.repo.ts
git commit -m "feat(enrollment): 학년도별 소속 조회와 일괄 수정

표가 전체를 보내와도 현재 값과 대조해 바뀐 줄만 쓴다. 안 그러면 아무것도 안 고치고
저장만 눌러도 전교생 감사로그가 쌓인다.

소속과 계정 상태를 한 트랜잭션에서 바꾼다. 따로 쓰면 학적만 졸업으로 바뀌고 계정은
활성인 상태가 남는다. 비활성으로 넘어가면 세션도 끊는다.

감사로그는 학생 1명당 1줄이고 batch로 묶는다. 일괄 작업이어도 '이 학생이 왜 3반이
됐지'를 추적하려면 건별이어야 한다."
```

---

### Task 2: Select 프리미티브와 학생 표

**Files:**
- Create: `src/components/ui/select.tsx`
- Create: `src/app/(app)/admin/students/page.tsx`, `student-table.tsx`, `actions.ts`, `action-state.ts`
- Modify: `src/components/app-shell/nav.ts`

**Interfaces:**
- Consumes: Task 1의 `listStudents(actor)`, `saveEnrollments(actor, changes)`, `saveEnrollmentsSchema`
- Produces: 없음 (화면이 종점)

- [ ] **Step 1: Select 프리미티브를 만든다**

`src/components/ui/input.tsx`의 `Input`과 같은 규격·같은 API로 만든다. 화살표는 배경 이미지 대신 `appearance-none` + 오른쪽 여백으로 처리하지 말고, 브라우저 기본 화살표를 그대로 둔다 (시안에 셀렉트가 없어 지어내지 않는다).

```tsx
// src/components/ui/select.tsx
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * 시안에 셀렉트가 없어 Input 규격을 그대로 따른다.
 * 화살표는 브라우저 기본을 쓴다 — 없는 시안을 지어내지 않는다.
 */
export function Select({
  dense = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"select"> & { dense?: boolean }) {
  return (
    <select
      className={cn(
        "w-full rounded-field border border-line bg-surface",
        dense ? "px-[13px] py-3" : "p-[13px]",
        "text-sm text-ink outline-none",
        "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: 상태 타입을 만든다**

```ts
// src/app/(app)/admin/students/action-state.ts
/*
 * `"use server"` 모듈은 async 함수만 내보낼 수 있다.
 * 거기서 일반 객체를 export하면 클라이언트에서 undefined로 들어와
 * useActionState의 초기 상태가 비어버린다. 그래서 값은 여기 둔다.
 */
export type SaveState = {
  error: string | null;
  /** 실제로 저장된 학생 수. null이면 아직 저장한 적 없음. */
  saved: number | null;
};

export const SAVE_INITIAL: SaveState = { error: null, saved: null };
```

- [ ] **Step 3: 서버 액션을 만든다**

`src/app/(app)/admin/users/actions.ts`의 구조를 그대로 따른다 — `requireAuth()` → `safeParse` → 서비스 호출 → `revalidatePath`.

```ts
// src/app/(app)/admin/students/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import {
  EnrollmentError,
  saveEnrollments,
} from "@/modules/enrollment/enrollment.service";
import { saveEnrollmentsSchema } from "@/modules/enrollment/enrollment.schema";
import type { SaveState } from "./action-state";

const MESSAGES: Record<string, string> = {
  UNKNOWN_STUDENT: "목록에 없는 학생이 포함됐습니다. 새로고침 후 다시 시도하세요.",
  INCOMPLETE_ENROLLED: "재학인 학생은 학년·반·번호를 모두 채워야 합니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호의 학생이 있습니다.",
};

export async function saveEnrollmentsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const actor = await requireAuth();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("changes") ?? "[]"));
  } catch {
    return { error: "저장할 내용을 읽지 못했습니다.", saved: null };
  }

  const parsed = saveEnrollmentsSchema.safeParse({ changes: parsedJson });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      saved: null,
    };
  }

  try {
    const { saved } = await saveEnrollments(actor, parsed.data.changes);
    revalidatePath("/admin/students");
    return { error: null, saved };
  } catch (error) {
    if (error instanceof EnrollmentError) {
      return { error: MESSAGES[error.message] ?? "저장하지 못했습니다.", saved: null };
    }
    return { error: "저장하지 못했습니다.", saved: null };
  }
}
```

- [ ] **Step 4: 페이지를 만든다**

`src/app/(app)/admin/users/page.tsx`의 구조를 따른다 — `requirePermission` → 서비스 조회 → 직렬화 가능한 행으로 바꿔 클라이언트 표에 넘김.

```tsx
// src/app/(app)/admin/students/page.tsx
import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { listYears } from "@/modules/academic-year/academic-year.service";
import { listStudents } from "@/modules/enrollment/enrollment.service";
import { StudentTable, type StudentRow } from "./student-table";
import { YearSwitcher } from "./year-switcher";

export const metadata: Metadata = { title: "학생 관리" };

export default async function StudentsPage() {
  const actor = await requirePermission("student:manage");

  const [students, years] = await Promise.all([
    listStudents(actor),
    listYears(actor),
  ]);

  const rows: StudentRow[] = students.map((s) => ({
    studentProfileId: s.studentProfileId,
    name: s.name,
    email: s.email,
    grade: s.grade,
    classNo: s.classNo,
    number: s.number,
    status: s.status,
    accountActive: s.accountActive,
  }));

  return (
    <div className="grid gap-5">
      <YearSwitcher years={years} />
      <StudentTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 5: 표를 만든다**

`src/app/(app)/admin/users/user-table.tsx`의 필터 UI(`Button variant="chip" active=…`, `Input dense`)를 그대로 따른다. 다른 점은 셀이 편집 가능하고, 변경분을 모아 한 번에 보낸다는 것이다.

```tsx
// src/app/(app)/admin/students/student-table.tsx
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
```

- [ ] **Step 6: 메뉴에 넣는다**

`src/components/app-shell/nav.ts`의 `ADMIN_NAV_ITEMS`에서 "사용자 관리" **앞에** 넣는다 (학생이 더 자주 쓰는 화면이다). 아이콘은 이미 있는 `UsersIcon`을 쓴다.

```ts
  {
    href: "/admin/students",
    label: "학생 관리",
    shortLabel: "학생",
    icon: UsersIcon,
    roles: ["ADMIN"],
  },
```

- [ ] **Step 7: 검증**

Run: `npm run verify && npm run build`
Expected: 둘 다 통과.

`amber-soft`·`amber-ink` 같은 색 토큰이 없다는 오류가 나면 `src/app/globals.css`의 `@theme`에서 실제 토큰 이름을 확인해 맞춘다. **새 색을 만들지 마라** — 시안에 있는 것만 쓴다.

- [ ] **Step 8: 커밋**

```bash
git add src/components/ui/select.tsx "src/app/(app)/admin/students" src/components/app-shell/nav.ts
git commit -m "feat(admin): 학생 표에서 소속·학적을 직접 고친다

칸마다 즉시 저장하지 않고 변경분을 모아 한 번에 보낸다. 즉시 저장이면 왕복이
학생 수만큼이고, 중간에 실패하면 어디까지 반영됐는지 알 수 없다.

바뀐 줄만 보내되 서버가 현재 값과 다시 대조한다 — 클라이언트가 보낸 목록은
최종 근거가 아니다.

재학이 아니면 학년·반·번호 칸을 잠근다. 졸업생에게 반과 번호는 의미가 없다."
```

---

### Task 3: 학년도 전환

**Files:**
- Create: `src/app/(app)/admin/students/year-switcher.tsx`
- Modify: `src/app/(app)/admin/students/actions.ts` (액션 두 개 추가), `action-state.ts` (상태 추가)

**Interfaces:**
- Consumes: `listYears(actor)`, `createYear(actor, year)`, `setCurrentYear(actor, year)` from `@/modules/academic-year/academic-year.service`
- Produces: 없음

- [ ] **Step 1: 상태를 추가한다**

`action-state.ts`에 아래를 덧붙인다.

```ts
export type YearState = { error: string | null; ok: boolean };

export const YEAR_INITIAL: YearState = { error: null, ok: false };
```

- [ ] **Step 2: 서버 액션 두 개를 추가한다**

`actions.ts` 아래에 덧붙인다. import에 `AcademicYearError`, `createYear`, `setCurrentYear`, `YearState`를 추가한다.

```ts
export async function setCurrentYearAction(
  _prev: YearState,
  formData: FormData,
): Promise<YearState> {
  const actor = await requireAuth();
  const year = Number(formData.get("year"));

  try {
    await setCurrentYear(actor, year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: "학년도를 바꾸지 못했습니다.", ok: false };
    }
    return { error: "학년도를 바꾸지 못했습니다.", ok: false };
  }
}

export async function createYearAction(
  _prev: YearState,
  formData: FormData,
): Promise<YearState> {
  const actor = await requireAuth();
  const year = Number(formData.get("year"));

  try {
    await createYear(actor, year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof AcademicYearError && error.message === "INVALID_YEAR") {
      return { error: "학년도가 올바르지 않습니다.", ok: false };
    }
    // 유일 제약 위반 — 이미 있는 학년도다.
    return { error: "이미 있는 학년도이거나 만들지 못했습니다.", ok: false };
  }
}
```

- [ ] **Step 3: 전환 화면을 만든다**

```tsx
// src/app/(app)/admin/students/year-switcher.tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { YEAR_INITIAL } from "./action-state";
import { createYearAction, setCurrentYearAction } from "./actions";

/*
 * 각 폼이 자기 결과를 직접 렌더한다.
 * 결과를 부모로 끌어올리면 자식 렌더 중에 부모 setState를 부르게 되어
 * "Cannot update a component while rendering a different component"로 터진다.
 */
export function YearSwitcher({
  years,
}: {
  years: { year: number; isCurrent: boolean }[];
}) {
  const current = years.find((y) => y.isCurrent)?.year;
  const [selected, setSelected] = useState(String(current ?? ""));
  const [switchState, switchAction, switching] = useActionState(
    setCurrentYearAction,
    YEAR_INITIAL,
  );
  const [createState, createAction, creating] = useActionState(
    createYearAction,
    YEAR_INITIAL,
  );

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="text-base font-extrabold text-ink">학년도</h2>
      <p className="mt-0.5 text-[12px] text-mut">
        모든 화면이 현재 학년도의 소속을 보여줍니다.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <form action={switchAction} className="flex items-end gap-2">
          <div>
            <Select
              dense
              name="year"
              aria-label="현재 학년도"
              value={selected}
              onChange={(e) => setSelected(e.currentTarget.value)}
              className="w-36"
            >
              {years.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}학년도{y.isCurrent ? " (현재)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={switching || Number(selected) === current}
          >
            {switching ? "바꾸는 중…" : "현재로 지정"}
          </Button>
        </form>

        <form action={createAction} className="flex items-end gap-2">
          <Input
            dense
            type="number"
            name="year"
            aria-label="새 학년도"
            placeholder="2027"
            min={2000}
            max={2100}
            required
            className="w-28"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={creating}>
            {creating ? "만드는 중…" : "학년도 추가"}
          </Button>
        </form>
      </div>

      {switchState.error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose">
          {switchState.error}
        </p>
      )}
      {createState.error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose">
          {createState.error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 검증**

Run: `npm run verify && npm run build`
Expected: 둘 다 통과.

- [ ] **Step 5: 화면에서 직접 확인한다**

`npm run dev` 후 관리자로 `/admin/students`에 들어가 아래를 확인한다. 로그인이 어려우면 서비스 함수를 직접 호출해 같은 것을 확인하고, 무엇으로 확인했는지 보고서에 적는다.

| 확인 | 기대 |
|---|---|
| 김동혁이 1학년 3반 3번, 재학으로 보인다 | |
| 번호를 4로 바꾸면 그 줄에 색이 들어오고 "1명 수정됨"이 뜬다 | |
| 저장 → "1명 저장했습니다" | |
| 학적을 `졸업`으로 바꾸면 학년·반·번호 칸이 잠긴다 | |
| 저장 후 계정 열이 `비활성`이 된다 | |
| 다시 `재학` + 1/3/3으로 되돌리고 저장 → 계정이 `활성`으로 돌아온다 | |
| `학년도 추가`에 2027 → 목록에 생긴다 | |
| 2027을 `현재로 지정` → 표의 학생이 전부 배정 없음이 된다 (과거 소속이 잘못 보이면 안 된다) | |
| 다시 2026을 현재로 지정 → 소속이 돌아온다 | |

**확인이 끝나면 김동혁을 1학년 3반 3번·재학·계정 활성으로 되돌리고, 2027 학년도는 지워라** (`delete from "AcademicYear" where year = 2027;` — 딸린 Enrollment가 없는지 먼저 확인).

- [ ] **Step 6: DB에서 결과를 확인한다**

Run:
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"select u.name, u.status, e.year, e.status as 학적, sc.grade, sc.\"classNo\", e.number
 from \"Enrollment\" e
 join \"StudentProfile\" sp on sp.id = e.\"studentProfileId\"
 join \"user\" u on u.id = sp.\"userId\"
 left join \"SchoolClass\" sc on sc.id = e.\"classId\";
 select year, \"isCurrent\" from \"AcademicYear\";"
```
Expected: 김동혁 1행 · `ACTIVE` · 2026 · `ENROLLED` · 1 · 3 · 3, `AcademicYear`는 2026 하나만 `isCurrent = true`.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/admin/students"
git commit -m "feat(admin): 학년도를 화면에서 전환한다

1단계에서 서비스만 만들고 부르는 화면이 없어서, 3월이 오면 psql로 직접 바꿔야 했다.
학생 관리 화면 위에 붙인다 — 학년도를 바꾸는 순간 이 표의 내용이 통째로 바뀌므로
결과가 바로 보이는 자리가 맞다."
```

---

## Self-Review

**스펙 대조**

| 스펙 절 | 태스크 |
|---|---|
| 표 내 직접 편집 (`/admin/students`, 반·번호·학적) | Task 1·2 |
| 한 번에 저장 | Task 2 |
| 감사로그 학생 1명당 1줄 + 배치 식별자 | Task 1 |
| 학적에 따른 계정 상태 | Task 1 (`keepsAccountActive` 첫 호출부) |
| 1단계 이월: 학년도 전환 화면 | Task 3 |
| 1단계 이월: 소속 upsert가 status를 안 건드림 | Task 1 Step 7 |
| 1단계 이월: `setCurrentYear` TOCTOU | **고치지 않는다** — 아래 참고 |
| 명단 업로드 | **3단계 계획** |

**`setCurrentYear` TOCTOU를 이번에도 미루는 이유:** 이제 호출 화면이 생기므로 "도달 불가"라는 근거는 사라진다. 다만 영향은 여전히 감사로그의 `from` 값 하나뿐이고, 데이터 무결성은 부분 유니크 인덱스가 보장한다. 관리자가 둘 이상 동시에 학년도를 전환하는 상황은 3월에 한 번 있는 일이라, 3단계에서 명단 업로드와 함께 정리한다. **3단계 계획에 반드시 넣어라.**

**이름 일관성 확인** — `NumberTakenError`가 `enrollment.repo`와 `admin-user.repo` 양쪽에 각각 있다. 서로 다른 클래스이므로 `instanceof`가 모듈을 건너 통하지 않는다. 각 서비스가 자기 repo 것만 잡으므로 문제없지만, 3단계에서 명단 업로드가 두 경로를 다 쓰게 되면 하나로 합쳐야 한다.

**남은 것** — 이 계획이 끝나도 학생 계정을 **새로 만드는** 수단은 초대코드 한 명씩뿐이다. 일괄 등록은 3단계다.
