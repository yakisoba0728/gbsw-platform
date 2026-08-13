# 학년도·소속 모델 구현 계획 (1단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 소속을 학년도별 `Enrollment`로 옮겨, 졸업생과 지난 학년도 소속이 남고 학년도별 집계가 가능한 구조를 만든다.

**Architecture:** `StudentProfile`은 신원(생년월일)만 들고, 소속은 `Enrollment`가 학년도마다 한 줄씩 쌓는다. "현재 소속"은 `year = 현재 학년도`인 행이다. 현재 학년도는 `AcademicYear.isCurrent`가 정한다. 서비스가 현재 학년도를 조회해 repo에 인자로 넘긴다 — repo는 Prisma 호출만 두는 규칙을 지키기 위해서다.

**Tech Stack:** Prisma 7.9 (`prisma-client` generator, `@prisma/adapter-pg`), PostgreSQL 18, Next.js 16 App Router, zod 4, vitest 4.

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`
- 계층 규칙: `Route/Server Action → Service → Repo`. 라우트·페이지에 업무 로직과 Prisma 호출을 두지 않는다.
- `can()`은 서비스 안에서도 호출한다. 페이지에서 막았어도 다시 검사한다.
- 모든 생성/수정/삭제는 `recordAudit()`을 남긴다.
- zod 검증은 경계에서 한 번만. 서비스는 타입이 맞는 입력을 신뢰한다.
- 새 액션은 `core/authz/can.ts`의 `Action`·`RULES`와 `tests/core/authz/can.test.ts`의 `EXPECTED`에 **함께** 추가한다. 빠뜨리면 테스트가 깨진다.
- 마이그레이션은 `npx prisma migrate dev --create-only`로 만들고 데이터 이관 SQL을 손으로 넣은 뒤 적용한다. 데이터가 있는 컬럼에 제약을 거는 마이그레이션은 그냥 `migrate dev`로는 실패한다.
- 각 태스크 끝에 `npm run verify` (typecheck + lint + test)가 통과해야 한다.
- 학적 저장값은 영문 상수, 화면 표기는 라벨 맵. 한글은 엑셀 열 표기일 뿐이다.
- DB 접속은 드라이버 어댑터로만. 스키마를 바꾸면 `npx prisma generate`를 돌려야 타입이 갱신된다.

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `src/core/authz/enrollment-status.ts` | 학적 상수·라벨·계정 활성 여부. 도메인 로직 없는 값 정의 |
| `src/modules/academic-year/academic-year.repo.ts` | Prisma 호출만 |
| `src/modules/academic-year/academic-year.service.ts` | 권한·감사로그·현재 학년도 전환 |
| `tests/core/authz/enrollment-status.test.ts` | 상수·라벨 대응 |
| `tests/modules/academic-year/academic-year.service.test.ts` | 권한 거부/허용, 감사로그, 단일 현재 학년도 |

**수정**

| 파일 | 무엇을 |
|---|---|
| `prisma/schema.prisma` | `AcademicYear` 추가, `SchoolClass.year`, `Enrollment` 추가, `StudentProfile`에서 `classId`·`number` 제거 |
| `src/core/authz/can.ts` | `academic-year:manage` 액션 |
| `tests/core/authz/can.test.ts` | `EXPECTED`에 새 액션 |
| `src/modules/registration/registration.repo.ts` | 가입 시 `Enrollment` 생성 |
| `src/modules/admin-users/admin-user.repo.ts` | 소속을 `Enrollment`에서 읽기, 소속 수정도 `Enrollment`로 |
| `src/modules/admin-users/admin-user.service.ts` | 현재 학년도를 조회해 repo에 전달 |
| `src/modules/invites/invite.repo.ts` | 학생 목록의 소속을 `Enrollment`에서 |
| `src/app/(app)/admin/users/page.tsx` | 소속 표기 경로 |
| `src/app/(app)/admin/users/[userId]/page.tsx` | 소속 표기 경로 |
| `src/app/(app)/admin/invites/page.tsx` | 소속 표기 경로 |
| `tests/modules/admin-users/admin-user.service.test.ts` | 소속 목 구조 변경 |

`enrollment-status.ts`를 `core/authz`에 두는 이유: `roles.ts`가 같은 자리에 있고, 학적이 계정 활성 여부를 결정하므로 권한과 붙어 있는 값이다.

---

### Task 1: 학적 상수

**Files:**
- Create: `src/core/authz/enrollment-status.ts`
- Test: `tests/core/authz/enrollment-status.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `ENROLLMENT_STATUSES` (readonly tuple), `EnrollmentStatus` (union type), `ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string>`, `isEnrollmentStatus(v: unknown): v is EnrollmentStatus`, `keepsAccountActive(s: EnrollmentStatus): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/core/authz/enrollment-status.test.ts
import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
  keepsAccountActive,
} from "@/core/authz/enrollment-status";

describe("학적 상수", () => {
  it("모든 값에 한글 라벨이 있다", () => {
    for (const s of ENROLLMENT_STATUSES) {
      expect(ENROLLMENT_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("라벨이 서로 겹치지 않는다 — 엑셀 표기를 상수로 되돌릴 수 있어야 한다", () => {
    const labels = Object.values(ENROLLMENT_STATUS_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("재학만 계정을 살려둔다", () => {
    expect(keepsAccountActive("ENROLLED")).toBe(true);
    for (const s of ENROLLMENT_STATUSES.filter((v) => v !== "ENROLLED")) {
      expect(keepsAccountActive(s)).toBe(false);
    }
  });

  it("모르는 값은 걸러낸다", () => {
    expect(isEnrollmentStatus("ENROLLED")).toBe(true);
    expect(isEnrollmentStatus("재학")).toBe(false);
    expect(isEnrollmentStatus(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/core/authz/enrollment-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/core/authz/enrollment-status"`

