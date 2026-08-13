# 학생코드와 엑셀 내보내기 구현 계획 (4단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생마다 바뀌지 않는 랜덤 식별자(학생코드)를 두고, 전교생 명단을 xlsx로 내려받아 고쳐 올리는 흐름을 만든다.

**Architecture:** 학생코드는 계정 생성 시 한 번 부여되고 절대 바뀌지 않는다. 명단 파일의 첫 열이며 학생을 알아보는 유일한 기준이다 — 이름+생년월일 매칭과 "확인 필요" 분류가 통째로 사라진다. 엑셀 생성은 브라우저에서 한다(서버 왕복 없음).

**Tech Stack:** Prisma 7.9 + `@prisma/adapter-pg`, PostgreSQL 18, Next.js 16, zod 4, vitest 4, `read-excel-file` 9.3(읽기) · `write-excel-file` 4.1(쓰기).

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`의 "개정 (2026-08-13, 4·5단계)" 절
- 계층: `Route/Server Action → Service → Repo`. **repo에는 Prisma 호출만.**
- `can()`은 service 안에서도 호출한다. 명단 액션은 `student:manage` + `invite:create`.
- 감사로그에는 값이 아니라 항목 이름/건수만.
- zod 검증은 경계에서 한 번만.
- **행 삭제를 계정 삭제로 만드는 것은 이 계획의 범위가 아니다** (5단계). 지금은 지금대로 "명단에 없는 재학생" 경고로 둔다.
- 각 태스크 끝에 `npm run verify` 통과. 마지막 태스크는 `npm run build`도. **lint 경고 0.**
- 주석·커밋 메시지는 한국어로, "왜"를 적는다.

## File Structure

**생성**

| 파일 | 책임 |
|---|---|
| `src/lib/student-code.ts` | 학생코드 생성·형식 검사 |
| `src/modules/enrollment/roster.export.ts` | 내보낼 행을 만드는 순수 함수 |
| `tests/lib/student-code.test.ts` | 형식·알파벳 |
| `tests/modules/enrollment/roster.export.test.ts` | 내보내기 행 구성 |

**수정**

| 파일 | 무엇을 |
|---|---|
| `prisma/schema.prisma` | `StudentProfile.studentCode` |
| `package.json` | `write-excel-file` |
| `src/modules/registration/registration.repo.ts` | 가입 시 학생코드 부여 |
| `src/modules/enrollment/roster.parse.ts` | `학생코드` 열 |
| `src/modules/enrollment/roster.plan.ts` | 매칭을 학생코드로 |
| `src/modules/enrollment/roster.repo.ts` | `listExisting`에 studentCode·입학 소속 |
| `src/modules/enrollment/roster.service.ts` | 내보내기 조회 |
| `src/app/(app)/admin/students/import/{page,import-form,actions}.tsx` | 내려받기 버튼·xlsx |

---

### Task 1: 학생코드 도입

**Files:**
- Create: `src/lib/student-code.ts`, `tests/lib/student-code.test.ts`
- Modify: `prisma/schema.prisma`, 새 마이그레이션, `src/modules/registration/registration.repo.ts`

**Interfaces:**
- Produces: `STUDENT_CODE_ALPHABET`, `STUDENT_CODE_LENGTH`, `generateStudentCode(): string`, `isStudentCode(v: unknown): boolean`
- `StudentProfile.studentCode String @unique` (NOT NULL)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/lib/student-code.test.ts
import { describe, expect, it } from "vitest";
import { generateStudentCode, isStudentCode, STUDENT_CODE_ALPHABET, STUDENT_CODE_LENGTH } from "@/lib/student-code";

describe("generateStudentCode()", () => {
  it("정해진 길이와 알파벳만 쓴다", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateStudentCode();
      expect(id).toHaveLength(STUDENT_CODE_LENGTH);
      for (const ch of id) expect(STUDENT_CODE_ALPHABET).toContain(ch);
    }
  });

  it("헷갈리는 글자를 쓰지 않는다 — 종이로 옮겨 적는 값이다", () => {
    expect(STUDENT_CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it("항상 글자로 시작한다 — 숫자로 시작하면 엑셀이 수로 바꿔 앞자리 0을 먹는다", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateStudentCode()[0]).toMatch(/[A-Z]/);
    }
  });

  it("같은 값이 잘 나오지 않는다", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateStudentCode()));
    expect(seen.size).toBe(500);
  });
});

describe("isStudentCode()", () => {
  it("생성한 값을 받아들인다", () => {
    expect(isStudentCode(generateStudentCode())).toBe(true);
  });

  it("길이·알파벳이 어긋나면 거부한다", () => {
    expect(isStudentCode("")).toBe(false);
    expect(isStudentCode("ABC")).toBe(false);
    expect(isStudentCode("abcdefgh")).toBe(false); // 소문자
    expect(isStudentCode("A1BCDEFG")).toBe(false); // 1은 알파벳 밖
    expect(isStudentCode(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/lib/student-code.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현한다**

```ts
// src/lib/student-code.ts
import { randomInt } from "node:crypto";