- [ ] **Step 3: 구현한다**

```ts
// src/core/authz/enrollment-status.ts
/**
 * 학적 — 그 학년도의 상태다. 학생의 영구 속성이 아니라 Enrollment에 붙는다.
 *
 * 저장값은 영문 상수, 화면 표기는 라벨. role·status가 이미 이 방식이다.
 * 한글은 명단 엑셀의 열 표기일 뿐이라 파서가 라벨→상수로 옮긴다.
 */
export const ENROLLMENT_STATUSES = [
  "ENROLLED",
  "GRADUATED",
  "WITHDRAWN",
  "EXPELLED",
  "TRANSFERRED",
  "DEFERRED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ENROLLED: "재학",
  GRADUATED: "졸업",
  WITHDRAWN: "자퇴",
  EXPELLED: "퇴학",
  TRANSFERRED: "전출",
  DEFERRED: "유예",
};

export function isEnrollmentStatus(value: unknown): value is EnrollmentStatus {
  return (
    typeof value === "string" &&
    (ENROLLMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * 재학이 아니면 로그인을 막는다. 졸업도 마찬가지다 —
 * 재학생만 쓰는 시스템이라 졸업생이 들어와도 볼 게 없고 관리 대상만 늘어난다.
 * 계정을 지우지는 않는다. 상벌점·감사로그가 남아야 한다.
 */
export function keepsAccountActive(status: EnrollmentStatus): boolean {
  return status === "ENROLLED";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/core/authz/enrollment-status.test.ts`
Expected: PASS (4개)

- [ ] **Step 5: 커밋**

```bash
git add src/core/authz/enrollment-status.ts tests/core/authz/enrollment-status.test.ts
git commit -m "feat(authz): 학적 상수와 라벨

저장값은 영문 상수, 화면·엑셀 표기는 라벨로 나눈다. role·status가 이미 이 방식이다.
재학만 계정을 살려둔다 — 졸업도 비활성이다. 재학생만 쓰는 시스템이라 졸업생 계정이
살아 있으면 관리 대상만 늘어난다."
```

---

### Task 2: 스키마와 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<타임스탬프>_academic_year_and_enrollment/migration.sql`

**Interfaces:**
- Consumes: Task 1의 학적 상수 (스키마 주석에서 참조)
- Produces: Prisma 모델 `AcademicYear { year, isCurrent }`, `SchoolClass { id, year, grade, classNo }`, `Enrollment { id, studentProfileId, year, classId?, number?, status }`. `StudentProfile`에서 `classId`·`number`가 사라진다.

- [ ] **Step 1: 이관 전 상태를 기록해 둔다**

Run:
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"select sp.id, u.name, sp.number, sc.grade, sc.\"classNo\"
 from \"StudentProfile\" sp join \"user\" u on u.id=sp.\"userId\"
 left join \"SchoolClass\" sc on sc.id=sp.\"classId\";"
```
Expected: 학생 1명 (김동혁 · number 3 · grade 1 · classNo 3). 이 값이 이관 후에도 그대로 나와야 한다.

- [ ] **Step 2: 스키마를 고친다**

`prisma/schema.prisma`에서 `SchoolClass`와 `StudentProfile`을 아래로 바꾸고 두 모델을 추가한다.

```prisma
/// 학년도. isCurrent는 항상 하나만 true다 (부분 유니크 인덱스로 DB가 막는다).
model AcademicYear {
  year      Int      @id
  isCurrent Boolean  @default(false)
  createdAt DateTime @default(now())

  classes     SchoolClass[]
  enrollments Enrollment[]
}

/// 학년/반. 학년도마다 별개의 행이다 — "1학년 3반"이 해마다 새로 생긴다.
model SchoolClass {
  id        String   @id @default(cuid())
  year      Int
  grade     Int
  classNo   Int
  createdAt DateTime @default(now())

  academicYear AcademicYear @relation(fields: [year], references: [year], onDelete: Restrict)
  enrollments  Enrollment[]

  @@unique([year, grade, classNo])
  @@index([year])
}

/// 학생의 그 학년도 소속과 학적.
/// classId·number는 ENROLLED일 때만 채운다 — 졸업·자퇴에 반과 번호는 의미가 없다.
model Enrollment {
  id String @id @default(cuid())

  studentProfileId String
  studentProfile   StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)

  year         Int
  academicYear AcademicYear @relation(fields: [year], references: [year], onDelete: Restrict)

  classId     String?
  schoolClass SchoolClass? @relation(fields: [classId], references: [id], onDelete: SetNull)

  number Int?

  /// src/core/authz/enrollment-status.ts의 EnrollmentStatus와 일치해야 한다.
  status String @default("ENROLLED")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// 한 학생은 한 학년도에 한 줄. 동시 요청은 애플리케이션 검사로 못 막는다.
  @@unique([studentProfileId, year])
  /// 한 반에 같은 번호 둘을 막는다. Postgres는 NULL을 서로 다르게 보므로
  /// 비재학 행끼리는 걸리지 않는다 — 의도한 동작이다.
  @@unique([classId, number])
  @@index([year])
  @@index([studentProfileId])
}
```

`StudentProfile`에서 아래 네 줄을 **지운다**.

```prisma
  /// 학급 내 번호 (현재 소속)
  number Int?

  classId     String?
  schoolClass SchoolClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
```

그리고 `StudentProfile`에 관계 한 줄을 **추가한다**.

```prisma
  /// 학년도별 소속·학적
  enrollments Enrollment[]
```

`StudentProfile`의 `@@index([classId])`도 지운다 (컬럼이 사라졌다).

- [ ] **Step 3: 마이그레이션을 적용 없이 만든다**

Run: `npx prisma migrate dev --create-only --name academic_year_and_enrollment`
Expected: `prisma/migrations/<타임스탬프>_academic_year_and_enrollment/migration.sql` 생성. 데이터 손실 경고가 뜨는데 정상이다 — 다음 단계에서 이관 SQL을 넣는다.

- [ ] **Step 4: 이관 SQL을 손으로 넣는다**

생성된 `migration.sql`을 **통째로 아래로 바꾼다**. Prisma가 만든 순서는 데이터를 버리므로 그대로 쓰면 안 된다.

```sql
-- 학년도와 학년도별 소속을 도입한다.
--
-- 지금 SchoolClass는 (학년, 반)이 유일키라 "1학년 3반"이 해마다 같은 행을 재사용하고,
-- 학생 소속은 StudentProfile에 현재 값 하나만 남는다. 학생의 영구 ID에 학년도별
-- Enrollment를 쌓는 구조로 옮긴다.
--
-- 기존 소속은 버리지 않고 현재 학년도(2026) 배정으로 옮긴다.

-- 1. 학년도
CREATE TABLE "AcademicYear" (
    "year" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("year")
);

INSERT INTO "AcademicYear" ("year", "isCurrent") VALUES (2026, true);

-- 현재 학년도는 항상 하나뿐이다. 부분 유니크 인덱스로 DB가 직접 막는다.
CREATE UNIQUE INDEX "AcademicYear_single_current"
    ON "AcademicYear" ("isCurrent") WHERE "isCurrent";

-- 2. SchoolClass에 학년도를 붙인다
ALTER TABLE "SchoolClass" ADD COLUMN "year" INTEGER;
UPDATE "SchoolClass" SET "year" = 2026 WHERE "year" IS NULL;
ALTER TABLE "SchoolClass" ALTER COLUMN "year" SET NOT NULL;

DROP INDEX "SchoolClass_grade_classNo_key";
CREATE UNIQUE INDEX "SchoolClass_year_grade_classNo_key"
    ON "SchoolClass" ("year", "grade", "classNo");
CREATE INDEX "SchoolClass_year_idx" ON "SchoolClass" ("year");

ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_year_fkey"
    FOREIGN KEY ("year") REFERENCES "AcademicYear" ("year")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Enrollment
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "classId" TEXT,
    "number" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- 기존 소속을 2026학년도 배정으로 옮긴다. 반이 없던 학생도 재학으로 남긴다.
INSERT INTO "Enrollment" ("id", "studentProfileId", "year", "classId", "number", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sp."id", 2026, sp."classId", sp."number", 'ENROLLED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudentProfile" sp;

CREATE UNIQUE INDEX "Enrollment_studentProfileId_year_key"
    ON "Enrollment" ("studentProfileId", "year");
CREATE UNIQUE INDEX "Enrollment_classId_number_key"
    ON "Enrollment" ("classId", "number");
CREATE INDEX "Enrollment_year_idx" ON "Enrollment" ("year");
CREATE INDEX "Enrollment_studentProfileId_idx" ON "Enrollment" ("studentProfileId");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_year_fkey"
    FOREIGN KEY ("year") REFERENCES "AcademicYear" ("year")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. StudentProfile에서 소속을 걷어낸다 (Enrollment로 옮겼다)
DROP INDEX "StudentProfile_classId_idx";
ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_classId_fkey";
ALTER TABLE "StudentProfile" DROP COLUMN "classId";
ALTER TABLE "StudentProfile" DROP COLUMN "number";
```

- [ ] **Step 5: 적용하고 이관을 확인한다**

Run:
```bash
npm run db:migrate
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"select u.name, e.year, e.status, sc.grade, sc.\"classNo\", e.number
 from \"Enrollment\" e
 join \"StudentProfile\" sp on sp.id = e.\"studentProfileId\"
 join \"user\" u on u.id = sp.\"userId\"
 left join \"SchoolClass\" sc on sc.id = e.\"classId\";"
```
Expected: `김동혁 | 2026 | ENROLLED | 1 | 3 | 3` — Step 1에서 적어둔 값과 같아야 한다.

- [ ] **Step 6: 현재 학년도가 둘이 될 수 없는지 확인한다**

Run:
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"insert into \"AcademicYear\" (year, \"isCurrent\") values (2027, true);"
```
Expected: FAIL — `duplicate key value violates unique constraint "AcademicYear_single_current"`. 실패해야 정상이다. (성공했다면 부분 인덱스가 안 걸린 것이니 Step 4의 `CREATE UNIQUE INDEX ... WHERE "isCurrent"`를 다시 확인한다.)

- [ ] **Step 7: 클라이언트를 재생성하고 무엇이 깨지는지 본다**

Run: `npx prisma generate && npm run typecheck`
Expected: FAIL — `classId`·`number`를 읽던 곳에서 타입 오류가 여럿 난다. 이게 다음 태스크들의 작업 목록이다. **오류 목록을 적어둔다.**

- [ ] **Step 8: 커밋**

타입 오류가 남아 있어도 스키마는 하나의 완결된 변경이므로 여기서 커밋한다. 다음 태스크가 코드를 맞춘다.

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): 학년도와 학년도별 소속(Enrollment)