/**
 * 학생 식별자.
 *
 * 명단 파일의 첫 열이자 학생을 알아보는 유일한 기준이다.
 * 계정을 만들 때 한 번 부여하고 **절대 바뀌지 않는다** — 이름을 고쳐도, 반이 바뀌어도,
 * 1학년 배정을 나중에 바로잡아도 같은 학생으로 이어진다.
 *
 * 학번(입학년도+반+번호) 형태를 쓰지 않는 이유가 이것이다. 식별자가 어떤 사실을 담으면
 * 그 사실이 틀렸을 때 식별자를 고쳐야 하고, 그 순간 과거 기록과의 연결이 끊긴다.
 */

/** 초대코드와 같은 알파벳 — 0·1·I·O·L을 뺀다. 종이로 옮겨 적는 값이라서다. */
export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const STUDENT_CODE_LENGTH = 8;

const LETTERS = STUDENT_CODE_ALPHABET.replaceAll(/[0-9]/g, "");

export function generateStudentCode(): string {
  // 첫 글자는 반드시 문자다. 숫자로 시작하면 엑셀이 수로 인식해
  // 앞자리 0을 먹거나 지수 표기로 바꿔버린다 (2E5 → 200000).
  let id = LETTERS[randomInt(LETTERS.length)]!;
  for (let i = 1; i < STUDENT_CODE_LENGTH; i++) {
    // randomInt는 모듈로 편향 없이 균등하게 뽑는다.
    id += STUDENT_CODE_ALPHABET[randomInt(STUDENT_CODE_ALPHABET.length)];
  }
  return id;
}

export function isStudentCode(value: unknown): boolean {
  if (typeof value !== "string" || value.length !== STUDENT_CODE_LENGTH) return false;
  if (!LETTERS.includes(value[0]!)) return false;
  return [...value].every((ch) => STUDENT_CODE_ALPHABET.includes(ch));
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/lib/student-code.test.ts`
Expected: PASS

- [ ] **Step 5: 스키마에 넣는다**

`prisma/schema.prisma`의 `StudentProfile`에 추가한다.

```prisma
  /// 학생 식별자. 명단 파일의 첫 열이며 절대 바뀌지 않는다.
  /// src/lib/student-code.ts가 만든다.
  studentCode String @unique
```

- [ ] **Step 6: 마이그레이션을 만들고 백필한다**

Run: `npx prisma migrate dev --create-only --name student_code`

생성된 `migration.sql`을 아래로 **통째로 바꾼다**. 기존 학생에게도 값이 있어야 UNIQUE·NOT NULL을 걸 수 있다.

```sql
-- 학생 식별자를 도입한다.
--
-- 명단에서 학생을 알아보는 기준을 이름+생년월일에서 이 값으로 옮긴다.
-- 기존 학생에게도 같은 규칙으로 값을 만들어 넣어야 제약을 걸 수 있다.
-- 알파벳은 src/lib/student-code.ts와 같아야 한다 (0·1·I·O·L 제외, 첫 글자는 문자).

ALTER TABLE "StudentProfile" ADD COLUMN "studentCode" TEXT;

DO $$
DECLARE
  letters TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN SELECT id FROM "StudentProfile" WHERE "studentCode" IS NULL LOOP
    LOOP
      candidate := substr(letters, floor(random() * length(letters))::int + 1, 1);
      FOR i IN 2..8 LOOP
        candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "StudentProfile" WHERE "studentCode" = candidate);
    END LOOP;
    UPDATE "StudentProfile" SET "studentCode" = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "StudentProfile" ALTER COLUMN "studentCode" SET NOT NULL;