SchoolClass가 (학년, 반) 유일키라 '1학년 3반'이 해마다 같은 행을 재사용했고 학생 소속은
현재 값 하나만 남았다. 학생의 영구 ID에 학년도별 Enrollment를 쌓는 구조로 옮긴다.
졸업생 소속도 남고, 반이 잘못 올라갔으면 그 줄만 고치면 지난 집계까지 함께 바로잡힌다.

기존 소속은 2026학년도 배정으로 이관했다. 현재 학년도가 둘이 되는 건 부분 유니크
인덱스로 DB가 막는다 — 애플리케이션 검사만으로는 동시 요청에서 뚫린다.

이 커밋만으로는 타입이 맞지 않는다. 소속을 읽던 코드는 다음 커밋에서 맞춘다."
```

---

### Task 3: 권한 액션과 academic-year 모듈

**Files:**
- Modify: `src/core/authz/can.ts`
- Modify: `tests/core/authz/can.test.ts`
- Create: `src/modules/academic-year/academic-year.repo.ts`
- Create: `src/modules/academic-year/academic-year.service.ts`
- Test: `tests/modules/academic-year/academic-year.service.test.ts`

**Interfaces:**
- Consumes: `can()` from `@/core/authz/can`, `recordAudit()` from `@/core/audit/audit`
- Produces:
  - repo: `findCurrent(): Promise<{ year: number } | null>`, `listYears(): Promise<{ year: number; isCurrent: boolean }[]>`, `createYear(year: number): Promise<void>`, `setCurrent(year: number): Promise<void>`
  - service: `getCurrentYear(): Promise<number>` (없으면 `AcademicYearError("NO_CURRENT_YEAR")`), `listYears(actor)`, `createYear(actor, year)`, `setCurrentYear(actor, year)`, `class AcademicYearError extends Error`

- [ ] **Step 1: can.ts에 액션을 등록한다**

`Action` 유니온에 한 줄, `RULES`에 한 줄 추가한다.

```ts
export type Action =
  | "user:manage"
  | "student:manage"
  | "academic-year:manage"
  | "invite:create"
  | "invite:list"
  | "invite:revoke"
  | "invite:create:parent"
  | "audit:read";
```

```ts
const RULES: Record<Action, Role[]> = {
  "user:manage": [], // 관리자 전용
  "student:manage": [], // 관리자 전용
  "academic-year:manage": [], // 관리자 전용
  "invite:create": [], // 관리자 전용
  "invite:list": [], // 관리자 전용
  "invite:revoke": [], // 관리자 전용
  "audit:read": [], // 관리자 전용

  // 학생은 자기 학부모 코드만 만들 수 있다.
  // 역할 검사만으로는 부족해서 서비스에서 소유권(세션→StudentProfile)을 함께 검사한다.
  "invite:create:parent": ["STUDENT"],
};
```

- [ ] **Step 2: can 테스트가 깨지는 걸 확인한다**

Run: `npx vitest run tests/core/authz/can.test.ts`
Expected: FAIL — `EXPECTED`에 `academic-year:manage`가 없어서 케이스 수가 맞지 않는다.

- [ ] **Step 3: EXPECTED에 추가한다**

`tests/core/authz/can.test.ts`의 `EXPECTED` 객체에서 `"student:manage": ["ADMIN"],` 바로 아래에 넣는다.

```ts
  "academic-year:manage": ["ADMIN"],
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/core/authz/can.test.ts`
Expected: PASS

- [ ] **Step 5: 서비스 테스트를 쓴다 (실패)**

```ts
// tests/modules/academic-year/academic-year.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const findCurrent = vi.fn();
const listYearsRepo = vi.fn();
const createYearRepo = vi.fn();
const setCurrentRepo = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/academic-year/academic-year.repo", () => ({
  findCurrent,
  listYears: listYearsRepo,
  createYear: createYearRepo,
  setCurrent: setCurrentRepo,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { AcademicYearError, createYear, getCurrentYear, listYears, setCurrentYear } =
  await import("@/modules/academic-year/academic-year.service");

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

beforeEach(() => {
  findCurrent.mockReset().mockResolvedValue({ year: 2026 });
  listYearsRepo.mockReset().mockResolvedValue([]);
  createYearRepo.mockReset();
  setCurrentRepo.mockReset();
  recordAudit.mockReset();
});

describe("getCurrentYear()", () => {
  it("현재 학년도를 돌려준다", async () => {
    await expect(getCurrentYear()).resolves.toBe(2026);
  });

  it("현재 학년도가 없으면 던진다 — 조용히 넘어가면 소속이 통째로 비어 보인다", async () => {
    findCurrent.mockResolvedValue(null);
    await expect(getCurrentYear()).rejects.toThrow("NO_CURRENT_YEAR");
  });
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listYears(student)).rejects.toThrow("FORBIDDEN");
    await expect(createYear(student, 2027)).rejects.toThrow("FORBIDDEN");
    await expect(setCurrentYear(student, 2027)).rejects.toThrow("FORBIDDEN");
    expect(createYearRepo).not.toHaveBeenCalled();
    expect(setCurrentRepo).not.toHaveBeenCalled();
  });
});

describe("createYear()", () => {
  it("만들고 감사로그를 남긴다", async () => {
    await createYear(admin, 2027);

    expect(createYearRepo).toHaveBeenCalledWith(2027);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "academic-year:create", targetId: "2027" }),
    );
  });

  it("말이 안 되는 연도는 거부한다", async () => {
    await expect(createYear(admin, 1999)).rejects.toThrow("INVALID_YEAR");
    await expect(createYear(admin, 2200)).rejects.toThrow("INVALID_YEAR");
    expect(createYearRepo).not.toHaveBeenCalled();
  });
});

describe("setCurrentYear()", () => {
  it("현재 학년도를 바꾸고 감사로그를 남긴다", async () => {
    await setCurrentYear(admin, 2027);

    expect(setCurrentRepo).toHaveBeenCalledWith(2027);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "academic-year:set-current", targetId: "2027" }),
    );
  });

  it("이미 현재 학년도면 아무것도 하지 않는다", async () => {
    await setCurrentYear(admin, 2026);

    expect(setCurrentRepo).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run tests/modules/academic-year/academic-year.service.test.ts`
Expected: FAIL — `Failed to resolve import "@/modules/academic-year/academic-year.service"`

- [ ] **Step 7: repo를 만든다**

```ts
// src/modules/academic-year/academic-year.repo.ts
import { prisma } from "@/core/db/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function findCurrent() {
  return prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
}

export async function listYears() {
  return prisma.academicYear.findMany({
    orderBy: { year: "desc" },
    select: { year: true, isCurrent: true },
  });
}

export async function createYear(year: number): Promise<void> {
  await prisma.academicYear.create({ data: { year } });
}

/**
 * 현재 학년도를 옮긴다.
 *
 * 부분 유니크 인덱스(`isCurrent`가 true인 행은 하나)가 걸려 있어서
 * 먼저 전부 내리고 나서 올려야 한다. 순서를 뒤집으면 제약에 걸린다.
 */
export async function setCurrent(year: number): Promise<void> {
  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.academicYear.update({ where: { year }, data: { isCurrent: true } }),
  ]);
}
```

- [ ] **Step 8: service를 만든다**

```ts
// src/modules/academic-year/academic-year.service.ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import * as repo from "./academic-year.repo";

export class AcademicYearError extends Error {}

/** 학교가 실제로 존재할 수 있는 범위. 오타로 20226을 넣는 걸 막는다. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * 현재 학년도.
 *
 * 없으면 던진다. null로 넘기면 소속 조회가 전부 빈 결과를 내면서
 * "학생이 아무 반에도 없다"처럼 보이는데, 원인이 화면에 드러나지 않는다.
 */
export async function getCurrentYear(): Promise<number> {
  const current = await repo.findCurrent();
  if (!current) throw new AcademicYearError("NO_CURRENT_YEAR");
  return current.year;
}

export async function listYears(actor: SessionUser) {
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");
  return repo.listYears();
}

export async function createYear(actor: SessionUser, year: number): Promise<void> {
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new AcademicYearError("INVALID_YEAR");
  }

  await repo.createYear(year);

  await recordAudit({
    actorUserId: actor.id,
    action: "academic-year:create",
    targetType: "AcademicYear",
    targetId: String(year),
  });
}

export async function setCurrentYear(
  actor: SessionUser,
  year: number,
): Promise<void> {
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");

  // 이미 현재 학년도면 기록도 남기지 않는다 (no-op으로 감사로그가 오염되지 않게).
  const current = await repo.findCurrent();
  if (current?.year === year) return;

  await repo.setCurrent(year);

  await recordAudit({
    actorUserId: actor.id,
    action: "academic-year:set-current",
    targetType: "AcademicYear",
    targetId: String(year),
    metadata: { from: current?.year ?? null },
  });
}
```

- [ ] **Step 9: 통과를 확인한다**

Run: `npx vitest run tests/modules/academic-year/academic-year.service.test.ts tests/core/authz/can.test.ts`
Expected: PASS (전부)

- [ ] **Step 10: 커밋**

```bash
git add src/core/authz/can.ts tests/core/authz/can.test.ts \
        src/modules/academic-year tests/modules/academic-year
git commit -m "feat(academic-year): 학년도 조회와 현재 학년도 전환

현재 학년도가 없으면 getCurrentYear()가 던진다. null로 넘기면 소속 조회가 전부
빈 결과를 내면서 '학생이 아무 반에도 없다'처럼 보이는데 원인이 화면에 드러나지 않는다.