CREATE UNIQUE INDEX "StudentProfile_studentCode_key" ON "StudentProfile"("studentCode");
```

- [ ] **Step 7: 적용하고 확인한다**

Run:
```bash
npm run db:migrate && npx prisma generate
docker exec gbsw-db psql -U gbsw -d gbsw -c \
'select u.name, sp."studentCode" from "StudentProfile" sp join "user" u on u.id = sp."userId";'
```
Expected: 김동혁에게 8자리 학생코드가 붙어 있고 첫 글자가 문자다.

- [ ] **Step 8: 가입 시 부여한다**

`src/modules/registration/registration.repo.ts`의 `completeStudentRegistration`에서 `studentProfile.create`에 `studentCode`를 넣는다. import를 추가한다.

```ts
import { generateStudentCode } from "@/lib/student-code";
```

```ts
    const profile = await tx.studentProfile.create({
      data: {
        userId: account.userId,
        birthDate: student.birthDate,
        // 계정을 만들 때 한 번 부여하고 바뀌지 않는다.
        studentCode: generateStudentCode(),
      },
    });
```

**유일 제약 충돌은 거의 없지만(31^8) 나면 가입이 실패한다.** 초대코드와 같은 재시도 규약을 따른다 — `src/modules/invites/invite.service.ts`의 `generateUniqueCode()`를 본떠 `studentCode`용 재시도를 repo에 두거나, 트랜잭션 밖에서 미리 확보해 넘긴다. 어느 쪽이든 **재시도가 있어야 한다.**

- [ ] **Step 9: 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/lib/student-code.ts tests/lib/student-code.test.ts prisma src/modules/registration
git commit -m "feat(student): 바뀌지 않는 학생 식별자 학생코드

명단에서 학생을 알아보는 기준을 이름+생년월일에서 이 값으로 옮기기 위한 바탕이다.
동명이인이 같은 생일인 경우의 '확인 필요' 분류가 사라지고, 이름을 고쳐도 이어진다.

학번(입학년도+반+번호) 형태를 쓰지 않는다. 식별자가 사실을 담으면 그 사실이 틀렸을 때
식별자를 고쳐야 하고, 그 순간 과거 기록과의 연결이 끊긴다.

첫 글자는 반드시 문자다. 숫자로 시작하면 엑셀이 수로 인식해 앞자리 0을 먹거나
지수 표기로 바꿔버린다."
```

---

### Task 2: 매칭을 학생코드로

**Files:**
- Modify: `src/modules/enrollment/roster.parse.ts`, `roster.plan.ts`, `roster.repo.ts`, `roster.schema.ts`
- Modify: `tests/modules/enrollment/roster.{parse,plan,service}.test.ts`

**Interfaces:**
- `RosterRow`에 `studentCode: string` 추가 (빈 문자열이면 신규)
- `ExistingStudent`에 `studentCode: string` 추가
- `planRoster`가 학생코드로 잇는다. `needsAttention`은 **사라지지 않고** 뜻이 바뀐다 — "파일에 있는 학생코드가 명단에 없음"

- [ ] **Step 1: 열을 추가한다**

`roster.parse.ts`의 `ROSTER_COLUMNS` 맨 앞에 `"학생코드"`를 넣고, 그 뒤에 참고 열 둘을 끝에 붙인다.