현재 학년도를 옮길 때는 전부 내리고 나서 올린다 — 부분 유니크 인덱스가 걸려 있어
순서를 뒤집으면 제약에 걸린다."
```

---

### Task 4: 가입 흐름을 Enrollment로

**Files:**
- Modify: `src/modules/registration/registration.repo.ts:100-128`

**Interfaces:**
- Consumes: `AcademicYear`·`Enrollment` 모델 (Task 2)
- Produces: `completeStudentRegistration(inviteId, account, student, year)` — 인자에 `year: number`가 **추가된다**. 호출부(`registration.service.ts`)도 함께 고친다.

- [ ] **Step 1: repo를 고친다**

`completeStudentRegistration`을 아래로 바꾼다.

```ts
export async function completeStudentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await createUserWithCredential(tx, account, "STUDENT");

    // 학급은 없으면 만든다 — 관리자가 미리 등록해 둘 필요가 없게.
    const schoolClass = await tx.schoolClass.upsert({
      where: {
        year_grade_classNo: {
          year,
          grade: student.grade,
          classNo: student.classNo,
        },
      },
      create: { year, grade: student.grade, classNo: student.classNo },
      update: {},
    });

    const profile = await tx.studentProfile.create({
      data: {
        userId: account.userId,
        birthDate: student.birthDate,
      },
    });

    // 소속은 학년도별로 쌓인다. 가입은 현재 학년도 배정을 만든다.
    await tx.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year,
        classId: schoolClass.id,
        number: student.number,
        status: "ENROLLED",
      },
    });

    await consumeInvite(tx, inviteId, account.userId);
  });
}
```

- [ ] **Step 2: 호출부를 고친다**

`src/modules/registration/registration.service.ts`에서 `completeStudentRegistration(...)` 호출을 찾아 현재 학년도를 넘긴다. 파일 위쪽에 import를 추가한다.

```ts
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
```

호출 직전에 학년도를 읽고 인자로 넘긴다.

```ts
const year = await getCurrentYear();
await repo.completeStudentRegistration(invite.id, account, student, year);
```

- [ ] **Step 3: 타입을 확인한다**

Run: `npm run typecheck`
Expected: `registration` 관련 오류가 사라진다. `admin-users`·`invites`·페이지 오류는 아직 남아 있다 (Task 5·6에서 고친다).

- [ ] **Step 4: 가입 테스트를 돌린다**

Run: `npx vitest run tests/modules/registration`
Expected: PASS. 실패하면 목에 `getCurrentYear`가 빠진 것이다 — 테스트 파일 상단에 아래를 추가한다.

```ts
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));
```

- [ ] **Step 5: 커밋**

```bash
git add src/modules/registration tests/modules/registration
git commit -m "feat(registration): 가입 시 현재 학년도 소속을 만든다

StudentProfile은 신원(생년월일)만 들고, 반과 번호는 Enrollment로 간다.
학년도는 서비스가 조회해 repo에 넘긴다 — repo에 Prisma 호출만 두는 규칙을 지킨다."
```

---

### Task 5: 관리자 읽기·쓰기 경로

**Files:**
- Modify: `src/modules/admin-users/admin-user.repo.ts` (`listUsers`, `findDetail`, `updateStudentProfile`)
- Modify: `src/modules/admin-users/admin-user.service.ts` (`listUsers`, `getUserDetail`, `updateUser`)
- Modify: `src/modules/invites/invite.repo.ts` (`listStudents`, 학부모 코드 목록의 소속)
- Modify: `tests/modules/admin-users/admin-user.service.test.ts`

**Interfaces:**
- Consumes: `getCurrentYear()` (Task 3)
- Produces: 조회 결과에서 학생 소속이 `studentProfile.enrollments[0]` 한 줄로 온다 (현재 학년도로 이미 걸러진 상태). repo 함수들은 `year: number`를 인자로 받는다.

- [ ] **Step 1: repo의 select를 바꾼다**

`admin-user.repo.ts`에서 소속을 고르던 세 곳을 아래 모양으로 바꾼다. `listUsers`와 `findDetail`은 `year`를 인자로 받는다.

```ts
/** 현재 학년도 소속만 한 줄 붙인다. 화면은 늘 "지금 몇 반인지"를 묻는다. */
const currentEnrollment = (year: number) => ({
  where: { year },
  take: 1,
  select: {
    id: true,
    number: true,
    status: true,
    schoolClass: { select: { grade: true, classNo: true } },
  },
});

export async function listUsers(year: number) {
  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      studentProfile: {
        select: { id: true, enrollments: currentEnrollment(year) },
      },
    },
  });
}
```

`findDetail(userId)` → `findDetail(userId, year)`로 바꾸고, 내부의 `studentProfile` select를 아래로 바꾼다. 자녀 목록(`parentLinks`) 안의 소속도 같은 모양으로 바꾼다.

```ts
      studentProfile: {
        select: {
          id: true,
          birthDate: true,
          enrollments: currentEnrollment(year),
        },
      },
      parentLinks: {
        select: {
          student: {
            select: {
              user: { select: { name: true } },
              enrollments: currentEnrollment(year),
            },
          },
        },
      },
```

- [ ] **Step 2: 소속 수정을 Enrollment로 바꾼다**

`updateStudentProfile`을 아래로 바꾼다. 이름도 `updateEnrollment`로 바꾼다 — 더 이상 프로필을 고치지 않는다.

```ts
/**
 * 학생 소속 수정. 학급이 없으면 만든다 — 가입 때와 같은 방식이다.
 * (registration.repo의 upsert 패턴과 동일)
 *
 * 생년월일은 신원이라 StudentProfile에 남아 있고, 반·번호만 Enrollment로 간다.
 */
export async function updateEnrollment(
  studentProfileId: string,
  year: number,
  data: { birthDate: Date; grade: number; classNo: number; number: number },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: { birthDate: data.birthDate },
    });

    const schoolClass = await tx.schoolClass.upsert({
      where: {
        year_grade_classNo: { year, grade: data.grade, classNo: data.classNo },
      },
      create: { year, grade: data.grade, classNo: data.classNo },
      update: {},
    });

    await tx.enrollment.upsert({
      where: { studentProfileId_year: { studentProfileId, year } },
      create: {
        studentProfileId,
        year,
        classId: schoolClass.id,
        number: data.number,
        status: "ENROLLED",
      },
      update: { classId: schoolClass.id, number: data.number },
    });
  });
}
```

- [ ] **Step 3: 서비스가 학년도를 조회해 넘기게 한다**

`admin-user.service.ts` 상단에 import를 추가한다.

```ts
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
```

`listUsers`·`getUserDetail`·`updateUser`가 학년도를 읽어 repo에 넘기게 고친다.

```ts
export async function listUsers(actor: SessionUser) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");
  return repo.listUsers(await getCurrentYear());
}