```ts
export const ROSTER_COLUMNS = [
  "학생코드",
  "이름",
  "생년월일",
  "학년",
  "반",
  "번호",
  "학적",
] as const;

/** 내보낼 때만 붙이는 참고 열. 올릴 때는 무시한다 — 사실은 그 학년도 배정이 정한다. */
export const ROSTER_INFO_COLUMNS = ["입학반", "입학번호"] as const;
```

`RosterRow`에 `studentCode: string`을 넣고, `normalizeRows`가 채운다.
**학생코드가 있으면 형식을 검사한다** — 없는 형식이면 오타이므로 오류로 잡는다.

```ts
    const studentCode = cell(raw, "학생코드");
    if (studentCode && !isStudentCode(studentCode)) {
      errors.push("학생코드 형식이 올바르지 않습니다. 비워 두면 신규 학생으로 처리됩니다.");
    }
```

**`학생코드` 열이 머리글에 없어도 오류로 잡지 않는다** — 예전 서식이나 손으로 만든 파일을 계속 받아야 한다. 그 경우 전 줄이 신규가 되므로 미리보기가 그걸 보여준다.
(`missing` 계산에서 `학생코드`를 빼라.)

- [ ] **Step 2: 분류를 학생코드 기준으로 바꾼다**

`roster.plan.ts`에서 `key(name, birthDate)` 대신 `studentCode`로 잇는다.

- `studentCode`가 비어 있으면 → `newStudents`
- `studentCode`가 있고 `existing`에 있으면 → 기존과 대조해 `reassign`/`statusChange`/무변경
- `studentCode`가 있는데 `existing`에 없으면 → `needsAttention` (사유: "명단에 없는 학생코드입니다. 오타이거나 다른 학교 파일일 수 있습니다.")
- 같은 `studentCode`가 파일에 두 번 → 오류

이름+생년월일 중복 검사는 **없앤다.** 동명이인이 정상이 된다.
좌석(학년·반·번호) 중복 검사는 그대로 둔다.

- [ ] **Step 3: 조회에 studentCode와 입학 소속을 싣는다**

`roster.repo.ts`의 `listExisting`에 `studentCode`를 select하고, 참고용 입학 소속을 함께 가져온다.

```ts
      studentCode: true,
      // 참고 열용 — 가장 이른 1학년 배정. 없으면 빈 값으로 둔다.
      enrollments: {
        where: { year },
        take: 1,
        select: { /* 기존 그대로 */ },
      },
```

입학 소속은 별도 조회가 필요하다. `StudentProfile`마다 `grade = 1`인 가장 이른 `Enrollment`를 찾는다. **N+1을 만들지 마라** — 전체를 한 번에 가져와 코드에서 묶는다.

```ts
/** 참고 열용. 학생마다 가장 이른 1학년 배정을 한 번의 조회로 모은다. */
async function entrySeats(): Promise<Map<string, { classNo: number; number: number }>> {
  const rows = await prisma.enrollment.findMany({
    where: { schoolClass: { grade: 1 } },
    orderBy: { year: "asc" },
    select: {
      studentProfileId: true,
      number: true,
      schoolClass: { select: { classNo: true } },
    },
  });

  const map = new Map<string, { classNo: number; number: number }>();
  for (const r of rows) {
    // year 오름차순이라 먼저 만난 것이 가장 이른 1학년이다.
    if (map.has(r.studentProfileId)) continue;
    if (r.schoolClass && r.number !== null) {
      map.set(r.studentProfileId, { classNo: r.schoolClass.classNo, number: r.number });
    }
  }
  return map;
}
```

- [ ] **Step 4: 테스트를 고친다**

기존 테스트의 `row()`·`재학생` 픽스처에 `studentCode`를 넣고, 매칭 기준이 바뀐 것을 반영한다.
**새로 추가할 케이스:**
- 학생코드가 비면 신규
- 학생코드가 같으면 이름이 달라도 같은 학생 (개명)
- 이름·생년월일이 완전히 같아도 학생코드가 다르면 **각각 다른 학생** (동명이인이 정상이 된다)
- 명단에 없는 학생코드면 `needsAttention` + 확정 차단
- 같은 학생코드가 두 줄이면 오류