export async function getUserDetail(actor: SessionUser, userId: string) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const user = await repo.findDetail(userId, year);
  if (!user) throw new AdminUserError("NOT_FOUND");

  const audit = await repo.findRelatedAudit(userId, RELATED_AUDIT_LIMIT);
  return { user, audit };
}
```

`updateUser`에서 소속 비교 부분을 아래로 바꾼다. `profile.schoolClass`·`profile.number`가 `enrollment`로 옮겨갔다.

```ts
  const year = await getCurrentYear();
  const current = await repo.findDetail(userId, year);
  if (!current) throw new AdminUserError("NOT_FOUND");

  const changed: string[] = [];

  if (current.name !== input.name) changed.push("name");
  if (current.email !== input.email) changed.push("email");
  if (current.phone !== input.phone) changed.push("phone");

  const profile = current.studentProfile;
  const isStudent = profile !== null && profile !== undefined;
  const enrollment = profile?.enrollments[0];

  if (isStudent) {
    if (
      input.birthDate &&
      formatDateInput(profile.birthDate) !== input.birthDate
    ) {
      changed.push("birthDate");
    }
    if (
      input.grade !== undefined &&
      enrollment?.schoolClass?.grade !== input.grade
    ) {
      changed.push("grade");
    }
    if (
      input.classNo !== undefined &&
      enrollment?.schoolClass?.classNo !== input.classNo
    ) {
      changed.push("classNo");
    }
    if (input.number !== undefined && enrollment?.number !== input.number) {
      changed.push("number");
    }
  }
```

그리고 학생 저장 부분에서 `repo.updateStudentProfile(profile.id, {...})`를
`repo.updateEnrollment(profile.id, year, {...})`로 바꾼다.

- [ ] **Step 4: invites repo의 소속을 바꾼다**

`invite.repo.ts`에서 `schoolClass`를 고르던 세 곳을 `enrollments`로 바꾼다.
`listStudents`는 `year`를 인자로 받고, 정렬도 관계 정렬이 불가능해지므로 조회 후 코드에서 정렬한다.

```ts
export async function listStudents(year: number) {
  const students = await prisma.studentProfile.findMany({
    select: {
      id: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });

  // 학년→반→번호 순. 관계 배열은 Prisma orderBy로 정렬할 수 없어 여기서 맞춘다.
  return students.sort((a, b) => {
    const x = a.enrollments[0];
    const y = b.enrollments[0];
    return (
      (x?.schoolClass?.grade ?? 99) - (y?.schoolClass?.grade ?? 99) ||
      (x?.schoolClass?.classNo ?? 99) - (y?.schoolClass?.classNo ?? 99) ||
      (x?.number ?? 99) - (y?.number ?? 99)
    );
  });
}
```

`invite.service.ts`의 `listStudentsForInvite`도 학년도를 읽어 넘기게 고친다.

```ts
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";

export async function listStudentsForInvite(actor: SessionUser) {
  if (!can(actor, "invite:create")) throw new Error("FORBIDDEN");
  return repo.listStudents(await getCurrentYear());
}
```

`invite.repo.ts:46`의 학부모 코드 목록 안 소속도 같은 `enrollments` 모양으로 바꾼다.

- [ ] **Step 5: 서비스 테스트를 고친다**

`tests/modules/admin-users/admin-user.service.test.ts`에서 목 구조를 바꾼다.
`getCurrentYear` 목을 추가하고, `detail()`의 `studentProfile`을 아래로 바꾼다.

```ts
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));
```

```ts
    studentProfile: {
      id: "sp-1",
      birthDate: BIRTH,
      enrollments: [
        { id: "en-1", number: 15, status: "ENROLLED", schoolClass: { grade: 1, classNo: 2 } },
      ],
    },
```

목 이름도 바꾼다 — `updateStudentProfile` → `updateEnrollment` (선언·`vi.mock` 객체·`beforeEach`의 `mockReset`·단언 세 곳 전부).

소속 관련 단언 두 개를 새 시그니처에 맞춘다.

```ts
  it("소속이 바뀌면 학생 소속만 갱신한다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, grade: 2 });

    expect(updateEnrollment).toHaveBeenCalledTimes(1);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(updateEnrollment.mock.calls[0]![1]).toBe(2026);
    expect(updateEnrollment.mock.calls[0]![2].grade).toBe(2);
  });

  it("생년월일은 KST 자정으로 저장한다 — 하루 밀리면 안 된다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, birthDate: "2011-01-01" });

    const saved: Date = updateEnrollment.mock.calls[0]![2].birthDate;
    expect(saved.toISOString()).toBe("2010-12-31T15:00:00.000Z");
  });
```

`findDetail`이 두 번째 인자를 받게 됐으므로 `학생이 아니면 소속 항목을 무시한다` 케이스의
`detail({ studentProfile: null })`은 그대로 두면 된다.

- [ ] **Step 6: 테스트를 돌린다**

Run: `npx vitest run tests/modules`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/modules tests/modules
git commit -m "refactor(admin): 소속을 Enrollment에서 읽고 쓴다

조회는 현재 학년도 소속 한 줄만 붙인다 — 화면은 늘 '지금 몇 반인지'를 묻는다.
학년도는 서비스가 조회해 repo에 인자로 넘긴다. repo가 다른 모듈의 repo를 부르면
계층이 흐려지고, Prisma 호출만 둔다는 규칙도 깨진다.

학생 목록 정렬은 조회 후 코드에서 한다. 관계 배열은 Prisma orderBy로 정렬할 수 없다."
```

---

### Task 6: 관리자 화면 복구

**Files:**
- Modify: `src/app/(app)/admin/users/page.tsx:15-27`
- Modify: `src/app/(app)/admin/users/[userId]/page.tsx:39-40,107`
- Modify: `src/app/(app)/admin/invites/page.tsx:60-61,87`

**Interfaces:**
- Consumes: Task 5의 조회 결과 모양 (`studentProfile.enrollments[0]`)
- Produces: 없음 (화면이 종점)

- [ ] **Step 1: 사용자 목록의 소속 표기를 고친다**

`src/app/(app)/admin/users/page.tsx`에서 소속을 만드는 부분을 아래로 바꾼다.

```tsx
    const enrollment = u.studentProfile?.enrollments[0];
    const cls = enrollment?.schoolClass;
```

번호를 붙이는 줄도 `u.studentProfile?.number` → `enrollment?.number`로 바꾼다.

- [ ] **Step 2: 사용자 상세의 소속 표기를 고친다**

`src/app/(app)/admin/users/[userId]/page.tsx`의 39~40행을 아래로 바꾼다.

```tsx
  const profile = user.studentProfile;
  const enrollment = profile?.enrollments[0];
  const cls = enrollment?.schoolClass;
```

`profile.number`를 읽던 세 곳(소속 표기, `editable.number`, 자녀 목록)을 `enrollment?.number`로 바꾼다.
자녀 목록(107행 부근)은 `link.student.enrollments[0]`에서 읽는다.

```tsx
                    .map((link) => {
                      const e = link.student.enrollments[0];
                      const c = e?.schoolClass;
                      const where = c
                        ? `${c.grade}-${c.classNo}${
                            e?.number == null ? "" : ` ${e.number}번`
                          }`
                        : "미배정";
                      return `${link.student.user.name} (${where})`;
                    })
```

- [ ] **Step 3: 초대 화면의 소속 표기를 고친다**

`src/app/(app)/admin/invites/page.tsx`의 60~61행과 87행에서 `s.schoolClass`·`child?.schoolClass`를
`s.enrollments[0]?.schoolClass`·`child?.enrollments[0]?.schoolClass`로 바꾸고,
`s.number`도 `s.enrollments[0]?.number`로 바꾼다.

- [ ] **Step 4: 전체 검증**

Run: `npm run verify && npm run build`
Expected: typecheck·lint·test 전부 통과, 빌드 성공. 타입 오류가 남아 있으면 Task 2 Step 7에서 적어둔 목록과 대조한다.

- [ ] **Step 5: 화면을 직접 확인한다**

Run: `npm run dev` (이미 떠 있으면 그대로) 후 관리자로 로그인해 아래를 눈으로 확인한다.

| 화면 | 봐야 할 것 |
|---|---|
| `/admin/users` | 김동혁이 `1학년 3반 3번`으로 보인다 |
| `/admin/users/<김동혁 id>` | 소속·생년월일이 맞고, 학년을 2로 바꿔 저장하면 반영된다 |
| `/admin/invites` | 학부모 코드 발급의 학생 선택 목록에 소속이 붙는다 |

저장이 되는지까지 봐야 한다 — 읽기만 고치고 쓰기가 깨진 채로 넘어가기 쉽다.

- [ ] **Step 6: DB에서 결과를 확인한다**

Run:
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
"select u.name, e.year, e.status, sc.grade, sc.\"classNo\", e.number
 from \"Enrollment\" e
 join \"StudentProfile\" sp on sp.id = e.\"studentProfileId\"
 join \"user\" u on u.id = sp.\"userId\"
 left join \"SchoolClass\" sc on sc.id = e.\"classId\";"
```
Expected: Step 5에서 바꾼 학년이 2026학년도 행에 반영돼 있다. **행이 하나여야 한다** — 수정이 새 행을 만들면 upsert의 `where`가 틀린 것이다.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/admin"
git commit -m "fix(admin): 화면이 Enrollment에서 소속을 읽게 한다

소속이 StudentProfile에서 Enrollment로 옮겨간 것을 화면 세 곳에 반영한다.
학생 목록·사용자 상세·초대코드 발급의 학생 선택."
```

---

## Self-Review

**스펙 대조** — 설계 문서의 각 절이 어느 태스크에 있는지:

| 스펙 절 | 태스크 |
|---|---|
| 데이터 모델 (`AcademicYear`·`SchoolClass`·`Enrollment`) | Task 2 |
| 학적 값과 계정 상태 | Task 1 (상수·라벨). **계정 상태 연동은 2단계** — 학적을 바꾸는 화면이 아직 없다 |
| 마이그레이션 | Task 2 |
| 권한 (`academic-year:manage`) | Task 3 |
| 가입 흐름 수정 | Task 4 |
| 표 내 직접 편집 | **2단계 계획** |
| 명단 업로드 | **3단계 계획** |
| 파일 형식 (`read-excel-file`) | **3단계 계획** |

`keepsAccountActive()`는 Task 1에서 만들지만 1단계에서는 아무도 부르지 않는다.
학적을 바꿀 수 있는 경로(표 편집·명단 업로드)가 2·3단계에 있기 때문이다.
지금 계정 상태를 연동해봐야 발동할 일이 없으므로 상수와 함께 정의만 해 둔다.

**남은 것** — 이 계획이 끝나면 학년도를 **화면에서** 바꿀 수단은 아직 없다.
`academic-year.service`는 만들어지지만 부르는 화면이 2단계에 있다.
1단계 동안 학년도를 바꿔야 하면 SQL로 한다:
`update "AcademicYear" set "isCurrent" = ("year" = 2027);`