- [ ] **Step 5: 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/modules/enrollment tests/modules/enrollment
git commit -m "feat(enrollment): 명단 매칭을 학생코드로 옮긴다

이름+생년월일 매칭을 없앤다. 동명이인이 같은 생일인 경우를 '확인 필요'로 빼던 처리가
통째로 사라지고, 개명해도 같은 학생으로 이어진다.

학생코드가 빈 줄은 신규다. 있는데 명단에 없으면 오타이거나 다른 파일이므로 확정을 막는다.
학생코드 열이 아예 없는 파일도 계속 받는다 — 그 경우 전 줄이 신규가 되고 미리보기가 보여준다."
```

---

### Task 3: 엑셀 내보내기

**Files:**
- Create: `src/modules/enrollment/roster.export.ts`, `tests/modules/enrollment/roster.export.test.ts`
- Modify: `package.json`, `src/modules/enrollment/roster.service.ts`, `src/app/(app)/admin/students/import/{page.tsx,import-form.tsx}`

**Interfaces:**
- `buildExportRows(students): (string | number | null)[][]` — 머리글 + 데이터
- service: `exportRoster(actor)` — 권한 확인 후 내보낼 행을 만든다

- [ ] **Step 1: 의존성**

Run: `npm i write-excel-file@4.1.1 --save-exact`

브라우저에서 만든다 — 서버 왕복이 없고 지금 CSV 방식과 같은 자리다. 진입점은 `write-excel-file`(브라우저)이며 `/node`가 아니다.

- [ ] **Step 2: 내보낼 행을 만드는 순수 함수와 테스트**

`buildExportRows`는 `ROSTER_COLUMNS + ROSTER_INFO_COLUMNS`를 머리글로 하고, 학생마다 한 줄을 만든다. 학적은 한글 라벨로 되돌린다(`ENROLLMENT_STATUS_LABELS`). 배정이 없는 학생은 학년·반·번호를 빈 칸으로 둔다.

테스트로 확인할 것: 머리글이 `ROSTER_COLUMNS` 순서와 정확히 같은지(파서가 그 순서를 읽는다), 학적이 한글로 나가는지, 배정 없는 학생이 빈 칸인지, 참고 열이 마지막에 붙는지.

- [ ] **Step 3: 화면에 내려받기 버튼 두 개**

`import-form.tsx`의 CSV 다운로드를 xlsx로 바꾼다.

- **"전체 명단 내려받기"** — 현재 전교생. 이게 기본 흐름이다. 버튼을 눈에 띄게 둔다.
- **"빈 서식 내려받기"** — 학생이 없을 때(또는 새로 만들 때)용. 머리글 + 예시 두 줄.
- **초대코드 목록**도 xlsx로 바꾼다.

`write-excel-file`로 스타일을 준다. 지어내지 말고 아래만 한다:
- 머리글 행: 굵게, 배경 회색, 고정(freeze)
- 열 너비: 학생코드 12, 이름 10, 생년월일 12, 학년·반·번호 각 6, 학적 8, 참고 열 각 8
- 참고 열(`입학반`·`입학번호`)은 **머리글 배경을 더 연하게** 해서 편집 대상이 아님을 보인다
- 전 셀 문자열로 강제(`type: String`) — 엑셀이 학생코드나 번호를 수로 바꾸지 않게

파일명: `학생명단_2026학년도.xlsx`, `학생명단서식.xlsx`, `초대코드목록_2026학년도.xlsx`.

- [ ] **Step 4: 안내 문구를 흐름에 맞게 고친다**

지금 화면은 "서식을 받아 채우세요" 흐름이다. **"전체 명단을 받아 고쳐 올리세요"** 로 바꾼다.
`학생코드` 열을 지우거나 고치지 말라는 한 줄을 넣는다 — 그게 학생을 잇는 기준이다.

- [ ] **Step 5: 검증**

Run: `npm run verify && npm run build`
Expected: 둘 다 통과, lint 경고 0.

- [ ] **Step 6: 화면에서 확인한다**

`npm run dev` 후 `/admin/students/import`에서:

| 확인 | 기대 |
|---|---|
| "전체 명단 내려받기" | 김동혁 한 줄이 든 xlsx가 받아진다 |
| 그 파일을 엑셀에서 연다 | 머리글이 굵고 회색, 학생코드가 문자로 보인다(지수 표기 아님) |
| 그대로 다시 올린다 | **변경사항 0건** — 왕복이 손실 없이 돌아야 한다 |
| 반을 5로 고쳐 올린다 | 재배정 1건 |
| 학생코드를 지우고 올린다 | 신규 1건 (같은 사람인데 새 학생으로 잡힌다 — 의도된 동작) |
| 새 줄을 학생코드 없이 추가 | 신규 1건, 확정하면 초대코드 발급 |

**"그대로 다시 올리면 변경사항 0건"이 가장 중요하다.** 이게 깨지면 내보내기와 파서가 서로 다른 규칙을 쓰고 있다는 뜻이다.

**확인이 끝나면 김동혁을 1학년 3반 3번·재학·활성으로 되돌리고, 확인 중 만든 초대코드·빈 학급을 지운다.** 사용자의 실제 계정 2개는 건드리지 마라.

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json src/modules/enrollment "src/app/(app)/admin/students" tests/modules/enrollment
git commit -m "feat(admin): 전체 명단을 xlsx로 내려받아 고쳐 올린다

서식을 받아 채우는 흐름에서 전체를 받아 고치는 흐름으로 바꾼다. 파일이 곧 전교생
완성본이라 줄을 더하면 추가가 된다.

내보내기는 브라우저에서 한다 — 서버 왕복이 없고 기존 CSV 자리를 그대로 쓴다.
전 셀을 문자열로 강제한다. 엑셀이 학생코드나 번호를 수로 바꾸면 앞자리 0이 사라지거나
지수 표기가 된다.

입학반·입학번호는 참고 열이라 머리글을 흐리게 두고 올릴 때는 무시한다 — 사실은
그 학년도 배정이 정한다."
```

---

## Self-Review

**스펙 대조**

| 스펙(개정 절) | 태스크 |
|---|---|
| 학생코드 — 랜덤 영숫자, 불변, 첫 열 | Task 1 |
| 이름+생년월일 매칭 대체, "확인 필요" 소멸 | Task 2 |
| 학생코드 빈 줄 = 신규 | Task 2 |
| 입학 1학년 반·번호 참고 열, 올릴 때 무시 | Task 2·3 |
| 전체 명단 내려받기 → 고쳐 올리기 | Task 3 |
| `write-excel-file`로 xlsx 내보내기 | Task 3 |
| 행 삭제 = 계정 삭제 | **5단계** (범위 밖) |

**의도적으로 넣지 않은 것**

- **행 삭제 = 계정 삭제는 5단계다.** `AuditLog.actorUserId`를 nullable로 풀고 행위자 이름을
  스냅샷으로 박는 스키마 변경이 필요하며, 되돌릴 수 없는 유일한 동작이라 별도 검토를 받는 게 맞다.
  이 계획이 끝나도 "명단에 없는 재학생"은 지금처럼 경고로만 뜬다.
- **학생코드를 지우고 올리면 같은 사람이 새 학생이 된다.** 막지 않는다 — 파일에서 학생코드를 지우는 건
  "이 줄은 새 학생"이라는 뜻이고, 그게 추가의 유일한 방법이다. 미리보기가 신규로 보여주므로
  실수라면 확정 전에 보인다.

**확인한 사실** — `write-excel-file` 4.1.1(MIT, 1.8MB, 2026-06 배포)은 `read-excel-file`과 같은
제작자이고 머리글 스타일·열 너비를 지원한다. `exceljs`는 21.8MB에 최신 배포가 2023-10이라 뺐다.
