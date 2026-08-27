# 커뮤니티 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 게시판을 만들고 읽기·쓰기 권한을 정하면, 그 게시판에서 글·댓글·첨부가 오가는 커뮤니티 모듈을 만든다.

**Architecture:** 3계층(라우트/서버액션 → 서비스 → repo)을 그대로 따른다. 게시판 관리는 `can()`의 액션 둘로 막고, **게시판별 읽기·쓰기는 커뮤니티 행의 역할 배열을 보는 순수 함수**(`community.access.ts`)가 판정한다. 익명 게시판의 작성자는 `community.view.ts`의 변환 함수 한 곳에서만 지운다. 첨부는 서버 액션이 아니라 라우트 핸들러가 받는다 — `serverActions.bodySizeLimit`(6mb)이 앱 전체에 걸리기 때문이다.

**Tech Stack:** Next.js 16.3 (App Router, standalone) · React 19 · Prisma 7 (`prisma-client` 생성자, 출력 `src/generated/prisma`) · PostgreSQL 18 · zod · Vitest · Tailwind v4 (`@theme` 토큰)

**Spec:** `docs/superpowers/specs/2026-08-28-community-design.md`

## Global Constraints

이 절은 **모든 태스크의 요구사항에 암묵적으로 포함된다.**

- **계층 경계.** 라우트·페이지·서버액션에 업무 로직이나 Prisma 호출을 두지 않는다. zod 검증은 경계에서 한 번만. 서비스는 타입이 맞는 입력을 신뢰한다.
- **권한.** 페이지에서 막았어도 서비스가 다시 검사한다. `can()`으로 가를 수 있는 것은 `assertCan(actor, action)`, 그 밖(소유권·행 데이터)은 `ForbiddenError`를 직접 던지고 `authz:denied` 감사로그를 남긴다.
- **감사로그.** 모든 생성/수정/삭제는 `recordAudit`을 남긴다. **업무 쓰기와 같은 트랜잭션 클라이언트(`tx`)를 넘긴다.** 예외 없다 — 익명 게시판도 남긴다.
- **오류.** `CommunityError`는 **코드**를 `message`에 담는다. 한글 문구는 `app/**/actions.ts`의 `MESSAGES` 사전이 옮긴다.
- **디자인 토큰만 쓴다.** `text-caption` · `rounded-card` · `bg-pri` 처럼 이름으로만. 금지: `text-pri`(대비 2:1 — 초록 글자는 `text-pri-ink`), `font-bold`/`font-extrabold`(제목은 `font-semibold`), `text-[NNpx]`, 카드에 `shadow-*`.
- **있는 조각을 먼저 찾는다.** `SectionCard` · `cardClass` · `DataTable` · `TableFrame` · `buttonClass` · `BackLink` · `SecretPanel` · `StatTile` · `Note` · `EmptyState` · `ConfirmDialog` · `ConfirmSubmit`. 카드 여백은 `flush`/`panel`/`page` 셋뿐.
- **이름은 늘 호칭을 붙인다.** `honorificName(name, role)` (`@/core/authz/roles`). 맨이름을 그리는 화면을 만들지 않는다.
- **폭에 따른 재배치는 `@container`.** `lg:`는 표↔카드 전환에만.
- **커밋.** 논리 단위마다. Conventional Commits + 한글 제목. **Claude/AI 귀속 트레일러를 넣지 않는다.**
- **끝나면 `npm run verify`.** 개발 중에는 `npm run verify:unit`(DB 불필요)을 상시로 돌린다.
- 단위 테스트 한 개만 돌릴 때: `npx vitest run --project unit <경로>`

---

# 1단계 — 모델 · 권한 · 커뮤니티 관리

## 파일 구조 (1단계에서 생기는 것)

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` (수정) | 모델 넷 + `User` 역참조 셋 |
| `src/core/authz/can.ts` (수정) | `community:manage` · `community:moderate` |
| `src/modules/community/community.access.ts` | `canRead` · `canWrite` — 순수 함수, DB를 모른다 |
| `src/modules/community/community.error.ts` | `CommunityError` |
| `src/modules/community/community.schema.ts` | zod. `writeRoles ⊆ readRoles`를 여기서 강제 |
| `src/modules/community/community.repo.ts` | Prisma 호출만 |
| `src/modules/community/board.service.ts` | 커뮤니티 CRUD · 권한 설정 |
| `src/app/(app)/admin/community/**` | 관리 화면 + 얇은 서버 액션 |
| `src/components/app-shell/nav.ts` (수정) | 메뉴 한 줄 |
| `src/modules/audit-log/audit-log.labels.ts` (수정) | 감사 액션 라벨 |

---

### Task 1: Prisma 모델과 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<타임스탬프>_community/migration.sql` (생성됨)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: Prisma 모델 `Community` · `CommunityPost` · `CommunityComment` · `CommunityAttachment`. 이후 모든 repo 태스크가 이 타입을 쓴다.

- [ ] **Step 1: 스키마 파일 끝에 모델 넷을 추가한다**

`prisma/schema.prisma` 맨 아래에 붙인다. 파일 맨 위 주석의 「뼈대 단계 범위」 줄도 커뮤니티를 포함하도록 고친다.

```prisma
// ─────────────────────────────────────────────────────────────
// 7. 커뮤니티 — 게시판·글·댓글·첨부
//    설계: docs/superpowers/specs/2026-08-28-community-design.md
// ─────────────────────────────────────────────────────────────

/// 게시판 하나. **교사가 화면에서 만든다** — 새 게시판마다 마이그레이션을
/// 돌리는 구조면 그 자리는 결국 안 쓰인다.
model Community {
  id String @id @default(cuid())

  /// 주소에 쓰는 이름(`/community/notice`). 소문자 영숫자와 하이픈, 2~32자.
  /// **만든 뒤에는 바꿀 수 없다** — 바꾸면 그동안 붙은 링크가 전부 죽는다.
  slug        String  @unique
  name        String
  description String?

  /// 읽기·쓰기 허용 역할. **ADMIN은 늘 통과하므로 여기 넣지 않는다** —
  /// can()이 ADMIN을 무조건 통과시키는 것과 같은 규칙이다.
  /// writeRoles ⊆ readRoles를 community.schema.ts가 강제한다.
  readRoles  String[]
  writeRoles String[]

  /// 켜면 이 게시판의 모든 글·댓글에서 작성자를 감춘다. 글마다 고르지 않는다 —
  /// 실명과 익명이 한 목록에 섞이면 "왜 이 글만 감췄나"가 그 자체로 정보가 된다.
  anonymous        Boolean @default(false)
  allowAttachments Boolean @default(true)

  /// 목록 순서. 같으면 name 순.
  sortOrder Int @default(0)
  /// false면 없앤 게시판. 글이 매달려 있어 행은 지우지 않는다 (MeritRule 규약).
  active Boolean @default(true)

  posts CommunityPost[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([active, sortOrder])
}

/// 글. 작성자는 SetNull + 이름·역할 스냅샷이다 (MeritThreshold.updatedByName과
/// 같은 규약) — 과거의 사실이 살아 있는 외래키에 기대면 안 된다.
model CommunityPost {
  id          String    @id @default(cuid())
  communityId String
  community   Community @relation(fields: [communityId], references: [id], onDelete: Cascade)

  title String
  body  String @db.Text

  /// 계정이 완전 삭제되면 null이 된다. isMine 판정의 유일한 근거라 남겨 둔다.
  authorUserId String?
  authorUser   User?   @relation("CommunityPostAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  authorName   String
  /// ADMIN | STUDENT | PARENT — 계정이 지워진 뒤에도 honorificName을 그려야 한다.
  authorRole String

  /// 삭제는 행을 지우지 않는다. 댓글이 매달려 있다.
  deletedAt       DateTime?
  deletedByUserId String?
  deletedReason   String?

  comments    CommunityComment[]
  attachments CommunityAttachment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([communityId, deletedAt, createdAt])
}

/// 댓글. 대댓글은 두지 않는다 — 트리 구조가 화면과 조회를 한 단계 복잡하게
/// 만드는데 학교 게시판에서 얻는 것이 적다. 수정도 없다(쓰기·삭제뿐).
model CommunityComment {
  id     String        @id @default(cuid())
  postId String
  post   CommunityPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  body String @db.Text

  authorUserId String?
  authorUser   User?   @relation("CommunityCommentAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)
  authorName   String
  authorRole   String

  deletedAt       DateTime?
  deletedByUserId String?
  deletedReason   String?

  createdAt DateTime @default(now())

  @@index([postId, deletedAt, createdAt])
}

/// 첨부. 글보다 먼저 만들어진다 — 라우트 핸들러가 파일을 받아 postId 없이
/// 행을 만들고, 폼 제출 때 서버 액션이 글에 붙인다.
model CommunityAttachment {
  id String @id @default(cuid())

  /// 글에 붙기 전에는 null. 1시간 넘게 null이면 고아다.
  postId String?
  post   CommunityPost? @relation(fields: [postId], references: [id], onDelete: Cascade)

  /// 올린 사람. 글에 붙일 때 글쓴이와 같은지 확인하는 데 쓴다.
  ///
  /// **Cascade가 아니라 SetNull이다.** 글이 SetNull로 살아남는데 첨부만 계정을
  /// 따라 사라지면, 남은 글에서 첨부가 조용히 없어지고 디스크 파일은 그것을
  /// 가리키는 행이 사라져 영영 못 지운다. 붙은 뒤의 첨부는 올린 사람이 아니라
  /// 글의 것이다.
  uploaderUserId String?
  uploaderUser   User?   @relation("CommunityAttachmentUploader", fields: [uploaderUserId], references: [id], onDelete: SetNull)

  /// 디스크의 파일 이름. 랜덤 32자.
  /// **원래 이름은 절대 디스크에 쓰지 않는다** — 경로 탈출과 확장자 위조를
  /// 검사로 막는 대신 그 값이 파일 이름에 닿지 않게 한다.
  storageKey String @unique
  /// 올린 사람이 붙인 원래 이름. 화면에만 쓴다.
  filename String
  mimeType String
  size     Int

  createdAt DateTime @default(now())

  @@index([uploaderUserId, postId])
}
```

- [ ] **Step 2: `User` 모델에 역참조 셋을 추가한다**

Prisma는 관계마다 양쪽 선언을 요구한다. `User` 안의 다른 역참조 필드들 옆에 붙인다.

```prisma
  /// 커뮤니티. 계정이 완전 삭제돼도 글·댓글은 남는다 (SetNull + 이름 스냅샷).
  communityPosts       CommunityPost[]       @relation("CommunityPostAuthor")
  communityComments    CommunityComment[]    @relation("CommunityCommentAuthor")
  communityAttachments CommunityAttachment[] @relation("CommunityAttachmentUploader")
```

- [ ] **Step 3: 마이그레이션을 만든다**

```bash
npm run db:up          # Postgres가 안 떠 있으면
npm run db:migrate     # 이름을 물으면: community
```

- [ ] **Step 4: 생성된 SQL을 눈으로 확인한다 (건너뛰지 말 것)**

```bash
cat prisma/migrations/*_community/migration.sql | grep -i "drop"
```

기대: **아무것도 안 나온다.**

`DROP INDEX "AcademicYear_single_current"`가 있으면 그 줄을 지운다. Prisma는 부분 유니크 인덱스를 표현하지 못해 매번 이것을 군더더기로 본다. 드롭돼도 오류는 안 나고, 대신 현재 학년도가 둘이 될 수 있어 전교 집계 범위가 요청마다 흔들린다. 지웠으면 `npm run db:migrate`를 다시 돌려 적용한다.

- [ ] **Step 5: 개발 서버를 재시작한다**

돌던 `next dev`는 옛 Prisma 클라이언트를 물고 있다. 새 필드를 쓰는 화면만 `PrismaClientValidationError`로 조용히 실패하고, 타입 검사·테스트·빌드는 디스크의 새 클라이언트를 보므로 전부 통과한다.

```bash
# next dev를 끄고
rm -rf .next
npm run dev
```

- [ ] **Step 6: 타입이 서는지 확인한다**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(community): 게시판·글·댓글·첨부 모델을 넣는다"
```

---

### Task 2: 권한 — `can()` 액션 둘과 순수 판정 함수

**Files:**
- Modify: `src/core/authz/can.ts`
- Modify: `tests/core/authz/can.test.ts:9-31` (`EXPECTED`)
- Create: `src/modules/community/community.access.ts`
- Test: `tests/modules/community/access.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Community` 모델
- Produces:
  - `Action`에 `"community:manage"` · `"community:moderate"`
  - `type CommunityAccess = { readRoles: string[]; writeRoles: string[] }`
  - `canRead(actor: { role?: string | null } | null | undefined, community: CommunityAccess): boolean`
  - `canWrite(actor: { role?: string | null } | null | undefined, community: CommunityAccess): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `can()` 표**

`tests/core/authz/can.test.ts`의 `EXPECTED`에 두 줄을 더한다. `"audit:read"` 아래에 넣는다.

```ts
  "community:manage": ["ADMIN"],
  "community:moderate": ["ADMIN"],
```

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 순수 판정 함수**

`tests/modules/community/access.test.ts`를 만든다.

```ts
import { describe, expect, it } from "vitest";
import { canRead, canWrite } from "@/modules/community/community.access";

/** 학생만 읽고 쓰는 게시판. ADMIN은 배열에 넣지 않는다 — 늘 통과한다. */
const studentBoard = { readRoles: ["STUDENT"], writeRoles: ["STUDENT"] };
/** 전체가 읽고 교사만 쓰는 공지. */
const notice = { readRoles: ["STUDENT", "PARENT"], writeRoles: [] };

describe("canRead", () => {
  it("readRoles에 든 역할은 읽는다", () => {
    expect(canRead({ role: "STUDENT" }, studentBoard)).toBe(true);
    expect(canRead({ role: "PARENT" }, notice)).toBe(true);
  });

  it("readRoles에 없는 역할은 못 읽는다", () => {
    expect(canRead({ role: "PARENT" }, studentBoard)).toBe(false);
  });

  it("교사는 배열과 무관하게 읽는다 — can()이 ADMIN을 통과시키는 것과 같은 규칙", () => {
    expect(canRead({ role: "ADMIN" }, studentBoard)).toBe(true);
    expect(canRead({ role: "ADMIN" }, { readRoles: [], writeRoles: [] })).toBe(true);
  });

  it("로그인하지 않았으면 못 읽는다", () => {
    expect(canRead(null, notice)).toBe(false);
    expect(canRead(undefined, notice)).toBe(false);
    expect(canRead({ role: null }, notice)).toBe(false);
  });
});

describe("canWrite", () => {
  it("writeRoles에 든 역할은 쓴다", () => {
    expect(canWrite({ role: "STUDENT" }, studentBoard)).toBe(true);
  });

  it("읽을 수 있어도 writeRoles에 없으면 못 쓴다", () => {
    expect(canRead({ role: "STUDENT" }, notice)).toBe(true);
    expect(canWrite({ role: "STUDENT" }, notice)).toBe(false);
  });

  it("교사는 배열이 비어 있어도 쓴다", () => {
    expect(canWrite({ role: "ADMIN" }, notice)).toBe(true);
  });

  it("로그인하지 않았으면 못 쓴다", () => {
    expect(canWrite(null, studentBoard)).toBe(false);
  });

  it("모르는 역할 문자열은 통과시키지 않는다", () => {
    expect(canWrite({ role: "SUPERUSER" }, studentBoard)).toBe(false);
    expect(canRead({ role: "SUPERUSER" }, studentBoard)).toBe(false);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/access.test.ts tests/core/authz/can.test.ts`
Expected: FAIL — `Cannot find module '@/modules/community/community.access'`, 그리고 can 테스트는 「모든 액션이 표에 있다」에서 깨진다.

- [ ] **Step 4: `can.ts`에 액션 둘을 넣는다**

`Action` 유니온의 `"audit:read"` 아래:

```ts
  | "community:manage"
  | "community:moderate"
```

`RULES`의 `"audit:read"` 줄 아래:

```ts
  // 커뮤니티 — **게시판을 다루는 권한만 여기 있다.**
  // 게시판별 읽기·쓰기는 커뮤니티 행에 데이터로 붙어 있어 이 표에 담기지 않는다.
  // 그쪽 판정은 modules/community/community.access.ts가 한다.
  "community:manage": [], // 게시판 추가·수정·제거·권한 설정 — 교사 전용
  "community:moderate": [], // 남의 글·댓글 삭제 — 교사 전용
```

- [ ] **Step 5: 순수 판정 함수를 쓴다**

`src/modules/community/community.access.ts`:

```ts
import { isRole } from "@/core/authz/roles";

/**
 * 게시판별 읽기·쓰기 판정. **`can()`이 담지 못하는 권한이다** —
 * `core/authz/can.ts`는 컴파일 시점의 액션×역할 표인데, 이 권한은 게시판마다
 * 다르고 교사가 화면에서 바꾸고 행이 늘어난다.
 *
 * 여기 있는 것은 **순수 함수**다. DB도 세션 조회도 모르고, 커뮤니티 행과 사용자
 * 역할만 본다 — 그래서 판정 표 전체를 DB 없이 테스트할 수 있다.
 *
 * **없앤 게시판인지·지워진 글인지는 여기서 안 본다.** 그것은 행 상태이고,
 * 서비스가 권한 검사 다음에 따로 본다 (`board.service`·`post.service`).
 * 섞으면 이 파일이 순수하지 않게 된다.
 *
 * 다른 모듈이 이 방식을 따라하면 안 된다 — 역할로 가를 수 있는 권한은 `can()`에 넣는다.
 */

/** 판정에 필요한 것만. 커뮤니티 행 전체를 받지 않는다. */
export type CommunityAccess = {
  readRoles: string[];
  writeRoles: string[];
};

type Actor = { role?: string | null } | null | undefined;

/**
 * ADMIN은 배열과 무관하게 통과한다 — `can()`이 ADMIN을 무조건 통과시키는 것과
 * 같은 규칙이다. 교직원 사이에 권한 차등이 없다는 전제가 여기서도 그대로 선다.
 * 그래서 `readRoles`·`writeRoles`에 ADMIN을 넣을 자리를 아예 두지 않는다.
 */
function allows(actor: Actor, roles: string[]): boolean {
  const role = actor?.role;
  if (!isRole(role)) return false;
  if (role === "ADMIN") return true;
  return roles.includes(role);
}

export function canRead(actor: Actor, community: CommunityAccess): boolean {
  return allows(actor, community.readRoles);
}

export function canWrite(actor: Actor, community: CommunityAccess): boolean {
  return allows(actor, community.writeRoles);
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/access.test.ts tests/core/authz/can.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/core/authz/can.ts src/modules/community/community.access.ts tests/core/authz/can.test.ts tests/modules/community/access.test.ts
git commit -m "feat(community): 게시판 권한 액션 둘과 역할 판정 순수 함수를 넣는다"
```

---

### Task 3: 오류 타입과 zod 스키마

**Files:**
- Create: `src/modules/community/community.error.ts`
- Create: `src/modules/community/community.schema.ts`
- Test: `tests/modules/community/schema.test.ts`

**Interfaces:**
- Consumes: `canRead`/`canWrite`의 역할 문자열 규약
- Produces:
  - `class CommunityError extends Error`
  - `createCommunitySchema` → `CreateCommunityInput = { slug, name, description: string|null, readRoles: Role[], writeRoles: Role[], anonymous: boolean, allowAttachments: boolean, sortOrder: number }`
  - `updateCommunitySchema` → `UpdateCommunityInput = { communityId, updatedAt: Date, name, description, readRoles, writeRoles, anonymous, allowAttachments, sortOrder }` (**slug 없음**)
  - `deleteCommunitySchema` → `DeleteCommunityInput = { communityId, updatedAt: Date, reason: string|null }`
  - 상수 `MAX_ATTACHMENT_BYTES` · `MAX_ATTACHMENTS_PER_POST` · `MAX_PENDING_ATTACHMENTS`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/modules/community/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createCommunitySchema,
  updateCommunitySchema,
} from "@/modules/community/community.schema";

const base = {
  slug: "notice",
  name: "공지사항",
  description: "",
  readRoles: ["STUDENT", "PARENT"],
  writeRoles: [],
  anonymous: "",
  allowAttachments: "on",
  sortOrder: "0",
};

describe("createCommunitySchema", () => {
  it("정상 입력을 통과시킨다", () => {
    const parsed = createCommunitySchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.slug).toBe("notice");
    // 빈 설명은 null로 떨어진다 — "선택 안 함"과 "빈 값"이 갈리지 않게.
    expect(parsed.data.description).toBeNull();
    expect(parsed.data.anonymous).toBe(false);
    expect(parsed.data.allowAttachments).toBe(true);
    expect(parsed.data.sortOrder).toBe(0);
  });

  it("writeRoles가 readRoles에 없으면 거부한다", () => {
    const parsed = createCommunitySchema.safeParse({
      ...base,
      readRoles: ["STUDENT"],
      writeRoles: ["PARENT"],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toContain("읽을 수 없는 역할");
  });

  it("readRoles가 비어도 통과한다 — 교사 전용 게시판이다", () => {
    const parsed = createCommunitySchema.safeParse({
      ...base,
      readRoles: [],
      writeRoles: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("ADMIN은 역할 목록에 넣을 수 없다 — 늘 통과하므로 자리가 없다", () => {
    const parsed = createCommunitySchema.safeParse({ ...base, readRoles: ["ADMIN"] });
    expect(parsed.success).toBe(false);
  });

  it.each([
    ["대문자", "Notice"],
    ["공백", "my board"],
    ["한글", "공지"],
    ["슬래시", "a/b"],
    ["점", "a.b"],
    ["한 글자", "a"],
  ])("slug에 %s는 거부한다", (_label, slug) => {
    expect(createCommunitySchema.safeParse({ ...base, slug }).success).toBe(false);
  });

  it.each(["notice", "free-board", "class-1", "a2"])("slug %s는 통과한다", (slug) => {
    expect(createCommunitySchema.safeParse({ ...base, slug }).success).toBe(true);
  });

  it("이름이 비면 거부한다", () => {
    expect(createCommunitySchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("updateCommunitySchema", () => {
  const input = {
    communityId: "c1",
    updatedAt: "2026-08-28T00:00:00.000Z",
    name: "공지사항",
    description: "",
    readRoles: ["STUDENT"],
    writeRoles: [],
    anonymous: "",
    allowAttachments: "",
    sortOrder: "3",
  };

  it("updatedAt을 Date로 바꾼다", () => {
    const parsed = updateCommunitySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.updatedAt).toBeInstanceOf(Date);
    expect(parsed.data.sortOrder).toBe(3);
  });

  it("slug는 아예 받지 않는다 — 만든 뒤에는 바꿀 수 없다", () => {
    const parsed = updateCommunitySchema.safeParse({ ...input, slug: "hacked" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("slug");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/schema.test.ts`
Expected: FAIL — 모듈을 찾지 못한다.

- [ ] **Step 3: `community.error.ts`를 쓴다**

```ts
/**
 * 커뮤니티 오류. 코드를 message에 담고, 화면 문구는 액션의 MESSAGES 사전이 옮긴다
 * (MeritError·PassError와 같은 규약). 서비스가 넷이라 한 곳에 둔다 — 한쪽에 두면
 * 다른 셋이 그 서비스를 import한다.
 *
 * 권한 거부는 여기 없다. ForbiddenError다.
 */
export class CommunityError extends Error {}
```

- [ ] **Step 4: `community.schema.ts`를 쓴다**

```ts
import { z } from "zod";
import { ROLES } from "@/core/authz/roles";

/**
 * 서버 액션·라우트 핸들러 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다 — 숫자·불리언 변환도 여기서 한다.
 */

/** 첨부 상한. 라우트 핸들러가 직접 잰다 — bodySizeLimit은 라우트에 안 걸린다. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_POST = 5;
/**
 * 한 사람이 글에 붙이지 못한 채 들고 있을 수 있는 첨부 수. 고아 정리가
 * "그 사람이 다음에 올릴 때"만 도는지라, 이 상한이 없으면 50분 동안 500개를
 * 올리고 그만두는 계정에게는 정리가 영영 안 돈다.
 */
export const MAX_PENDING_ATTACHMENTS = 10;

/** 글 목록 한 쪽 크기. 감사로그(50)보다 작다 — 글이 세로로 길다. */
export const POSTS_PER_PAGE = 20;

/**
 * 선택 입력 문자열. 빈 문자열은 null로 — 안 그러면 "선택 안 함"과 "빈 값"이 갈린다.
 * 길이 초과는 오류로 낸다: 조용히 잘라내면 내용만 사라지는 실패가 된다.
 * (merit.schema.ts의 같은 이름 헬퍼와 같은 규약이다.)
 */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

/** 체크박스. 안 켜면 FormData에 아예 없어서 null이 온다. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** "3" → 3. 빈 값은 0. */
const sortOrder = z
  .preprocess((v) => (v == null || v === "" ? "0" : v), z.string().trim())
  .pipe(
    z
      .string()
      .regex(/^-?\d+$/, "순서는 정수여야 합니다.")
      .transform(Number)
      .refine((n) => n >= -999 && n <= 999, "순서는 -999~999 사이여야 합니다."),
  );

/**
 * 주소에 쓰는 이름. 소문자 영숫자와 하이픈만 받는다 — 대문자·공백·한글이 들어오면
 * 주소가 인코딩돼 사람이 못 읽고, 대소문자만 다른 게시판 둘이 생길 수 있다.
 */
const slugSchema = z
  .string()
  .trim()
  .min(2, "주소는 2자 이상이어야 합니다.")
  .max(32, "주소는 32자를 넘을 수 없습니다.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "주소는 소문자 영문·숫자·하이픈만 쓸 수 있습니다.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "게시판 이름을 입력해 주세요.")
  .max(50, "게시판 이름은 50자를 넘을 수 없습니다.");

/**
 * 역할 목록. **ADMIN은 못 넣는다** — 교사는 늘 통과하므로 배열에 자리가 없고,
 * 넣을 수 있게 두면 "ADMIN을 뺐으니 교사는 못 본다"는 오해가 생긴다.
 */
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "ADMIN");

const roleList = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.enum(ASSIGNABLE_ROLES)).max(ASSIGNABLE_ROLES.length),
);

/** 권한 두 칸. 못 읽는 곳에 쓰게 두면 자기가 쓴 글을 자기가 못 본다. */
const permissionShape = {
  readRoles: roleList,
  writeRoles: roleList,
};

function refineWriteSubsetRead<T extends { readRoles: string[]; writeRoles: string[] }>(
  schema: z.ZodType<T>,
) {
  return schema.refine(
    (v) => v.writeRoles.every((role) => v.readRoles.includes(role)),
    {
      message: "읽을 수 없는 역할에 글쓰기를 줄 수 없습니다.",
      path: ["writeRoles"],
    },
  );
}

export const createCommunitySchema = refineWriteSubsetRead(
  z.object({
    slug: slugSchema,
    name: nameSchema,
    description: optionalText(200),
    ...permissionShape,
    anonymous: checkbox,
    allowAttachments: checkbox,
    sortOrder,
  }),
);

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

/**
 * 수정은 slug를 받지 않는다 — 스키마에 없으므로 조작된 요청이 보내도 zod가 버린다.
 * 주소가 바뀌면 그동안 붙은 링크가 전부 죽는다.
 */
export const updateCommunitySchema = refineWriteSubsetRead(
  z.object({
    communityId: z.string().trim().min(1),
    updatedAt: z.iso
      .datetime("다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 저장해 주세요.")
      .transform((value) => new Date(value)),
    name: nameSchema,
    description: optionalText(200),
    ...permissionShape,
    anonymous: checkbox,
    allowAttachments: checkbox,
    sortOrder,
  }),
);

export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;

export const deleteCommunitySchema = z.object({
  communityId: z.string().trim().min(1),
  updatedAt: z.iso
    .datetime("다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 시도해 주세요.")
    .transform((value) => new Date(value)),
  reason: optionalText(200),
});

export type DeleteCommunityInput = z.infer<typeof deleteCommunitySchema>;
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/schema.test.ts`
Expected: PASS

- [ ] **Step 6: 타입·린트를 돌린다**

Run: `npm run verify:unit`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/modules/community/community.error.ts src/modules/community/community.schema.ts tests/modules/community/schema.test.ts
git commit -m "feat(community): 게시판 zod 스키마와 오류 타입을 넣는다"
```

---

### Task 4: repo — 커뮤니티 조회·쓰기

**Files:**
- Create: `src/modules/community/community.repo.ts`

**Interfaces:**
- Consumes: Task 1의 모델, Task 3의 `CreateCommunityInput` · `UpdateCommunityInput`
- Produces:
  - `listCommunities(db?): Promise<CommunityRow[]>` — active만, sortOrder→name
  - `listAllCommunities(db?): Promise<CommunityRow[]>` — 없앤 것 포함 (관리 화면용)
  - `findCommunityBySlug(slug, db?): Promise<CommunityRow | null>`
  - `findCommunity(id, db?): Promise<CommunityRow | null>`
  - `createCommunity(input, db?): Promise<{ id: string }>`
  - `updateCommunity(id, data, updatedAt, db?): Promise<boolean>` — 낙관적 잠금
  - `markCommunityDeleted(id, updatedAt, db?): Promise<number>`
  - `type CommunityRow` — Prisma의 `Community` 전체

- [ ] **Step 1: repo를 쓴다**

`src/modules/community/community.repo.ts`:

```ts
import { prisma, type DbClient } from "@/core/db/client";
import type { Community } from "@/generated/prisma/client";
import type { CreateCommunityInput } from "./community.schema";

/**
 * Prisma 호출만 있는 계층. 권한·감사·업무 판단은 서비스가 한다.
 *
 * 커뮤니티·글·댓글·첨부가 한 파일에 있다 — merit이 repo 하나에 규정·부여·통계를
 * 모두 담은 것과 같은 규약이다. 서비스는 책임별로 나뉘지만 repo는 하나다.
 */

export type CommunityRow = Community;

/** 목록 정렬은 한 곳에서만 정한다 — 화면마다 다르면 게시판 순서가 화면마다 달라진다. */
const COMMUNITY_ORDER = [{ sortOrder: "asc" }, { name: "asc" }] as const;

/** 살아 있는 게시판만. 화면 대부분이 이걸 쓴다. */
export function listCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({
    where: { active: true },
    orderBy: [...COMMUNITY_ORDER],
  });
}

/** 없앤 것까지. 관리 화면만 쓴다 — 되살릴 수는 없어도 있었다는 사실은 보여야 한다. */
export function listAllCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({ orderBy: [{ active: "desc" }, ...COMMUNITY_ORDER] });
}

/**
 * 주소로 찾는다. **없앤 게시판도 돌려준다** — active 판정은 서비스가 한다.
 * repo가 걸러 버리면 서비스가 "없는 게시판"과 "없앤 게시판"을 구분하지 못한다.
 */
export function findCommunityBySlug(
  slug: string,
  db: DbClient = prisma,
): Promise<CommunityRow | null> {
  return db.community.findUnique({ where: { slug } });
}

export function findCommunity(
  id: string,
  db: DbClient = prisma,
): Promise<CommunityRow | null> {
  return db.community.findUnique({ where: { id } });
}

export async function createCommunity(
  input: CreateCommunityInput,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  const created = await db.community.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description,
      readRoles: input.readRoles,
      writeRoles: input.writeRoles,
      anonymous: input.anonymous,
      allowAttachments: input.allowAttachments,
      sortOrder: input.sortOrder,
    },
    select: { id: true },
  });
  return created;
}

/** 수정할 수 있는 항목. slug는 없다 — 만든 뒤에는 바꿀 수 없다. */
export type CommunityPatch = {
  name: string;
  description: string | null;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: number;
};

/**
 * 낙관적 잠금. 화면이 읽은 시점의 updatedAt이 DB와 같을 때만 쓴다.
 * false를 돌려주면 그 사이 누가 바꾼 것이다 — 서비스가 CONFLICT로 올린다.
 */
export async function updateCommunity(
  id: string,
  data: CommunityPatch,
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const result = await db.community.updateMany({
    where: { id, updatedAt },
    data,
  });
  return result.count === 1;
}

/** 없앤다. 행은 남는다 — 글이 매달려 있다. 이미 없앤 것이면 0을 돌려준다. */
export async function markCommunityDeleted(
  id: string,
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.community.updateMany({
    where: { id, updatedAt, active: true },
    data: { active: false },
  });
  return result.count;
}
```

- [ ] **Step 2: 타입이 서는지 확인한다**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/modules/community/community.repo.ts
git commit -m "feat(community): 게시판 repo를 넣는다"
```

---

### Task 5: `board.service.ts` — 커뮤니티 CRUD

**Files:**
- Create: `src/modules/community/board.service.ts`
- Test: `tests/modules/community/board.service.test.ts`

**Interfaces:**
- Consumes: Task 2의 `canRead`, Task 3의 스키마 타입·`CommunityError`, Task 4의 repo
- Produces:
  - `createCommunity(actor, input): Promise<void>`
  - `updateCommunity(actor, input): Promise<void>`
  - `deleteCommunity(actor, input): Promise<void>`
  - `listForManage(actor): Promise<CommunityRow[]>`
  - `listReadable(actor): Promise<CommunityRow[]>` — 읽을 수 있는 것만
  - `getReadableBySlug(actor, slug): Promise<CommunityRow>` — 못 읽으면 `ForbiddenError`
  - `getWritableBySlug(actor, slug): Promise<CommunityRow>` — 못 쓰면 `ForbiddenError`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/modules/community/board.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listCommunities = vi.fn();
const listAllCommunities = vi.fn();
const findCommunityBySlug = vi.fn();
const findCommunity = vi.fn();
const createCommunity = vi.fn();
const updateCommunity = vi.fn();
const markCommunityDeleted = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "board-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  listCommunities,
  listAllCommunities,
  findCommunityBySlug,
  findCommunity,
  createCommunity,
  updateCommunity,
  markCommunityDeleted,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/board.service");

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

const input = {
  slug: "notice",
  name: "공지사항",
  description: null,
  readRoles: ["STUDENT", "PARENT"],
  writeRoles: [],
  anonymous: false,
  allowAttachments: true,
  sortOrder: 0,
};

function board(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    slug: "notice",
    name: "공지사항",
    description: null,
    readRoles: ["STUDENT", "PARENT"],
    writeRoles: ["STUDENT"],
    anonymous: false,
    allowAttachments: true,
    sortOrder: 0,
    active: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createCommunity.mockResolvedValue({ id: "c1" });
  updateCommunity.mockResolvedValue(true);
  markCommunityDeleted.mockResolvedValue(1);
});

describe("createCommunity", () => {
  it("교사는 만든다 — 감사로그를 트랜잭션 안에서 남긴다", async () => {
    await service.createCommunity(admin, input);

    expect(createCommunity).toHaveBeenCalledWith(input, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        action: "community:create",
        targetType: "Community",
        targetId: "c1",
        metadata: expect.objectContaining({ slug: "notice", anonymous: false }),
      }),
      txClient,
    );
  });

  it.each([student, parent])("교사가 아니면 거부한다", async (actor) => {
    await expect(service.createCommunity(actor, input)).rejects.toThrow(ForbiddenError);
    expect(createCommunity).not.toHaveBeenCalled();
  });

  it("같은 주소가 있으면 SLUG_TAKEN", async () => {
    createCommunity.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await expect(service.createCommunity(admin, input)).rejects.toThrow(
      new CommunityError("SLUG_TAKEN"),
    );
  });
});

describe("updateCommunity", () => {
  const patch = {
    communityId: "c1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    name: "공지",
    description: null,
    readRoles: ["STUDENT"],
    writeRoles: [],
    anonymous: false,
    allowAttachments: true,
    sortOrder: 1,
  };

  it("교사는 고친다 — 권한 전후를 감사로그에 남긴다", async () => {
    findCommunity.mockResolvedValue(board());

    await service.updateCommunity(admin, patch);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:update",
        targetId: "c1",
        metadata: expect.objectContaining({
          readRolesFrom: ["STUDENT", "PARENT"],
          readRolesTo: ["STUDENT"],
          writeRolesFrom: ["STUDENT"],
          writeRolesTo: [],
        }),
      }),
      txClient,
    );
  });

  it("없는 게시판이면 COMMUNITY_NOT_FOUND", async () => {
    findCommunity.mockResolvedValue(null);
    await expect(service.updateCommunity(admin, patch)).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });

  it("그 사이 누가 바꿨으면 COMMUNITY_CONFLICT", async () => {
    findCommunity.mockResolvedValue(board());
    updateCommunity.mockResolvedValue(false);
    await expect(service.updateCommunity(admin, patch)).rejects.toThrow(
      new CommunityError("COMMUNITY_CONFLICT"),
    );
  });

  it("학생은 거부한다", async () => {
    await expect(service.updateCommunity(student, patch)).rejects.toThrow(ForbiddenError);
  });
});

describe("deleteCommunity", () => {
  const del = {
    communityId: "c1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    reason: "학기가 끝났습니다",
  };

  it("교사는 없앤다 — 사유를 감사로그에 남긴다", async () => {
    findCommunity.mockResolvedValue(board());

    await service.deleteCommunity(admin, del);

    expect(markCommunityDeleted).toHaveBeenCalledWith("c1", del.updatedAt, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:delete",
        metadata: expect.objectContaining({ slug: "notice", reason: "학기가 끝났습니다" }),
      }),
      txClient,
    );
  });

  it("이미 없앤 게시판이면 아무것도 하지 않는다 — 감사로그가 두 줄 쌓이지 않게", async () => {
    findCommunity.mockResolvedValue(board({ active: false }));

    await service.deleteCommunity(admin, del);

    expect(markCommunityDeleted).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("학생은 거부한다", async () => {
    await expect(service.deleteCommunity(student, del)).rejects.toThrow(ForbiddenError);
  });
});

describe("listReadable", () => {
  it("읽을 수 있는 게시판만 준다", async () => {
    listCommunities.mockResolvedValue([
      board({ id: "a", readRoles: ["STUDENT"] }),
      board({ id: "b", readRoles: ["PARENT"] }),
      board({ id: "c", readRoles: [] }),
    ]);

    const rows = await service.listReadable(student);

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("교사는 전부 본다 — 읽기 역할이 비어 있어도", async () => {
    listCommunities.mockResolvedValue([board({ id: "c", readRoles: [] })]);
    expect((await service.listReadable(admin)).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("getReadableBySlug", () => {
  it("읽을 수 있으면 준다", async () => {
    findCommunityBySlug.mockResolvedValue(board());
    await expect(service.getReadableBySlug(student, "notice")).resolves.toMatchObject({
      id: "c1",
    });
  });

  it("못 읽으면 ForbiddenError + 거부 감사로그", async () => {
    findCommunityBySlug.mockResolvedValue(board({ readRoles: ["PARENT"] }));

    await expect(service.getReadableBySlug(student, "notice")).rejects.toThrow(
      ForbiddenError,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
  });

  it("없앤 게시판은 COMMUNITY_NOT_FOUND — 읽을 수 있어도", async () => {
    findCommunityBySlug.mockResolvedValue(board({ active: false }));
    await expect(service.getReadableBySlug(student, "notice")).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });

  it("교사에게도 없앤 게시판은 COMMUNITY_NOT_FOUND", async () => {
    findCommunityBySlug.mockResolvedValue(board({ active: false }));
    await expect(service.getReadableBySlug(admin, "notice")).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });
});

describe("getWritableBySlug", () => {
  it("쓸 수 있으면 준다", async () => {
    findCommunityBySlug.mockResolvedValue(board());
    await expect(service.getWritableBySlug(student, "notice")).resolves.toMatchObject({
      id: "c1",
    });
  });

  it("읽을 수는 있어도 못 쓰면 거부한다", async () => {
    findCommunityBySlug.mockResolvedValue(board({ writeRoles: [] }));
    await expect(service.getWritableBySlug(student, "notice")).rejects.toThrow(
      ForbiddenError,
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/board.service.test.ts`
Expected: FAIL — `board.service` 모듈이 없다.

- [ ] **Step 3: 서비스를 쓴다**

`src/modules/community/board.service.ts`:

```ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { canRead, canWrite } from "./community.access";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import type {
  CreateCommunityInput,
  DeleteCommunityInput,
  UpdateCommunityInput,
} from "./community.schema";

/**
 * 게시판 자체를 다루는 서비스. 글·댓글·첨부는 각자의 서비스에 있다.
 *
 * **다른 서비스가 게시판을 집어 오는 문도 여기다** — `getReadableBySlug` ·
 * `getWritableBySlug`. 권한 판정과 "없앤 게시판" 판정을 한 곳에 모아 두면
 * 글 서비스와 첨부 서비스가 같은 검사를 각자 다시 적지 않는다.
 */

/**
 * `can()`으로 못 가르는 거부. `assertCan`과 같은 모양으로 기록하고 던진다 —
 * 게시판별 권한은 행 데이터라 Action 표에 없다.
 * (invite.service.ts의 revokeInvite가 소유권 검사에서 쓰는 것과 같은 길이다.)
 */
async function denyAccess(actor: SessionUser, action: string, slug: string): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "Community",
      metadata: { action, slug },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/** Prisma의 유니크 위반. slug가 유일한 유니크 열이라 이것뿐이다. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function createCommunity(
  actor: SessionUser,
  input: CreateCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  await withTransaction(async (tx) => {
    let id: string;
    try {
      ({ id } = await repo.createCommunity(input, tx));
    } catch (error) {
      if (isUniqueViolation(error)) throw new CommunityError("SLUG_TAKEN");
      throw error;
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:create",
        targetType: "Community",
        targetId: id,
        metadata: {
          slug: input.slug,
          name: input.name,
          readRoles: input.readRoles,
          writeRoles: input.writeRoles,
          anonymous: input.anonymous,
        },
      },
      tx,
    );
  });
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const EDITABLE = [
  "name",
  "description",
  "anonymous",
  "allowAttachments",
  "sortOrder",
] as const;

export async function updateCommunity(
  actor: SessionUser,
  input: UpdateCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  const current = await repo.findCommunity(input.communityId);
  if (!current) throw new CommunityError("COMMUNITY_NOT_FOUND");

  const next = {
    name: input.name,
    description: input.description,
    readRoles: input.readRoles,
    writeRoles: input.writeRoles,
    anonymous: input.anonymous,
    allowAttachments: input.allowAttachments,
    sortOrder: input.sortOrder,
  };

  const changed: string[] = EDITABLE.filter((field) => current[field] !== next[field]);
  const readChanged = !sameRoles(current.readRoles, next.readRoles);
  const writeChanged = !sameRoles(current.writeRoles, next.writeRoles);
  if (readChanged) changed.push("readRoles");
  if (writeChanged) changed.push("writeRoles");
  // 바뀐 것이 없으면 쓰지도 기록하지도 않는다 — 저장 버튼을 두 번 눌러도
  // 감사로그가 두 줄 쌓이지 않게 (rule.service.updateRule과 같은 판단).
  if (changed.length === 0) return;

  await withTransaction(async (tx) => {
    const ok = await repo.updateCommunity(input.communityId, next, input.updatedAt, tx);
    if (!ok) throw new CommunityError("COMMUNITY_CONFLICT");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:update",
        targetType: "Community",
        targetId: input.communityId,
        metadata: {
          slug: current.slug,
          changed,
          // 권한은 전/후를 늘 남긴다 — "언제부터 학부모가 볼 수 있었나"는
          // 나중에 반드시 묻게 되는 질문이다.
          readRolesFrom: current.readRoles,
          readRolesTo: next.readRoles,
          writeRolesFrom: current.writeRoles,
          writeRolesTo: next.writeRoles,
        },
      },
      tx,
    );
  });
}

/** 순서가 달라도 같은 집합이면 안 바뀐 것이다. 폼이 체크 순서대로 보낸다. */
function sameRoles(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export async function deleteCommunity(
  actor: SessionUser,
  input: DeleteCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  await withTransaction(async (tx) => {
    const current = await repo.findCommunity(input.communityId, tx);
    if (!current) throw new CommunityError("COMMUNITY_NOT_FOUND");
    // 이미 없앤 게시판에 사유만 새로 남기지 않는다 — 제거는 한 번만 일어난 일이다.
    if (!current.active) return;

    const removed = await repo.markCommunityDeleted(
      input.communityId,
      input.updatedAt,
      tx,
    );
    if (removed === 0) throw new CommunityError("COMMUNITY_CONFLICT");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:delete",
        targetType: "Community",
        targetId: input.communityId,
        metadata: { slug: current.slug, name: current.name, reason: input.reason },
      },
      tx,
    );
  });
}

/** 관리 화면. 없앤 게시판도 함께 준다. */
export async function listForManage(actor: SessionUser): Promise<repo.CommunityRow[]> {
  await assertCan(actor, "community:manage");
  return repo.listAllCommunities();
}

/** 내가 읽을 수 있는 게시판만. 못 읽는 게시판은 목록에 이름도 안 나온다. */
export async function listReadable(actor: SessionUser): Promise<repo.CommunityRow[]> {
  const all = await repo.listCommunities();
  return all.filter((community) => canRead(actor, community));
}

/**
 * 주소로 집어 온다. 읽을 수 없으면 거부하고, 없앤 게시판은 없는 것으로 친다.
 *
 * **없앤 게시판을 교사에게도 COMMUNITY_NOT_FOUND로 주는 이유**는, 그 주소가
 * 살아 있으면 없앴다는 사실이 화면에서 반쯤만 참이 되어서다. 관리 화면에서는
 * `listForManage`로 여전히 보인다.
 */
export async function getReadableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await repo.findCommunityBySlug(slug);
  if (!community || !community.active) throw new CommunityError("COMMUNITY_NOT_FOUND");
  if (!canRead(actor, community)) await denyAccess(actor, "community:read", slug);
  return community;
}

/** 쓰기 문. 읽기까지 함께 본다 — 못 읽는 곳에 쓰는 일은 없다. */
export async function getWritableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await getReadableBySlug(actor, slug);
  if (!canWrite(actor, community)) await denyAccess(actor, "community:write", slug);
  return community;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/board.service.test.ts`
Expected: PASS

- [ ] **Step 5: 오류 코드 둘을 스펙과 맞춘다**

`COMMUNITY_CONFLICT`가 스펙의 오류 목록에 없다. 스펙 「오류」 절의 코드 줄에 더한다.

```
SLUG_TAKEN · COMMUNITY_NOT_FOUND · COMMUNITY_CONFLICT · POST_NOT_FOUND · COMMENT_NOT_FOUND
```

- [ ] **Step 6: 전체 단위 검증**

Run: `npm run verify:unit`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/modules/community/board.service.ts tests/modules/community/board.service.test.ts docs/superpowers/specs/2026-08-28-community-design.md
git commit -m "feat(community): 게시판 서비스와 접근 문 둘을 넣는다"
```

---

### Task 6: 관리 화면 · 메뉴 · 감사로그 라벨

**Files:**
- Create: `src/app/(app)/admin/community/page.tsx`
- Create: `src/app/(app)/admin/community/actions.ts`
- Create: `src/app/(app)/admin/community/action-state.ts`
- Create: `src/app/(app)/admin/community/community-form.tsx` (클라이언트)
- Create: `src/app/(app)/admin/community/community-list.tsx`
- Create: `src/app/(app)/admin/community/[communityId]/page.tsx`
- Create: `src/app/(app)/admin/community/loading.tsx`
- Modify: `src/components/app-shell/nav.ts`
- Modify: `src/components/icons.tsx`
- Modify: `src/modules/audit-log/audit-log.labels.ts`
- Test: `tests/components/app-shell/nav.test.ts` (있는 테스트에 기대값 추가)

**Interfaces:**
- Consumes: Task 5의 `board.service`
- Produces:
  - 서버 액션 `createCommunityAction` · `updateCommunityAction` · `deleteCommunityAction`, 전부 `(prev, formData) => Promise<CommunityFormState>`
  - `NAV_ITEMS`에 `/community` 항목 (2단계 화면이 붙을 자리)

- [ ] **Step 1: 아이콘을 추가한다**

`src/components/icons.tsx`에 다른 아이콘과 같은 모양으로 붙인다. 게시판이므로 말풍선이 아니라 목록 판이다 — 알림·채팅이 아니라는 것을 아이콘이 말해야 한다.

```tsx
export function BoardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </Icon>
  );
}
```

파일 안 다른 아이콘이 쓰는 래퍼 이름(`Icon`)과 props 타입(`IconProps`)을 그대로 따른다 — 파일 위쪽을 먼저 읽고 맞춘다.

- [ ] **Step 2: 메뉴에 한 줄을 넣는다**

`src/components/app-shell/nav.ts`의 `NAV_ITEMS`에서 「출입증」 **뒤**, 「학부모 초대」 **앞**에 넣는다. `BoardIcon`을 import에 추가한다.

```ts
  {
    // 세 역할이 같은 주소를 쓰고, 무엇이 보이는지는 게시판마다 다르다 —
    // 읽을 수 있는 게시판만 목록에 나온다. 하위 메뉴에 게시판을 늘어놓지
    // 않는 이유는 이 파일이 클라이언트 컴포넌트가 직접 import하는 정적
    // 모듈이라 DB를 못 읽어서다. 목록은 /community 화면이 낸다.
    href: "/community",
    label: "커뮤니티",
    icon: BoardIcon,
    children: [
      // 상벌점의 「규정」↔「규정 관리」와 같은 모양이다. 첫 줄이 부모와 같은
      // 경로인 것도 같은 이유 — 펼쳤을 때 관리 줄만 보이면 「게시판은 어디
      // 갔나」가 된다. 학생·학부모에게는 하위가 없어 평범한 링크로 그려진다.
      { href: "/community", label: "게시판" },
      { href: "/admin/community", label: "커뮤니티 관리", roles: ["ADMIN"] },
    ],
  },
```

- [ ] **Step 3: 바텀탭 상한 주석을 고친다**

같은 파일의 `bottomTabItems` 위 주석은 「교사에게 NAV_ITEMS는 셋」이라고 적혀 있다. 이제 넷이고 최근 부여를 더해 다섯이다. 주석을 사실에 맞춘다.

```ts
/**
 * 하단 탭에 세울 항목. 교사에게 NAV_ITEMS는 대시보드·상벌점·출입증·커뮤니티
 * 넷이고 (학부모 초대는 학생 전용), 여기에 「최근 부여」를 더해 다섯이 된다.
 * 학생도 다섯(넷 + 학부모 초대), 학부모는 넷이다.
 *
 * **다섯이 상한이고 지금 그 상한에 닿아 있다.** 320px 폰에서 한 칸이 61px이고
 * 가장 긴 라벨이 네 글자(「대시보드」·「커뮤니티」 48px)라 아직 들어간다 —
 * **다음 최상위 메뉴를 세우는 사람은 이 함수가 무엇을 뺄지 고르는 일부터
 * 해야 한다.**
 * …(이하 「최근 부여」 문단은 그대로)
 */
```

- [ ] **Step 4: nav 테스트를 고친다**

`tests/components/app-shell/nav.test.ts`에서 항목 수·라벨을 세는 기대값이 깨진다. 실패 메시지가 가리키는 숫자를 새 값으로 고친다 — 교사 5, 학생 5, 학부모 4.

Run: `npx vitest run --project unit tests/components/app-shell/nav.test.ts`
먼저 돌려서 **무엇이 깨지는지 보고** 그 기대값만 고친다. 미리 추측해서 고치지 않는다.

- [ ] **Step 5: 감사로그 라벨을 넣는다**

`src/modules/audit-log/audit-log.labels.ts`의 `AUDIT_ACTIONS` 배열 끝(`merit:*`·`pass:*` 뒤)에 열 줄을 더한다.

```ts
  "community:create",
  "community:update",
  "community:delete",
  "community:post:create",
  "community:post:update",
  "community:post:delete",
  "community:comment:create",
  "community:comment:delete",
  "community:attachment:create",
  "community:attachment:delete",
```

같은 파일의 한글 라벨 사전(`AUDIT_ACTIONS` 아래 `Record`)에도 같은 키로 넣는다. 파일에서 `merit:rule:create`가 어떤 사전에 어떤 문구로 들어 있는지 먼저 읽고 그 모양을 따른다.

```ts
  "community:create": "게시판 생성",
  "community:update": "게시판 수정",
  "community:delete": "게시판 제거",
  "community:post:create": "글 작성",
  "community:post:update": "글 수정",
  "community:post:delete": "글 삭제",
  "community:comment:create": "댓글 작성",
  "community:comment:delete": "댓글 삭제",
  "community:attachment:create": "첨부 등록",
  "community:attachment:delete": "첨부 삭제",
```

- [ ] **Step 6: 액션 상태 타입을 만든다**

`src/app/(app)/admin/community/action-state.ts`:

```ts
/**
 * 폼이 되돌려 받는 값. 실패 상태에 제출값을 함께 싣는다 — React 19가 액션이
 * 끝난 폼을 리셋하므로, 이 값이 없으면 화면이 오류만 보여 주고 입력은 지운다.
 */
export type CommunityFormValues = {
  slug: string;
  name: string;
  description: string;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: string;
};

export type CommunityFormState = {
  ok: boolean;
  error?: string;
  values?: CommunityFormValues;
};

export const EMPTY_STATE: CommunityFormState = { ok: false };
```

- [ ] **Step 7: 서버 액션을 쓴다**

`src/app/(app)/admin/community/actions.ts`. **얇게 유지한다** — zod로 파싱하고 서비스를 부르고 오류를 문구로 옮기는 것이 전부다.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { CommunityError } from "@/modules/community/community.error";
import {
  createCommunitySchema,
  deleteCommunitySchema,
  updateCommunitySchema,
} from "@/modules/community/community.schema";
import * as service from "@/modules/community/board.service";
import type { CommunityFormState, CommunityFormValues } from "./action-state";

const MESSAGES: Record<string, string> = {
  SLUG_TAKEN: "이미 같은 주소를 쓰는 게시판이 있습니다.",
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  COMMUNITY_CONFLICT:
    "다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
};

function fail(error: string, values?: CommunityFormValues): CommunityFormState {
  return { ok: false, error, values };
}

/** 폼이 보낸 문자열 그대로. 되돌려 줄 값이라 다듬지 않는다 — 다듬으면 커서가 튄다. */
function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function toMessage(error: unknown): string {
  // 권한 거부를 일반 폴백에 섞지 않는다 — 화면이 「처리하지 못했습니다」라고 하면
  // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
  if (error instanceof ForbiddenError) return "이 작업을 할 권한이 없습니다.";
  if (error instanceof CommunityError) {
    return MESSAGES[error.message] ?? "처리하지 못했습니다.";
  }
  return "처리하지 못했습니다.";
}

function values(formData: FormData): CommunityFormValues {
  return {
    slug: text(formData, "slug"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    readRoles: formData.getAll("readRoles").map(String),
    writeRoles: formData.getAll("writeRoles").map(String),
    anonymous: formData.get("anonymous") === "on",
    allowAttachments: formData.get("allowAttachments") === "on",
    sortOrder: text(formData, "sortOrder"),
  };
}

function raw(formData: FormData) {
  return {
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    readRoles: formData.getAll("readRoles"),
    writeRoles: formData.getAll("writeRoles"),
    anonymous: formData.get("anonymous"),
    allowAttachments: formData.get("allowAttachments"),
    sortOrder: formData.get("sortOrder"),
  };
}

export async function createCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = createCommunitySchema.safeParse(raw(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  try {
    await service.createCommunity(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error), submitted);
  }

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { ok: true };
}

export async function updateCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = updateCommunitySchema.safeParse({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    ...raw(formData),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  try {
    await service.updateCommunity(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error), submitted);
  }

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { ok: true };
}

export async function deleteCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();

  const parsed = deleteCommunitySchema.safeParse({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  try {
    await service.deleteCommunity(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { ok: true };
}
```

`updateCommunitySchema`는 `slug`를 안 받으므로 `raw(formData)`가 넘기는 `slug`는 zod가 조용히 버린다 — 그것이 의도다(주소는 바꿀 수 없다).

- [ ] **Step 8: 폼 컴포넌트를 쓴다**

`src/app/(app)/admin/community/community-form.tsx` — `"use client"`. 추가와 수정이 같은 폼을 쓴다.

구성:
- `useActionState(action, EMPTY_STATE)`
- 실패하면 `<Note tone="error">{state.error}</Note>`
- 필드: 주소(`slug`, **수정 모드에서는 `readOnly`에 안내 한 줄**) · 이름 · 설명 · 순서
- 권한: 「읽기」·「쓰기」 두 묶음, 각각 `CheckboxField`로 학생·학부모 (**교사는 목록에 없다** — 늘 통과하므로 자리가 없다는 안내 한 줄을 묶음 아래 `text-caption text-mut`로 적는다)
- 익명·첨부 허용: `CheckboxField`
- 제출: `ConfirmSubmit` — 폼이 이미 다 받았으므로 모달에서 사유를 또 묻지 않는다
  - 추가: `title="게시판을 만듭니다"` `confirmLabel="만들기"` `variant="primary"`
  - 수정: `title="게시판을 저장합니다"` `confirmLabel="저장"` `variant="primary"`
  - **익명을 켜서 저장할 때는 `description`에 한 줄을 더 넣는다**: 「익명 게시판입니다. 글·댓글의 작성자가 화면에서 아무에게도 보이지 않습니다.」
- hidden: 수정 모드면 `communityId`·`updatedAt`(`community.updatedAt.toISOString()`)

카드는 `SectionCard variant="panel"`. 폼 안에서 `@container` 격자로 두 칸씩 접는다.

- [ ] **Step 9: 목록과 페이지를 쓴다**

`src/app/(app)/admin/community/community-list.tsx` — `DataTable narrow="cards"`.

| 열 | `card` 자리 | 내용 |
|---|---|---|
| 이름 | `title` | 이름 + 없앤 것이면 `Badge`「제거됨」 |
| 주소 | `meta` | `/community/<slug>` |
| 읽기 | `meta` | 역할 라벨(`ROLE_LABELS`) 쉼표로. 비면 「교사만」 |
| 쓰기 | `meta` | 같음 |
| 익명 | `meta` | 켜졌으면 `Badge`「익명」, 아니면 `null` |
| 작업 | `actions` | 「수정」 `buttonClass({ size: "sm" })` 링크. 없앤 것이면 `null` |

`minWidth`는 열 여섯이 안 눌리는 값으로 잡는다 — **폭을 확정하기 전에 브라우저에서 직접 재고 넣는다.** 눈대중으로 넣지 않는다.

`page.tsx`(서버 컴포넌트):

```tsx
export const metadata: Metadata = { title: "커뮤니티 관리" };

export default async function AdminCommunityPage() {
  const actor = await requirePermission("community:manage");
  const communities = await listForManage(actor);
  // …목록 카드 + 추가 폼 카드
}
```

`loading.tsx`는 `Skeleton`으로 목록 자리를 채운다 — `src/app/(app)/admin/merit/rules/loading.tsx`를 본으로 삼는다.

- [ ] **Step 10: 상세(수정·제거) 화면을 쓴다**

`src/app/(app)/admin/community/[communityId]/page.tsx`:
- `requirePermission("community:manage")`
- `listForManage`로 받아 id로 찾는다 (없앤 것도 보여야 하므로 `getReadableBySlug`가 아니다)
- `BackLink`로 `/admin/community`
- 수정 폼 (Step 8의 컴포넌트, 수정 모드)
- **제거 카드**는 `SectionCard tone="danger"` 안에 `ConfirmDialog`:
  - `reasonLabel="제거 사유"` `reasonRequired` (기본값)
  - `confirmVariant="danger"` `confirmLabel="제거"`
  - `description`: 「이 게시판이 목록과 주소에서 사라집니다. 글은 지워지지 않지만 아무도 볼 수 없게 됩니다. 되돌릴 수 없습니다.」
  - `children`으로 `communityId`·`updatedAt` hidden
  - 이미 없앤 게시판이면 이 카드 대신 `Note`로 「제거된 게시판입니다.」

- [ ] **Step 11: 브라우저에서 확인한다**

```bash
npm run dev
```

교사 세션으로 `/admin/community`에 들어가 확인한다.

1. 게시판을 만든다 — 주소 `notice`, 읽기 학생·학부모, 쓰기 없음
2. 만든 게시판을 열어 이름을 고치고 저장한다
3. 「읽기 학생 / 쓰기 학부모」로 저장을 시도한다 → 「읽을 수 없는 역할에 글쓰기를 줄 수 없습니다.」가 뜬다
4. 같은 주소로 하나 더 만든다 → 「이미 같은 주소를 쓰는 게시판이 있습니다.」
5. 제거 모달에서 사유를 비우고 누른다 → 확인 버튼이 안 눌린다
6. `/admin/logs`에서 `community:create`·`community:update`·`community:delete` 세 줄이 한글 라벨로 보인다

- [ ] **Step 12: 전체 검증**

Run: `npm run verify`
Expected: PASS (통합 테스트에 DB가 필요하다 — `npm run db:up`이 먼저)

- [ ] **Step 13: 커밋**

```bash
git add src/app/\(app\)/admin/community src/components/app-shell/nav.ts src/components/icons.tsx src/modules/audit-log/audit-log.labels.ts tests/components/app-shell/nav.test.ts
git commit -m "feat(community): 교사가 게시판을 만들고 권한을 정하는 화면을 넣는다"
```

---

# 2단계 — 글

## 파일 구조 (2단계에서 생기는 것)

| 파일 | 책임 |
|---|---|
| `src/modules/community/community.view.ts` | 행 → 화면 객체. **익명을 가리는 유일한 자리** |
| `src/modules/community/community.repo.ts` (수정) | 글 조회·쓰기 |
| `src/modules/community/community.schema.ts` (수정) | 글 zod |
| `src/modules/community/post.service.ts` | 글 |
| `src/app/(app)/community/**` | 목록·글 목록·쓰기·읽기·수정 |

---

### Task 7: `community.view.ts` — 익명을 가리는 한 곳

**Files:**
- Create: `src/modules/community/community.view.ts`
- Test: `tests/modules/community/view.test.ts`

**Interfaces:**
- Consumes: Task 1의 모델, Task 2의 `canRead`
- Produces:
  - `type Author = { name: string; role: Role | null; display: string }`
  - `type PostView` · `type PostListItemView` · `type CommentView`
  - `toPostView(row, community, viewer): PostView`
  - `toPostListItem(row, community, viewer, commentCount): PostListItemView`
  - `toCommentView(row, post, community, viewer): CommentView`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/modules/community/view.test.ts`. **핵심은 마지막 테스트다** — 결과 객체를 통째로 훑어 작성자 이름이 어떤 형태로도 없는 것을 본다. 필드 하나를 짚어 `null`인지 보면 다른 필드로 새는 것을 못 잡는다.

```ts
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import {
  toCommentView,
  toPostListItem,
  toPostView,
} from "@/modules/community/community.view";

function viewer(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "보는사람",
    email: "v@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = viewer("STUDENT", "s-1");
const other = viewer("STUDENT", "s-2");
const admin = viewer("ADMIN", "a-1");

const named = { anonymous: false, active: true };
const anon = { anonymous: true, active: true };

function post(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    body: "본문",
    authorUserId: "s-1",
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null,
    deletedByUserId: null,
    deletedReason: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

function comment(over: Record<string, unknown> = {}) {
  return {
    id: "cm1",
    postId: "p1",
    body: "댓글",
    authorUserId: "s-1",
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null,
    deletedByUserId: null,
    deletedReason: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

describe("toPostView — 실명 게시판", () => {
  it("작성자를 호칭과 함께 준다", () => {
    const view = toPostView(post(), named, other);
    expect(view.author).toEqual({
      name: "김민준",
      role: "STUDENT",
      display: "김민준님",
    });
  });

  it("교사 작성자에는 「선생님」이 붙는다", () => {
    const view = toPostView(post({ authorName: "이정민", authorRole: "ADMIN" }), named, other);
    expect(view.author?.display).toBe("이정민 선생님");
  });

  it("계정이 지워져 역할을 모르면 「님」으로 떨어진다", () => {
    const view = toPostView(post({ authorUserId: null, authorRole: "GONE" }), named, other);
    expect(view.author?.display).toBe("김민준님");
    expect(view.author?.role).toBeNull();
  });
});

describe("toPostView — 익명 게시판", () => {
  it("작성자가 null이다", () => {
    expect(toPostView(post(), anon, other).author).toBeNull();
  });

  it("교사에게도 null이다 — 익명은 화면에서 예외가 없다", () => {
    expect(toPostView(post(), anon, admin).author).toBeNull();
  });

  it("본인 여부는 계속 계산한다 — 수정·삭제 버튼이 필요하다", () => {
    expect(toPostView(post(), anon, student).isMine).toBe(true);
    expect(toPostView(post(), anon, other).isMine).toBe(false);
  });

  it("결과 객체 어디에도 작성자 이름이 없다", () => {
    const view = toPostView(post(), anon, admin);
    expect(JSON.stringify(view)).not.toContain("김민준");
    expect(JSON.stringify(view)).not.toContain("s-1");
  });

  it("목록 항목도 같다", () => {
    const item = toPostListItem(post(), anon, admin, 3);
    expect(item.author).toBeNull();
    expect(JSON.stringify(item)).not.toContain("김민준");
    expect(item.commentCount).toBe(3);
  });

  it("댓글도 같다", () => {
    const view = toCommentView(comment(), post(), anon, admin);
    expect(view.author).toBeNull();
    expect(JSON.stringify(view)).not.toContain("김민준");
  });
});

describe("권한 플래그", () => {
  it("본인은 고치고 지운다", () => {
    const view = toPostView(post(), named, student);
    expect(view.canEdit).toBe(true);
    expect(view.canDelete).toBe(true);
  });

  it("남은 못 고치고 못 지운다", () => {
    const view = toPostView(post(), named, other);
    expect(view.canEdit).toBe(false);
    expect(view.canDelete).toBe(false);
  });

  it("교사는 못 고치고 지우기만 한다 — 조정은 삭제이지 대필이 아니다", () => {
    const view = toPostView(post(), named, admin);
    expect(view.canEdit).toBe(false);
    expect(view.canDelete).toBe(true);
  });

  it("계정이 지워진 글은 아무도 못 고친다", () => {
    const view = toPostView(post({ authorUserId: null }), named, student);
    expect(view.isMine).toBe(false);
    expect(view.canEdit).toBe(false);
  });
});

describe("글쓴이 배지", () => {
  it("글쓴이가 단 댓글이면 켜진다 — 익명에서도", () => {
    expect(toCommentView(comment(), post(), anon, other).byPostAuthor).toBe(true);
  });

  it("남이 단 댓글이면 꺼진다", () => {
    const view = toCommentView(comment({ authorUserId: "s-9" }), post(), anon, other);
    expect(view.byPostAuthor).toBe(false);
  });

  it("둘 다 계정이 지워졌으면 켜지 않는다 — null == null로 켜면 남남이 한 사람이 된다", () => {
    const view = toCommentView(
      comment({ authorUserId: null }),
      post({ authorUserId: null }),
      anon,
      other,
    );
    expect(view.byPostAuthor).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/view.test.ts`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 뷰 변환기를 쓴다**

`src/modules/community/community.view.ts`:

```ts
import type { SessionUser } from "@/core/auth/session";
import { honorificName, isRole, type Role } from "@/core/authz/roles";

/**
 * repo 행을 화면이 쓰는 객체로 바꾼다. **익명을 가리는 자리는 여기 하나뿐이다.**
 *
 * 행에는 작성자가 늘 들어 있다(`authorUserId`·`authorName`·`authorRole`).
 * 익명 게시판이면 이 파일이 그 필드를 **지운 객체**를 만든다 — 화면 코드가
 * 실수로 흘릴 열 자체가 없게 하는 것이 목적이다.
 *
 * **페이지·서버 액션·라우트 핸들러 어느 것도 repo 행을 직접 화면으로 넘기지
 * 않는다.** 넘기는 순간 이 파일이 하는 일이 무의미해진다.
 */

export type Author = {
  name: string;
  /** 모르는 역할(계정이 지워진 뒤)이면 null. */
  role: Role | null;
  /** 호칭까지 붙인 표시용 이름. 화면은 이것만 쓴다. */
  display: string;
};

/** 판정에 필요한 게시판 성질만. 커뮤니티 행 전체를 받지 않는다. */
type ViewCommunity = { anonymous: boolean };

type AuthoredRow = {
  authorUserId: string | null;
  authorName: string;
  authorRole: string;
};

function toAuthor(row: AuthoredRow, community: ViewCommunity): Author | null {
  // 익명이면 이름도 역할도 만들지 않는다. null을 돌려주는 것이 아니라
  // 애초에 객체를 안 만든다 — 아래 어느 필드로도 이름이 새지 않는다.
  if (community.anonymous) return null;

  const role = isRole(row.authorRole) ? row.authorRole : null;
  return { name: row.authorName, role, display: honorificName(row.authorName, role) };
}

/**
 * 본인 여부. **양쪽이 다 null이면 false다** — 계정이 지워진 글 둘을 같은
 * 사람으로 묶으면 남남이 한 사람이 된다.
 */
function isSamePerson(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

export type PostRow = AuthoredRow & {
  id: string;
  communityId: string;
  title: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PostView = {
  id: string;
  communityId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  /** 익명 게시판이면 null. */
  author: Author | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * `canEdit`은 본인뿐이다 — **교사도 남의 글을 못 고친다.** 조정은 지우는 일이지
 * 대신 쓰는 일이 아니다. 지운 자국(`deletedAt`)은 남지만 고친 자국은 안 남아,
 * 교사가 학생 글의 내용을 바꿀 수 있으면 그 게시판의 글은 아무것도 증명하지 못한다.
 */
export function toPostView(
  row: PostRow,
  community: ViewCommunity,
  viewer: SessionUser,
): PostView {
  const isMine = isSamePerson(row.authorUserId, viewer.id);
  return {
    id: row.id,
    communityId: row.communityId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: toAuthor(row, community),
    isMine,
    canEdit: isMine,
    canDelete: isMine || viewer.role === "ADMIN",
  };
}

export type PostListItemView = Omit<PostView, "body"> & { commentCount: number };

/** 목록 항목. 본문은 안 싣는다 — 스무 개의 전문을 목록이 들고 있을 이유가 없다. */
export function toPostListItem(
  row: PostRow,
  community: ViewCommunity,
  viewer: SessionUser,
  commentCount: number,
): PostListItemView {
  const { body: _body, ...rest } = toPostView(row, community, viewer);
  return { ...rest, commentCount };
}

export type CommentRow = AuthoredRow & {
  id: string;
  postId: string;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
};

export type CommentView = {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: Author | null;
  isMine: boolean;
  canDelete: boolean;
  /** 글쓴이가 자기 글에 단 댓글인가. 익명에서도 켜진다 — 누구인지는 여전히 모른다. */
  byPostAuthor: boolean;
};

export function toCommentView(
  row: CommentRow,
  post: Pick<AuthoredRow, "authorUserId">,
  community: ViewCommunity,
  viewer: SessionUser,
): CommentView {
  const isMine = isSamePerson(row.authorUserId, viewer.id);
  return {
    id: row.id,
    postId: row.postId,
    body: row.body,
    createdAt: row.createdAt,
    author: toAuthor(row, community),
    isMine,
    canDelete: isMine || viewer.role === "ADMIN",
    byPostAuthor: isSamePerson(row.authorUserId, post.authorUserId),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/view.test.ts`
Expected: PASS

- [ ] **Step 5: 스펙에 「교사도 남의 글을 못 고친다」를 적는다**

설계 문서의 §결정 1 「교사는 무조건 통과한다」 절 끝에 한 문단을 더한다. 스펙은 「모든 글을 지운다」까지만 적혀 있고 수정은 안 적혀 있다 — 구현에서 정한 것을 문서에 되돌린다.

```markdown
**다만 교사도 남의 글을 고치지는 못한다.** 조정은 지우는 일이지 대신 쓰는 일이
아니다. 지운 자국(`deletedAt`)은 남지만 고친 자국은 안 남으므로, 교사가 학생 글의
내용을 바꿀 수 있으면 그 게시판의 글은 아무것도 증명하지 못하게 된다.
```

- [ ] **Step 6: 커밋**

```bash
git add src/modules/community/community.view.ts tests/modules/community/view.test.ts docs/superpowers/specs/2026-08-28-community-design.md
git commit -m "feat(community): 익명을 가리는 뷰 변환기를 넣는다"
```

---

### Task 8: 글 — repo · 스키마 · `post.service.ts`

**Files:**
- Modify: `src/modules/community/community.repo.ts` (글 함수 추가)
- Modify: `src/modules/community/community.schema.ts` (글 zod 추가)
- Create: `src/modules/community/post.service.ts`
- Test: `tests/modules/community/post.service.test.ts`

**Interfaces:**
- Consumes: Task 5의 `getReadableBySlug`·`getWritableBySlug`, Task 7의 `toPostView`·`toPostListItem`
- Produces:
  - repo: `countPosts(communityId, db?)` · `listPosts(communityId, skip, take, db?)` · `findPost(id, db?)` · `createPost(data, db?)` · `updatePost(id, data, updatedAt, db?)` · `markPostDeleted(id, actorUserId, reason, db?)`
  - schema: `createPostSchema` → `{ slug, title, body, attachmentIds: string[] }` · `updatePostSchema` → `{ postId, updatedAt: Date, title, body, attachmentIds }` · `deletePostSchema` → `{ postId, reason: string|null }` · `pageSchema` → `number`
  - service: `listPostPage(actor, slug, page)` · `getPost(actor, postId)` · `createPost(actor, input)` → `{ postId, slug }` · `updatePost(actor, input)` · `deletePost(actor, input)` → `{ slug }`

- [ ] **Step 1: repo에 글 함수를 더한다**

`src/modules/community/community.repo.ts` 끝에 붙인다.

```ts
// ── 글 ────────────────────────────────────────────────────────

/** 목록·상세에서 늘 함께 읽는 열. 본문은 목록에서도 읽는다(뷰가 뺀다). */
const POST_WITH_COUNTS = {
  include: { _count: { select: { comments: { where: { deletedAt: null } } } } },
} as const;

export type PostRow = Awaited<ReturnType<typeof listPosts>>[number];

/** 지워진 글은 세지 않는다. 페이지 수 계산이 화면과 어긋나면 빈 쪽이 생긴다. */
export function countPosts(communityId: string, db: DbClient = prisma): Promise<number> {
  return db.communityPost.count({ where: { communityId, deletedAt: null } });
}

export function listPosts(
  communityId: string,
  skip: number,
  take: number,
  db: DbClient = prisma,
) {
  return db.communityPost.findMany({
    where: { communityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    ...POST_WITH_COUNTS,
  });
}

/**
 * 한 건. **지워진 글도 돌려준다** — 서비스가 "없는 글"과 "지워진 글"을 갈라야
 * ALREADY_DELETED를 낼 수 있다. 게시판 행도 함께 읽는다: 익명 여부를 모르면
 * 뷰 변환기를 부를 수 없고, 두 번 왕복할 이유가 없다.
 */
export function findPost(id: string, db: DbClient = prisma) {
  return db.communityPost.findUnique({
    where: { id },
    include: { community: true },
  });
}

export type NewPost = {
  communityId: string;
  title: string;
  body: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
};

export async function createPost(
  data: NewPost,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.communityPost.create({ data, select: { id: true } });
}

/** 낙관적 잠금. false면 그 사이 누가 바꿨다. */
export async function updatePost(
  id: string,
  data: { title: string; body: string },
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const result = await db.communityPost.updateMany({
    where: { id, updatedAt, deletedAt: null },
    data,
  });
  return result.count === 1;
}

/** 이미 지운 글이면 0. 감사로그가 두 줄 쌓이지 않게 서비스가 이 값을 본다. */
export async function markPostDeleted(
  id: string,
  actorUserId: string,
  reason: string | null,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityPost.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actorUserId, deletedReason: reason },
  });
  return result.count;
}
```

- [ ] **Step 2: 스키마에 글 입력을 더한다**

`src/modules/community/community.schema.ts` 끝에 붙인다.

```ts
// ── 글 ────────────────────────────────────────────────────────

const postTitle = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(200, "제목은 200자를 넘을 수 없습니다.");

/**
 * 본문. **trim하지 않는다** — 줄바꿈만 살리는 평문이라 앞뒤 빈 줄도 글쓴이가
 * 넣은 모양이다. 대신 공백만 있는 본문은 거부한다.
 */
const postBody = z
  .string()
  .min(1, "내용을 입력해 주세요.")
  .max(20000, "내용은 20000자를 넘을 수 없습니다.")
  .refine((v) => v.trim().length > 0, "내용을 입력해 주세요.");

/** 폼이 hidden으로 싣는 첨부 id들. 없으면 빈 배열. */
const attachmentIds = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z
    .array(z.string().trim().min(1))
    .max(MAX_ATTACHMENTS_PER_POST, `첨부는 ${MAX_ATTACHMENTS_PER_POST}개까지 넣을 수 있습니다.`),
);

export const createPostSchema = z.object({
  slug: slugSchema,
  title: postTitle,
  body: postBody,
  attachmentIds,
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  postId: z.string().trim().min(1),
  updatedAt: z.iso
    .datetime("다른 곳에서 글이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.")
    .transform((value) => new Date(value)),
  title: postTitle,
  body: postBody,
  attachmentIds,
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const deletePostSchema = z.object({
  postId: z.string().trim().min(1),
  reason: optionalText(200),
});

export type DeletePostInput = z.infer<typeof deletePostSchema>;

/** `?page=`. 이상한 값은 조용히 1로 — 목록이 오류 화면이 되면 안 된다. */
export function parsePage(value: unknown): number {
  const n = Number(typeof value === "string" ? value : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}
```

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`tests/modules/community/post.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const countPosts = vi.fn();
const listPosts = vi.fn();
const findPost = vi.fn();
const createPost = vi.fn();
const updatePost = vi.fn();
const markPostDeleted = vi.fn();
const attachToPost = vi.fn();
const detachFromPost = vi.fn();
const listAttachments = vi.fn();
const getReadableBySlug = vi.fn();
const getWritableBySlug = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "post-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  countPosts,
  listPosts,
  findPost,
  createPost,
  updatePost,
  markPostDeleted,
  attachToPost,
  detachFromPost,
  listAttachments,
}));
vi.mock("@/modules/community/board.service", () => ({
  getReadableBySlug,
  getWritableBySlug,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/post.service");

function user(role: SessionUser["role"], id: string, name = "김민준"): SessionUser {
  return {
    id,
    name,
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "s-1");
const other = user("STUDENT", "s-2", "박도현");
const admin = user("ADMIN", "a-1", "이정민");

function board(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    slug: "free",
    name: "자유게시판",
    anonymous: false,
    allowAttachments: true,
    active: true,
    readRoles: ["STUDENT"],
    writeRoles: ["STUDENT"],
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    body: "본문",
    authorUserId: "s-1",
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    _count: { comments: 2 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getReadableBySlug.mockResolvedValue(board());
  getWritableBySlug.mockResolvedValue(board());
  createPost.mockResolvedValue({ id: "p1" });
  updatePost.mockResolvedValue(true);
  markPostDeleted.mockResolvedValue(1);
  attachToPost.mockResolvedValue(0);
  detachFromPost.mockResolvedValue([]);
  listAttachments.mockResolvedValue([]);
  countPosts.mockResolvedValue(0);
  listPosts.mockResolvedValue([]);
});

describe("createPost", () => {
  const input = { slug: "free", title: "제목", body: "본문", attachmentIds: [] };

  it("쓰기 문을 지나야 쓴다 — 작성자 이름·역할 스냅샷을 함께 넣는다", async () => {
    const result = await service.createPost(student, input);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(createPost).toHaveBeenCalledWith(
      {
        communityId: "c1",
        title: "제목",
        body: "본문",
        authorUserId: "s-1",
        authorName: "김민준",
        authorRole: "STUDENT",
      },
      txClient,
    );
    expect(result).toEqual({ postId: "p1", slug: "free" });
  });

  it("익명 게시판도 감사로그를 남긴다 — 예외를 만들지 않는다", async () => {
    getWritableBySlug.mockResolvedValue(board({ anonymous: true }));

    await service.createPost(student, input);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "s-1",
        action: "community:post:create",
        targetId: "p1",
      }),
      txClient,
    );
  });

  it("쓰기 문이 막으면 그대로 올린다", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));
    await expect(service.createPost(other, input)).rejects.toThrow(ForbiddenError);
    expect(createPost).not.toHaveBeenCalled();
  });

  it("첨부를 안 받는 게시판에 첨부를 실으면 거부한다", async () => {
    getWritableBySlug.mockResolvedValue(board({ allowAttachments: false }));
    await expect(
      service.createPost(student, { ...input, attachmentIds: ["a1"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_ALLOWED"));
  });

  it("첨부를 글에 붙인다 — 올린 사람이 글쓴이인 것만", async () => {
    attachToPost.mockResolvedValue(2);

    await service.createPost(student, { ...input, attachmentIds: ["a1", "a2"] });

    expect(attachToPost).toHaveBeenCalledWith(["a1", "a2"], "p1", "s-1", txClient);
  });

  it("남의 첨부라 하나도 안 붙으면 ATTACHMENT_NOT_FOUND", async () => {
    attachToPost.mockResolvedValue(0);
    await expect(
      service.createPost(student, { ...input, attachmentIds: ["stolen"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_FOUND"));
  });
});

describe("getPost", () => {
  it("읽기 문을 지나면 뷰를 준다", async () => {
    findPost.mockResolvedValue({ ...row(), community: board() });

    const view = await service.getPost(other, "p1");

    expect(getReadableBySlug).toHaveBeenCalledWith(other, "free");
    expect(view.post.author?.display).toBe("김민준님");
    expect(view.post.canEdit).toBe(false);
  });

  it("익명 게시판이면 작성자가 없다", async () => {
    findPost.mockResolvedValue({ ...row(), community: board({ anonymous: true }) });

    const view = await service.getPost(admin, "p1");

    expect(view.post.author).toBeNull();
    expect(JSON.stringify(view)).not.toContain("김민준");
  });

  it("없는 글이면 POST_NOT_FOUND", async () => {
    findPost.mockResolvedValue(null);
    await expect(service.getPost(other, "p1")).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });

  it("지워진 글이면 POST_NOT_FOUND — 교사에게도", async () => {
    findPost.mockResolvedValue({
      ...row({ deletedAt: new Date() }),
      community: board(),
    });
    await expect(service.getPost(admin, "p1")).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });
});

describe("updatePost", () => {
  const input = {
    postId: "p1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    title: "새 제목",
    body: "새 본문",
    attachmentIds: [],
  };

  beforeEach(() => {
    findPost.mockResolvedValue({ ...row(), community: board() });
  });

  it("본인은 고친다", async () => {
    await service.updatePost(student, input);
    expect(updatePost).toHaveBeenCalledWith(
      "p1",
      { title: "새 제목", body: "새 본문" },
      input.updatedAt,
      txClient,
    );
  });

  it("남은 못 고친다", async () => {
    await expect(service.updatePost(other, input)).rejects.toThrow(ForbiddenError);
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("**교사도 남의 글은 못 고친다** — 조정은 삭제이지 대필이 아니다", async () => {
    await expect(service.updatePost(admin, input)).rejects.toThrow(ForbiddenError);
  });

  it("그 사이 바뀌었으면 POST_CONFLICT", async () => {
    updatePost.mockResolvedValue(false);
    await expect(service.updatePost(student, input)).rejects.toThrow(
      new CommunityError("POST_CONFLICT"),
    );
  });
});

describe("deletePost", () => {
  const input = { postId: "p1", reason: "잘못 올렸습니다" };

  beforeEach(() => {
    findPost.mockResolvedValue({ ...row(), community: board() });
  });

  it("본인은 지운다 — byModerator는 false", async () => {
    await service.deletePost(student, input);

    expect(markPostDeleted).toHaveBeenCalledWith("p1", "s-1", "잘못 올렸습니다", txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:post:delete",
        metadata: expect.objectContaining({ byModerator: false }),
      }),
      txClient,
    );
  });

  it("교사는 남의 글도 지운다 — byModerator는 true", async () => {
    await service.deletePost(admin, input);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ byModerator: true }),
      }),
      txClient,
    );
  });

  it("남은 못 지운다", async () => {
    await expect(service.deletePost(other, input)).rejects.toThrow(ForbiddenError);
  });

  it("이미 지운 글이면 감사로그를 또 남기지 않는다", async () => {
    markPostDeleted.mockResolvedValue(0);
    await service.deletePost(student, input);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("listPostPage", () => {
  it("읽기 문을 지나 한 쪽을 준다", async () => {
    countPosts.mockResolvedValue(45);
    listPosts.mockResolvedValue([row()]);

    const page = await service.listPostPage(other, "free", 2);

    expect(listPosts).toHaveBeenCalledWith("c1", 20, 20);
    expect(page.total).toBe(45);
    expect(page.pageCount).toBe(3);
    expect(page.posts[0].commentCount).toBe(2);
  });

  it("글이 없어도 한 쪽이다 — 페이지 0은 화면에서 표현할 수 없다", async () => {
    const page = await service.listPostPage(other, "free", 1);
    expect(page.pageCount).toBe(1);
    expect(page.posts).toEqual([]);
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/post.service.test.ts`
Expected: FAIL — `post.service`가 없다.

- [ ] **Step 5: repo에 첨부 붙이기·떼기를 더한다**

테스트가 목으로 잡은 셋이다. `community.repo.ts` 끝에 붙인다. (4단계에서 나머지 첨부 함수가 이 옆에 붙는다.)

```ts
// ── 첨부 (붙이기·떼기만. 나머지는 4단계) ───────────────────────

/**
 * 첨부를 글에 붙인다. **올린 사람이 글쓴이인 것만** — 남의 첨부 id를 폼에
 * 실어 보내도 조건에 안 걸려 붙지 않는다. 이미 붙은 것도 안 건드린다.
 * 실제로 붙은 개수를 돌려준다.
 */
export async function attachToPost(
  ids: string[],
  postId: string,
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.communityAttachment.updateMany({
    where: { id: { in: ids }, uploaderUserId, postId: null },
    data: { postId },
  });
  return result.count;
}

/**
 * 글 수정에서 빠진 첨부를 뗀다. **행을 지우고 디스크에서 찾을 값을 돌려준다** —
 * 부르는 쪽이 그것으로 파일을 지운다. `createdAt`까지 주는 이유는 디스크 경로가
 * 연·월로 나뉘어 있어(`storagePath`) 그 값 없이는 파일을 못 찾아서다.
 *
 * 디스크 삭제는 여기서 하지 않는다 — repo는 Prisma만 부른다.
 */
export type DetachedFile = { storageKey: string; createdAt: Date };

export async function detachFromPost(
  postId: string,
  keepIds: string[],
  db: DbClient = prisma,
): Promise<DetachedFile[]> {
  const doomed = await db.communityAttachment.findMany({
    where: { postId, id: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] } },
    select: { id: true, storageKey: true, createdAt: true },
  });
  if (doomed.length === 0) return [];
  await db.communityAttachment.deleteMany({
    where: { id: { in: doomed.map((a) => a.id) } },
  });
  return doomed.map(({ storageKey, createdAt }) => ({ storageKey, createdAt }));
}

export function listAttachments(postId: string, db: DbClient = prisma) {
  return db.communityAttachment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, size: true },
  });
}
```

- [ ] **Step 6: `post.service.ts`를 쓴다**

```ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { canWrite } from "./community.access";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import { POSTS_PER_PAGE, type CreatePostInput, type DeletePostInput, type UpdatePostInput } from "./community.schema";
import {
  toPostListItem,
  toPostView,
  type PostListItemView,
  type PostView,
} from "./community.view";

/**
 * 글 서비스. **게시판 권한은 board.service의 문 둘을 거쳐서만 얻는다** —
 * 여기서 canRead/canWrite를 다시 부르지 않는다. 검사가 두 곳에 있으면
 * 한쪽만 고쳐지는 날이 온다.
 */

/** 소유권 거부. can()으로 못 가르는 거부라 직접 던지고 직접 기록한다. */
async function denyOwnership(
  actor: SessionUser,
  action: string,
  postId: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "CommunityPost",
      targetId: postId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/**
 * 글 한 건 + 그 게시판. **읽기 권한을 board.service에 다시 물어본다** —
 * 글에서 게시판으로 거슬러 왔다고 검사를 건너뛰면, 주소만 알면 남의 게시판
 * 글이 열린다.
 */
async function loadPost(actor: SessionUser, postId: string) {
  const post = await repo.findPost(postId);
  // 지워진 글은 "없는 글"이다 — 교사에게도. 있었다는 사실은 감사로그가 안다.
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  const community = await board.getReadableBySlug(actor, post.community.slug);
  return { post, community };
}

export type PostDetail = {
  post: PostView;
  community: { slug: string; name: string; anonymous: boolean; allowAttachments: boolean };
  attachments: Awaited<ReturnType<typeof repo.listAttachments>>;
  /** 댓글 폼을 그릴지. 실제 통제는 comment.service가 한다 (3단계). */
  canWrite: boolean;
};

export async function getPost(
  actor: SessionUser,
  postId: string,
): Promise<PostDetail> {
  const { post, community } = await loadPost(actor, postId);
  return {
    post: toPostView(post, community, actor),
    community: {
      slug: community.slug,
      name: community.name,
      anonymous: community.anonymous,
      allowAttachments: community.allowAttachments,
    },
    attachments: await repo.listAttachments(postId),
    canWrite: canWrite(actor, community),
  };
}

export type PostPage = {
  community: { id: string; slug: string; name: string; description: string | null; anonymous: boolean; allowAttachments: boolean };
  posts: PostListItemView[];
  page: number;
  pageCount: number;
  total: number;
  canWrite: boolean;
};

export async function listPostPage(
  actor: SessionUser,
  slug: string,
  page: number,
): Promise<PostPage> {
  const community = await board.getReadableBySlug(actor, slug);

  const [total, rows] = await Promise.all([
    repo.countPosts(community.id),
    repo.listPosts(community.id, (page - 1) * POSTS_PER_PAGE, POSTS_PER_PAGE),
  ]);

  return {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      anonymous: community.anonymous,
      allowAttachments: community.allowAttachments,
    },
    posts: rows.map((row) => toPostListItem(row, community, actor, row._count.comments)),
    page,
    // 글이 없어도 한 쪽이다 — 페이지 0은 화면에서 표현할 수 없다.
    pageCount: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)),
    total,
    // 목록 화면의 「글쓰기」 버튼을 그릴지. 순수 함수를 직접 쓴다 — 버튼을
    // 그릴지 정하는 일이라 거부 기록이 필요 없다. 실제 통제는 createPost가
    // getWritableBySlug로 한다.
    canWrite: canWrite(actor, community),
  };
}

export async function createPost(
  actor: SessionUser,
  input: CreatePostInput,
): Promise<{ postId: string; slug: string }> {
  const community = await board.getWritableBySlug(actor, input.slug);

  if (input.attachmentIds.length > 0 && !community.allowAttachments) {
    throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
  }

  return withTransaction(async (tx) => {
    const { id } = await repo.createPost(
      {
        communityId: community.id,
        title: input.title,
        body: input.body,
        authorUserId: actor.id,
        // 계정이 지워져도 남을 스냅샷. 익명 게시판에서도 저장한다 —
        // 가리는 일은 화면 앞의 community.view.ts가 한다.
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    const attached = await repo.attachToPost(input.attachmentIds, id, actor.id, tx);
    // 하나도 안 붙었으면 남의 첨부이거나 이미 만료된 것이다. 글만 남기지 않는다.
    if (input.attachmentIds.length > 0 && attached === 0) {
      throw new CommunityError("ATTACHMENT_NOT_FOUND");
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:create",
        targetType: "CommunityPost",
        targetId: id,
        metadata: {
          communityId: community.id,
          slug: community.slug,
          // 익명 게시판의 제목도 남긴다 — 빼도 시각으로 대조되므로 얻는 것이 없다.
          title: input.title,
          attachments: attached,
        },
      },
      tx,
    );

    return { postId: id, slug: community.slug };
  });
}

export async function updatePost(
  actor: SessionUser,
  input: UpdatePostInput,
): Promise<{ slug: string }> {
  const { post, community } = await loadPost(actor, input.postId);

  // **본인만.** 교사도 남의 글은 못 고친다 — 조정은 삭제이지 대필이 아니다.
  if (post.authorUserId === null || post.authorUserId !== actor.id) {
    await denyOwnership(actor, "community:post:update", input.postId);
  }

  let detached: repo.DetachedFile[] = [];

  await withTransaction(async (tx) => {
    const ok = await repo.updatePost(
      input.postId,
      { title: input.title, body: input.body },
      input.updatedAt,
      tx,
    );
    if (!ok) throw new CommunityError("POST_CONFLICT");

    const attached = await repo.attachToPost(input.attachmentIds, input.postId, actor.id, tx);
    // 뗀 파일은 트랜잭션 밖에서 지운다 — 롤백되면 행은 살아 있는데 파일만
    // 사라진다. 4단계에서 이 값을 받아 지우는 줄이 아래에 붙는다.
    detached = await repo.detachFromPost(input.postId, input.attachmentIds, tx);

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:update",
        targetType: "CommunityPost",
        targetId: input.postId,
        metadata: {
          slug: community.slug,
          titleFrom: post.title,
          titleTo: input.title,
          attachmentsAdded: attached,
          attachmentsRemoved: detached.length,
        },
      },
      tx,
    );
  });

  // 커밋된 뒤에 디스크를 지운다. **4단계에서 이 자리에 한 줄이 들어온다:**
  //   for (const file of detached) await deleteAttachment(file.storageKey, file.createdAt);
  // 지금은 storage 모듈이 없어 비워 둔다 — 3단계까지는 첨부가 아예 안 생긴다.

  return { slug: community.slug };
}

export async function deletePost(
  actor: SessionUser,
  input: DeletePostInput,
): Promise<{ slug: string }> {
  const { post, community } = await loadPost(actor, input.postId);

  const isMine = post.authorUserId !== null && post.authorUserId === actor.id;
  const isModerator = actor.role === "ADMIN";
  if (!isMine && !isModerator) {
    await denyOwnership(actor, "community:post:delete", input.postId);
  }

  await withTransaction(async (tx) => {
    const removed = await repo.markPostDeleted(input.postId, actor.id, input.reason, tx);
    // 이미 지운 글에 사유만 새로 남기지 않는다 — 삭제는 한 번만 일어난 일이다.
    if (removed === 0) return;

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:delete",
        targetType: "CommunityPost",
        targetId: input.postId,
        metadata: {
          slug: community.slug,
          title: post.title,
          // 본인 삭제와 교사의 조정을 감사로그에서 구분할 수 있어야 한다.
          byModerator: !isMine && isModerator,
          reason: input.reason,
        },
      },
      tx,
    );
  });

  return { slug: community.slug };
}
```

- [ ] **Step 7: 오류 코드를 스펙에 맞춘다**

`ATTACHMENT_NOT_ALLOWED` · `POST_CONFLICT`가 설계 문서 「오류」 절 코드 줄에 있는지 보고, 없으면 더한다.

- [ ] **Step 8: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/post.service.test.ts`
Expected: PASS

- [ ] **Step 9: 전체 단위 검증**

Run: `npm run verify:unit`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/modules/community tests/modules/community docs/superpowers/specs/2026-08-28-community-design.md
git commit -m "feat(community): 글 서비스를 넣는다"
```

---

### Task 9: 게시판 목록과 글 목록 화면

**Files:**
- Create: `src/app/(app)/community/page.tsx`
- Create: `src/app/(app)/community/loading.tsx`
- Create: `src/app/(app)/community/board-list.tsx`
- Create: `src/app/(app)/community/[slug]/page.tsx`
- Create: `src/app/(app)/community/[slug]/loading.tsx`
- Create: `src/app/(app)/community/[slug]/post-list.tsx`

**Interfaces:**
- Consumes: Task 5의 `listReadable`, Task 8의 `listPostPage`·`parsePage`
- Produces: 화면. 10번 태스크의 글쓰기 버튼이 여기 붙는다.

- [ ] **Step 1: 게시판 목록을 쓴다**

`src/app/(app)/community/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/core/auth/session";
import { listReadable } from "@/modules/community/board.service";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "커뮤니티" };

export default async function CommunityPage() {
  const actor = await requireAuth();
  // 서비스가 권한을 판정한다 — 못 읽는 게시판은 이름도 안 나온다.
  const boards = await listReadable(actor);

  if (boards.length === 0) {
    // 카드 밖(페이지 본문)에 바로 서는 자리라 자기 테두리를 그린다.
    return <EmptyState>볼 수 있는 게시판이 없습니다.</EmptyState>;
  }

  return <BoardList boards={boards} />;
}
```

`board-list.tsx`는 게시판 하나에 카드 하나다. **표가 아니다** — 게시판은 스물이 넘지 않고, 이름·설명·성질 배지가 한 줄 표에 안 들어간다.

- `SectionCard variant="panel"`을 게시판마다 하나, `@container` 격자로 두 칸씩 접는다
- 제목은 `<Link href={`/community/${slug}`}>` — 카드 전체가 아니라 제목만 링크다(카드 전체를 링크로 만들면 안의 배지가 링크 안의 링크가 된다)
- 설명은 `text-sm text-mut`. 없으면 그 줄을 안 그린다
- 배지: 익명이면 `Badge`「익명」, 쓸 수 없으면 `Badge`「읽기 전용」

- [ ] **Step 2: 글 목록을 쓴다**

`src/app/(app)/community/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { parsePage } from "@/modules/community/community.schema";
import { listPostPage } from "@/modules/community/post.service";
import { PostList } from "./post-list";

export const metadata: Metadata = { title: "게시판" };

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const { slug } = await params;
  const query = await searchParams;

  // 권한 거부·없는 게시판은 서비스가 던지고 error.tsx가 받는다.
  const view = await listPostPage(actor, slug, parsePage(query.page));

  return (
    <div className="space-y-4">
      {view.community.anonymous && (
        <Note>
          익명 게시판입니다. 글과 댓글의 작성자가 화면에서 아무에게도 보이지 않습니다.
        </Note>
      )}

      <SectionCard
        title={view.community.name}
        hint={view.community.description ?? undefined}
        aside={
          view.canWrite ? (
            <Link
              href={`/community/${slug}/new`}
              className={buttonClass({ size: "sm" })}
            >
              글쓰기
            </Link>
          ) : undefined
        }
        flush
      >
        {view.posts.length === 0 ? (
          <EmptyState variant="inside">아직 글이 없습니다.</EmptyState>
        ) : (
          <PostList slug={slug} posts={view.posts} anonymous={view.community.anonymous} />
        )}
      </SectionCard>

      <Pagination page={view.page} pageCount={view.pageCount} />
    </div>
  );
}
```

`Pagination`의 실제 props는 `src/components/ui/pagination.tsx`를 읽고 맞춘다 — 감사로그 화면(`/admin/logs`)이 쓰는 방식을 그대로 따른다.

- [ ] **Step 3: 글 목록 표를 쓴다**

`post-list.tsx` — `DataTable narrow="cards"`.

| 열 | `card` 자리 | 내용 |
|---|---|---|
| 제목 | `title` | `<Link>` + 댓글이 있으면 옆에 `text-caption text-mut`로 `[3]` |
| 작성자 | `meta` | `post.author?.display ?? "익명"` |
| 작성일 | `meta` | `formatDate(post.createdAt)` (`@/lib/datetime`) |

**익명 게시판이면 작성자 열을 아예 넣지 않는다.** 「익명」이 스무 줄 늘어서는 것은 정보가 아니다 — `columns` 배열을 만들 때 `anonymous`면 그 열을 빼고, 대신 게시판 이름 아래의 `Note` 한 줄이 그 사실을 말한다.

`minWidth`는 브라우저에서 재고 넣는다.

- [ ] **Step 4: `loading.tsx` 둘을 쓴다**

`Skeleton`으로 카드 자리를 채운다. `src/app/(app)/merit/rules/loading.tsx`를 본으로 삼는다.

- [ ] **Step 5: 브라우저에서 확인한다**

교사로 게시판 셋을 만든다 — 「공지」(읽기 학생·학부모, 쓰기 없음), 「자유게시판」(읽기·쓰기 학생), 「고민상담」(읽기·쓰기 학생, 익명).

| 확인 | 기대 |
|---|---|
| 학생으로 `/community` | 셋 다 보인다. 공지에 「읽기 전용」, 고민상담에 「익명」 |
| 학부모로 `/community` | 공지 하나만 보인다 |
| 학부모로 `/community/free` 직접 입력 | `/forbidden`으로 간다 |
| 교사로 `/community` | 셋 다 보이고 전부 글쓰기가 있다 |
| 없는 주소 `/community/nope` | 오류 화면이 뜬다 (목록이 아니라) |
| `/admin/logs` | 학부모의 `/community/free` 시도가 `authz:denied`로 남았다 |

- [ ] **Step 6: 커밋**

```bash
git add src/app/\(app\)/community
git commit -m "feat(community): 게시판 목록과 글 목록 화면을 넣는다"
```

---

### Task 10: 글쓰기 · 읽기 · 수정 · 삭제 화면

**Files:**
- Create: `src/app/(app)/community/[slug]/actions.ts`
- Create: `src/app/(app)/community/[slug]/action-state.ts`
- Create: `src/app/(app)/community/[slug]/post-form.tsx` (클라이언트)
- Create: `src/app/(app)/community/[slug]/new/page.tsx`
- Create: `src/app/(app)/community/[slug]/[postId]/page.tsx`
- Create: `src/app/(app)/community/[slug]/[postId]/loading.tsx`
- Create: `src/app/(app)/community/[slug]/[postId]/delete-post.tsx` (클라이언트)
- Create: `src/app/(app)/community/[slug]/[postId]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 8의 `createPost`·`getPost`·`updatePost`·`deletePost`
- Produces: 서버 액션 `createPostAction` · `updatePostAction` · `deletePostAction`

- [ ] **Step 1: 액션 상태 타입을 만든다**

`action-state.ts`:

```ts
export type PostFormValues = { title: string; body: string };

export type PostFormState = {
  ok: boolean;
  error?: string;
  values?: PostFormValues;
};

export const EMPTY_POST_STATE: PostFormState = { ok: false };
```

- [ ] **Step 2: 서버 액션을 쓴다**

`actions.ts`. 성공하면 `redirect`한다 — `redirect`는 예외를 던지므로 **`try` 밖에서** 부른다. 안에서 부르면 catch가 그것을 오류로 삼켜 「처리하지 못했습니다」가 뜬다.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { CommunityError } from "@/modules/community/community.error";
import {
  createPostSchema,
  deletePostSchema,
  updatePostSchema,
} from "@/modules/community/community.schema";
import * as service from "@/modules/community/post.service";
import type { PostFormState, PostFormValues } from "./action-state";

const MESSAGES: Record<string, string> = {
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  POST_NOT_FOUND: "글을 찾을 수 없습니다.",
  POST_CONFLICT: "다른 곳에서 글이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  ATTACHMENT_NOT_FOUND: "첨부한 파일을 찾을 수 없습니다. 다시 올려 주세요.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
};

function fail(error: string, values?: PostFormValues): PostFormState {
  return { ok: false, error, values };
}

function toMessage(error: unknown): string {
  if (error instanceof ForbiddenError) return "이 작업을 할 권한이 없습니다.";
  if (error instanceof CommunityError) {
    return MESSAGES[error.message] ?? "처리하지 못했습니다.";
  }
  return "처리하지 못했습니다.";
}

/** 폼이 보낸 문자열 그대로. 본문은 다듬지 않는다 — 줄바꿈이 글쓴이의 모양이다. */
function values(formData: FormData): PostFormValues {
  return {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
}

export async function createPostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = createPostSchema.safeParse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  let created: { postId: string; slug: string };
  try {
    created = await service.createPost(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error), submitted);
  }

  revalidatePath(`/community/${created.slug}`);
  // redirect는 예외를 던진다 — try 밖에서 부른다.
  redirect(`/community/${created.slug}/${created.postId}`);
}

export async function updatePostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);
  const postId = String(formData.get("postId") ?? "");

  const parsed = updatePostSchema.safeParse({
    postId,
    updatedAt: formData.get("updatedAt"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  let result: { slug: string };
  try {
    result = await service.updatePost(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error), submitted);
  }

  revalidatePath(`/community/${result.slug}`);
  revalidatePath(`/community/${result.slug}/${postId}`);
  redirect(`/community/${result.slug}/${postId}`);
}

export async function deletePostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = deletePostSchema.safeParse({
    postId: formData.get("postId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string };
  try {
    result = await service.deletePost(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}`);
  redirect(`/community/${result.slug}`);
}
```

- [ ] **Step 3: 글 폼을 쓴다**

`post-form.tsx` — `"use client"`. 쓰기와 수정이 같은 폼을 쓴다.

- `useActionState`
- 제목 `Input`, 본문 `<textarea>` — 토큰 클래스만 쓴다. 다른 화면의 textarea(출입증 신청 사유)를 찾아 같은 클래스를 쓴다
- **익명 게시판이면 폼 위에 `Note`**: 「이 게시판의 글은 작성자가 화면에 보이지 않습니다. 다만 학교는 감사 기록으로 작성자를 확인할 수 있습니다.」 — **학생에게 이 사실을 숨기지 않는다**(설계 §결정 2)
- hidden: `slug`(쓰기) 또는 `postId`·`updatedAt`(수정)
- 제출은 **평범한 `Button`**이다. **확인 모달을 달지 않는다** — 되돌릴 수 있고(수정·삭제) 게시판에서 가장 자주 하는 동작이라, 한 번 더 누르게 하면 그 자리가 안 쓰인다(설계 §화면)
- 첨부 자리는 4단계에서 이 폼 안에 붙는다. 지금은 넣지 않는다

- [ ] **Step 4: 글쓰기 페이지를 쓴다**

`new/page.tsx`:

```tsx
export default async function NewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireAuth();
  const { slug } = await params;
  // 쓰기 권한이 없으면 여기서 막힌다 — 서비스가 다시 검사한다.
  const community = await getWritableBySlug(actor, slug);
  // …BackLink + PostForm
}
```

- [ ] **Step 5: 글 상세를 쓴다**

`[postId]/page.tsx`:

- `getPost(actor, postId)`
- `BackLink`로 `/community/${slug}`
- `SectionCard variant="page"`가 아니라 `cardClass("page")` — 제목 앞에 배지가 오면 `SectionCard`로 표현할 수 없다(CLAUDE.md의 표)
- 머리: 제목(`text-xl font-semibold`) · 작성자(`post.author?.display ?? "익명"`) · 작성일 · 수정됐으면 「수정됨」
- 본문: **`whitespace-pre-wrap`** — 평문의 줄바꿈이 살아야 한다
- `post.canEdit`이면 「수정」 링크(`buttonClass({ size: "sm", variant: "ghost" })`)
- `post.canDelete`이면 `DeletePost` 컴포넌트

- [ ] **Step 6: 삭제 모달을 쓴다**

`delete-post.tsx` — `"use client"`. `ConfirmDialog`를 쓴다.

```tsx
<ConfirmDialog
  trigger={(open) => (
    <Button variant="ghost" size="sm" onClick={open}>
      삭제
    </Button>
  )}
  title="글을 삭제합니다"
  description={
    byModerator
      ? "다른 사람의 글을 삭제합니다. 사유가 감사 기록에 남습니다."
      : "이 글이 목록에서 사라집니다. 댓글도 함께 보이지 않습니다."
  }
  // 남의 글을 지울 때만 사유가 필수다 — 내 글을 지우는 데 사유를 물을 이유가 없다.
  reasonLabel="삭제 사유"
  reasonRequired={byModerator}
  confirmVariant="danger"
  confirmLabel="삭제"
  pendingLabel="삭제하는 중…"
  action={dispatch}
  pending={pending}
  state={state}
>
  <input type="hidden" name="postId" value={postId} />
</ConfirmDialog>
```

`byModerator`는 `!post.isMine`이다. `ConfirmDialogState`의 실제 타입은 `confirm-dialog.tsx`를 읽고 맞춘다.

- [ ] **Step 7: 수정 페이지를 쓴다**

`[postId]/edit/page.tsx` — `getPost`로 받아 `post.canEdit`이 false면 `redirect("/forbidden")`. 폼은 Step 3의 컴포넌트를 수정 모드로.

- [ ] **Step 8: 브라우저에서 확인한다**

| 확인 | 기대 |
|---|---|
| 학생으로 자유게시판에 글을 쓴다 | 상세로 이동, 목록에 이름이 「김민준님」 |
| 자기 글에서 수정·삭제 | 둘 다 보인다. 삭제 모달에 사유가 **선택**이다 |
| 다른 학생 글에서 | 수정·삭제가 둘 다 없다 |
| 교사로 남의 글에서 | 수정은 없고 삭제만 있다. 사유가 **필수**다 |
| 교사로 남의 글 수정 주소를 직접 입력 | `/forbidden`으로 간다 |
| 고민상담(익명)에 글을 쓴다 | 폼 위에 감사 기록 안내가 뜨고, 목록·상세 어디에도 이름이 없다 |
| 교사로 그 익명 글을 연다 | **작성자가 안 보인다** |
| 본문에 빈 줄을 넣어 쓴다 | 상세에서 줄바꿈이 그대로 산다 |
| 두 탭에서 같은 글을 열고 양쪽 저장 | 뒤쪽이 「다른 곳에서 글이 바뀌었습니다」 |

- [ ] **Step 9: 전체 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 10: 커밋**

```bash
git add src/app/\(app\)/community
git commit -m "feat(community): 글을 쓰고 읽고 고치고 지운다"
```

---

# 3단계 — 댓글

---

### Task 11: 댓글 — repo · 스키마 · `comment.service.ts`

**Files:**
- Modify: `src/modules/community/community.repo.ts`
- Modify: `src/modules/community/community.schema.ts`
- Create: `src/modules/community/comment.service.ts`
- Test: `tests/modules/community/comment.service.test.ts`

**Interfaces:**
- Consumes: Task 5의 문 둘, Task 7의 `toCommentView`, Task 8의 `repo.findPost`
- Produces:
  - repo: `listComments(postId, db?)` · `findComment(id, db?)` · `createComment(data, db?)` · `markCommentDeleted(id, actorUserId, reason, db?)`
  - schema: `createCommentSchema` → `{ postId, body }` · `deleteCommentSchema` → `{ commentId, reason: string|null }`
  - service: `listComments(actor, postId)` → `CommentView[]` · `createComment(actor, input)` → `{ slug, postId }` · `deleteComment(actor, input)` → `{ slug, postId }`

- [ ] **Step 1: repo에 댓글 함수를 더한다**

```ts
// ── 댓글 ──────────────────────────────────────────────────────

export function listComments(postId: string, db: DbClient = prisma) {
  return db.communityComment.findMany({
    where: { postId, deletedAt: null },
    // 오래된 것부터 — 댓글은 대화라 위에서 아래로 읽힌다.
    orderBy: { createdAt: "asc" },
  });
}

/** 지워진 댓글도 돌려준다. 서비스가 "없음"과 "이미 지움"을 갈라야 한다. */
export function findComment(id: string, db: DbClient = prisma) {
  return db.communityComment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}

export type NewComment = {
  postId: string;
  body: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
};

export async function createComment(
  data: NewComment,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.communityComment.create({ data, select: { id: true } });
}

export async function markCommentDeleted(
  id: string,
  actorUserId: string,
  reason: string | null,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityComment.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actorUserId, deletedReason: reason },
  });
  return result.count;
}
```

- [ ] **Step 2: 스키마에 댓글 입력을 더한다**

```ts
// ── 댓글 ──────────────────────────────────────────────────────

/** 본문. 글과 같은 이유로 trim하지 않고 공백만 있는 것을 거부한다. */
const commentBody = z
  .string()
  .min(1, "댓글을 입력해 주세요.")
  .max(2000, "댓글은 2000자를 넘을 수 없습니다.")
  .refine((v) => v.trim().length > 0, "댓글을 입력해 주세요.");

export const createCommentSchema = z.object({
  postId: z.string().trim().min(1),
  body: commentBody,
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const deleteCommentSchema = z.object({
  commentId: z.string().trim().min(1),
  reason: optionalText(200),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;
```

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`tests/modules/community/comment.service.test.ts`. 목 구성은 `post.service.test.ts`와 같은 모양이다(repo·board.service·audit·db를 `vi.mock`).

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listComments = vi.fn();
const findComment = vi.fn();
const createComment = vi.fn();
const markCommentDeleted = vi.fn();
const findPost = vi.fn();
const getReadableBySlug = vi.fn();
const getWritableBySlug = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "comment-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  listComments,
  findComment,
  createComment,
  markCommentDeleted,
  findPost,
}));
vi.mock("@/modules/community/board.service", () => ({
  getReadableBySlug,
  getWritableBySlug,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/comment.service");

function user(role: SessionUser["role"], id: string, name = "김민준"): SessionUser {
  return {
    id,
    name,
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "s-1");
const other = user("STUDENT", "s-2", "박도현");
const admin = user("ADMIN", "a-1", "이정민");

const anonBoard = { id: "c1", slug: "worry", name: "고민상담", anonymous: true, active: true, readRoles: ["STUDENT"], writeRoles: ["STUDENT"] };
const namedBoard = { ...anonBoard, slug: "free", name: "자유게시판", anonymous: false };

function post(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    authorUserId: "s-1",
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null,
    community: namedBoard,
    ...over,
  };
}

function comment(over: Record<string, unknown> = {}) {
  return {
    id: "cm1",
    postId: "p1",
    body: "댓글",
    authorUserId: "s-1",
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findPost.mockResolvedValue(post());
  getReadableBySlug.mockResolvedValue(namedBoard);
  getWritableBySlug.mockResolvedValue(namedBoard);
  createComment.mockResolvedValue({ id: "cm1" });
  markCommentDeleted.mockResolvedValue(1);
  listComments.mockResolvedValue([]);
});

describe("createComment", () => {
  const input = { postId: "p1", body: "댓글" };

  it("쓰기 문을 지나야 쓴다 — 작성자 스냅샷을 넣고 감사로그를 남긴다", async () => {
    const result = await service.createComment(student, input);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(createComment).toHaveBeenCalledWith(
      {
        postId: "p1",
        body: "댓글",
        authorUserId: "s-1",
        authorName: "김민준",
        authorRole: "STUDENT",
      },
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "community:comment:create", targetId: "cm1" }),
      txClient,
    );
    expect(result).toEqual({ slug: "free", postId: "p1" });
  });

  it("읽기만 되는 게시판이면 거부한다", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));
    await expect(service.createComment(other, input)).rejects.toThrow(ForbiddenError);
    expect(createComment).not.toHaveBeenCalled();
  });

  it("지워진 글에는 못 단다", async () => {
    findPost.mockResolvedValue(post({ deletedAt: new Date() }));
    await expect(service.createComment(student, input)).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });

  it("없는 글이면 POST_NOT_FOUND", async () => {
    findPost.mockResolvedValue(null);
    await expect(service.createComment(student, input)).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });
});

describe("listComments", () => {
  it("읽기 문을 지나 뷰로 바꿔 준다 — 글쓴이 배지가 붙는다", async () => {
    listComments.mockResolvedValue([comment(), comment({ id: "cm2", authorUserId: "s-9", authorName: "최유진" })]);

    const views = await service.listComments(other, "p1");

    expect(getReadableBySlug).toHaveBeenCalledWith(other, "free");
    expect(views[0].byPostAuthor).toBe(true);
    expect(views[1].byPostAuthor).toBe(false);
    expect(views[0].author?.display).toBe("김민준님");
  });

  it("익명 게시판이면 작성자가 없다 — 교사에게도", async () => {
    findPost.mockResolvedValue(post({ community: anonBoard }));
    getReadableBySlug.mockResolvedValue(anonBoard);
    listComments.mockResolvedValue([comment()]);

    const views = await service.listComments(admin, "p1");

    expect(views[0].author).toBeNull();
    expect(JSON.stringify(views)).not.toContain("김민준");
    // 글쓴이 배지는 익명에서도 켜진다 — 누구인지는 여전히 모른다.
    expect(views[0].byPostAuthor).toBe(true);
  });
});

describe("deleteComment", () => {
  const input = { commentId: "cm1", reason: null };

  beforeEach(() => {
    findComment.mockResolvedValue({ ...comment(), post: post() });
  });

  it("본인은 지운다 — byModerator는 false", async () => {
    await service.deleteComment(student, input);

    expect(markCommentDeleted).toHaveBeenCalledWith("cm1", "s-1", null, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:comment:delete",
        metadata: expect.objectContaining({ byModerator: false, postId: "p1" }),
      }),
      txClient,
    );
  });

  it("교사는 남의 댓글도 지운다 — byModerator는 true", async () => {
    await service.deleteComment(admin, input);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ byModerator: true }),
      }),
      txClient,
    );
  });

  it("남은 못 지운다", async () => {
    await expect(service.deleteComment(other, input)).rejects.toThrow(ForbiddenError);
  });

  it("없는 댓글이면 COMMENT_NOT_FOUND", async () => {
    findComment.mockResolvedValue(null);
    await expect(service.deleteComment(student, input)).rejects.toThrow(
      new CommunityError("COMMENT_NOT_FOUND"),
    );
  });

  it("이미 지운 댓글이면 감사로그를 또 남기지 않는다", async () => {
    markCommentDeleted.mockResolvedValue(0);
    await service.deleteComment(student, input);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/comment.service.test.ts`
Expected: FAIL — `comment.service`가 없다.

- [ ] **Step 5: 서비스를 쓴다**

`src/modules/community/comment.service.ts`:

```ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import type { CreateCommentInput, DeleteCommentInput } from "./community.schema";
import { toCommentView, type CommentView } from "./community.view";

/**
 * 댓글 서비스. 수정은 없다 — 쓰기와 삭제뿐이다(설계 §범위).
 *
 * 글 서비스와 마찬가지로 게시판 권한은 board.service의 문 둘로만 얻는다.
 */

async function denyOwnership(
  actor: SessionUser,
  action: string,
  commentId: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "CommunityComment",
      targetId: commentId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/** 글을 집어 오며 "살아 있는가"까지 본다. 지워진 글에는 댓글이 안 달린다. */
async function loadLivePost(postId: string) {
  const post = await repo.findPost(postId);
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  return post;
}

export async function listComments(
  actor: SessionUser,
  postId: string,
): Promise<CommentView[]> {
  const post = await loadLivePost(postId);
  // 글을 이미 읽었어도 게시판 권한을 다시 묻는다 — 주소만 알면 남의 게시판
  // 댓글이 열리는 길을 만들지 않는다.
  const community = await board.getReadableBySlug(actor, post.community.slug);

  const rows = await repo.listComments(postId);
  return rows.map((row) => toCommentView(row, post, community, actor));
}

export async function createComment(
  actor: SessionUser,
  input: CreateCommentInput,
): Promise<{ slug: string; postId: string }> {
  const post = await loadLivePost(input.postId);
  const community = await board.getWritableBySlug(actor, post.community.slug);

  await withTransaction(async (tx) => {
    const { id } = await repo.createComment(
      {
        postId: input.postId,
        body: input.body,
        authorUserId: actor.id,
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:comment:create",
        targetType: "CommunityComment",
        targetId: id,
        metadata: { postId: input.postId, slug: community.slug },
      },
      tx,
    );
  });

  return { slug: community.slug, postId: input.postId };
}

export async function deleteComment(
  actor: SessionUser,
  input: DeleteCommentInput,
): Promise<{ slug: string; postId: string }> {
  const comment = await repo.findComment(input.commentId);
  if (!comment || comment.deletedAt) throw new CommunityError("COMMENT_NOT_FOUND");

  const community = await board.getReadableBySlug(actor, comment.post.community.slug);

  const isMine = comment.authorUserId !== null && comment.authorUserId === actor.id;
  const isModerator = actor.role === "ADMIN";
  if (!isMine && !isModerator) {
    await denyOwnership(actor, "community:comment:delete", input.commentId);
  }

  await withTransaction(async (tx) => {
    const removed = await repo.markCommentDeleted(
      input.commentId,
      actor.id,
      input.reason,
      tx,
    );
    if (removed === 0) return;

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:comment:delete",
        targetType: "CommunityComment",
        targetId: input.commentId,
        metadata: {
          postId: comment.postId,
          slug: community.slug,
          byModerator: !isMine && isModerator,
          reason: input.reason,
        },
      },
      tx,
    );
  });

  return { slug: community.slug, postId: comment.postId };
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/comment.service.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/modules/community tests/modules/community
git commit -m "feat(community): 댓글 서비스를 넣는다"
```

---

### Task 12: 댓글 화면

**Files:**
- Modify: `src/app/(app)/community/[slug]/actions.ts` (댓글 액션 둘 추가)
- Modify: `src/app/(app)/community/[slug]/[postId]/page.tsx`
- Create: `src/app/(app)/community/[slug]/[postId]/comment-form.tsx` (클라이언트)
- Create: `src/app/(app)/community/[slug]/[postId]/comment-list.tsx`
- Create: `src/app/(app)/community/[slug]/[postId]/delete-comment.tsx` (클라이언트)

**Interfaces:**
- Consumes: Task 11의 `listComments`·`createComment`·`deleteComment`
- Produces: 서버 액션 `createCommentAction` · `deleteCommentAction`

- [ ] **Step 1: 액션 둘을 더한다**

`actions.ts`에 붙인다. `MESSAGES`에 `COMMENT_NOT_FOUND: "댓글을 찾을 수 없습니다."`를 더한다.

```ts
export async function createCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = createCommentSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string; postId: string };
  try {
    result = await commentService.createComment(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  // 목록의 댓글 수가 바뀐다.
  revalidatePath(`/community/${result.slug}`);
  return { ok: true };
}

export async function deleteCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = deleteCommentSchema.safeParse({
    commentId: formData.get("commentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string; postId: string };
  try {
    result = await commentService.deleteComment(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  revalidatePath(`/community/${result.slug}`);
  return { ok: true };
}
```

import 두 줄을 파일 위에 더한다.

```ts
import {
  createCommentSchema,
  deleteCommentSchema,
} from "@/modules/community/community.schema";
import * as commentService from "@/modules/community/comment.service";
```

- [ ] **Step 2: 댓글 목록을 쓴다**

`comment-list.tsx`(서버 컴포넌트). 표가 아니라 `<ul>`이다 — 댓글은 열이 없다.

- 한 줄에 `<li className="border-b border-line2 py-3 last:border-0">`
- 머리: `comment.author?.display ?? "익명"` + `byPostAuthor`면 `Badge`「글쓴이」 + 작성 시각(`text-caption text-mut`)
- 본문: `whitespace-pre-wrap text-sm`
- `canDelete`면 오른쪽에 `DeleteComment`
- 비면 `EmptyState variant="inside"`로 「아직 댓글이 없습니다.」

**익명 게시판에서 작성자 자리는 「익명」이다.** 목록의 작성자 열은 뺐지만(Task 9) 댓글은 다르다 — 여기서는 그 자리가 비면 누가 말했는지가 아니라 말이 몇 개인지도 안 읽힌다.

- [ ] **Step 3: 댓글 폼을 쓴다**

`comment-form.tsx` — `"use client"`. `<textarea>` + `Button`. **확인 모달을 달지 않는다**(설계 §화면). `useActionState`가 성공하면 `formRef.current?.reset()`으로 칸을 비운다.

- [ ] **Step 4: 삭제 모달을 쓴다**

`delete-comment.tsx` — `ConfirmDialog`. `delete-post.tsx`와 같은 모양이되 `name="commentId"`이고, `description`은 「이 댓글이 사라집니다.」다.

- [ ] **Step 5: 글 상세에 붙인다**

`[postId]/page.tsx`에서 `listComments(actor, postId)`를 부르고, 글 카드 아래에 `SectionCard title="댓글" aside={개수} flush`로 목록을, 그 아래에 폼을 놓는다.

**쓰기 권한이 없으면 폼 자리에 아무것도 그리지 않는다** — `getPost`가 이미 `canWrite`를 함께 준다(Task 8의 `PostDetail`). 화면에서 권한을 다시 판정하지 않는다.

- [ ] **Step 6: 브라우저에서 확인한다**

| 확인 | 기대 |
|---|---|
| 자유게시판 글에 댓글을 단다 | 바로 뜨고 칸이 비워진다 |
| 글쓴이가 자기 글에 댓글 | 「글쓴이」 배지 |
| 목록으로 돌아간다 | 제목 옆 댓글 수가 늘었다 |
| 남의 댓글 | 삭제가 없다 |
| 교사로 남의 댓글 | 삭제가 있고 사유가 필수다 |
| 익명 게시판 댓글 | 전부 「익명」, 글쓴이 배지만 붙는다 |
| 공지(읽기 전용)에서 | 댓글 폼이 아예 없다 |

- [ ] **Step 7: 전체 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add src/app/\(app\)/community
git commit -m "feat(community): 글에 댓글을 단다"
```

---

## 스펙과 어긋나는 한 줄

설계 문서 §화면의 확인 모달 표에 **「첨부 제거 — 모달 있음」**이 있으나, 구현에는
첨부만 따로 지우는 동작이 없다. 첨부는 **글 수정의 일부**로만 빠지고, 그 저장에는
이미 확인 모달이 붙는다(글 수정). 고르개의 「빼기」는 저장 전 목록에서 빼는 것이라
되돌릴 것이 없다.

**Task 16을 끝낼 때 스펙의 그 줄을 고친다.**

```markdown
| 첨부 빼기 (글 수정 중) | **없음** — 저장할 때 글 수정 모달이 한 번 묻는다 | — |
```

---

# 4단계 — 첨부

## 파일 구조 (4단계에서 생기는 것)

| 파일 | 책임 |
|---|---|
| `src/modules/community/community.storage.ts` | 디스크 I/O. **파일만 다루고 DB를 모른다** |
| `src/modules/community/attachment.service.ts` | storage와 repo를 잇는다 |
| `src/app/api/community/attachments/route.ts` | 업로드 (POST) |
| `src/app/api/community/attachments/[attachmentId]/route.ts` | 내려받기 (GET) |
| `Dockerfile` · `docker-compose.yml` · `docs/deploy.md` (수정) | 볼륨과 프록시 |

---

### Task 13: `community.storage.ts` — 디스크

**Files:**
- Create: `src/modules/community/community.storage.ts`
- Test: `tests/modules/community/storage.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음 (순수 + fs)
- Produces:
  - `type AllowedType = { mime: string; extensions: string[]; inline: boolean }`
  - `classifyUpload(filename, mimeType, size): { ok: true; mimeType: string; inline: boolean } | { ok: false; code: "ATTACHMENT_TYPE" | "ATTACHMENT_TOO_LARGE" }`
  - `newStorageKey(): string`
  - `storagePath(key: string, at: Date): string` — 볼륨 루트부터의 절대 경로
  - `writeAttachment(key, at, bytes): Promise<void>`
  - `readAttachment(key, at): Promise<Buffer>`
  - `deleteAttachment(key, at): Promise<void>`
  - `contentDisposition(filename, inline): string`

- [ ] **Step 1: `.gitignore`에 로컬 업로드 폴더를 넣는다**

```
# 커뮤니티 첨부 (로컬 개발). 운영은 도커 볼륨이다.
/.uploads
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/modules/community/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyUpload,
  contentDisposition,
  newStorageKey,
  storagePath,
} from "@/modules/community/community.storage";

const MB = 1024 * 1024;

describe("classifyUpload", () => {
  it("허용 이미지는 인라인이다", () => {
    const r = classifyUpload("사진.png", "image/png", 1000);
    expect(r).toEqual({ ok: true, mimeType: "image/png", inline: true });
  });

  it("문서는 내려받기다", () => {
    const r = classifyUpload("보고서.pdf", "application/pdf", 1000);
    expect(r).toEqual({ ok: true, mimeType: "application/pdf", inline: false });
  });

  it("한글 문서(hwp)를 받는다", () => {
    expect(classifyUpload("가정통신문.hwp", "", 1000).ok).toBe(true);
    expect(classifyUpload("가정통신문.hwpx", "", 1000).ok).toBe(true);
  });

  it("**svg는 거부한다** — 같은 출처에서 열리면 스크립트가 돈다", () => {
    const r = classifyUpload("icon.svg", "image/svg+xml", 100);
    expect(r).toEqual({ ok: false, code: "ATTACHMENT_TYPE" });
  });

  it.each(["a.html", "a.htm", "a.js", "a.exe", "a.sh", "a"])(
    "%s는 거부한다",
    (name) => {
      expect(classifyUpload(name, "text/html", 100).ok).toBe(false);
    },
  );

  it("확장자가 맞아도 5MB를 넘으면 거부한다", () => {
    const r = classifyUpload("큰파일.pdf", "application/pdf", 5 * MB + 1);
    expect(r).toEqual({ ok: false, code: "ATTACHMENT_TOO_LARGE" });
  });

  it("정확히 5MB는 통과한다", () => {
    expect(classifyUpload("딱맞음.pdf", "application/pdf", 5 * MB).ok).toBe(true);
  });

  it("빈 파일은 거부한다", () => {
    expect(classifyUpload("빈.pdf", "application/pdf", 0).ok).toBe(false);
  });

  it("**타입은 확장자가 정한다 — 브라우저가 보낸 mimeType을 믿지 않는다**", () => {
    const r = classifyUpload("보고서.pdf", "text/html", 1000);
    expect(r).toEqual({ ok: true, mimeType: "application/pdf", inline: false });
  });

  it("대문자 확장자도 같다", () => {
    expect(classifyUpload("사진.PNG", "", 100)).toMatchObject({ ok: true, inline: true });
  });
});

describe("newStorageKey", () => {
  it("32자 소문자 16진수다", () => {
    expect(newStorageKey()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("부를 때마다 다르다", () => {
    const keys = new Set(Array.from({ length: 100 }, () => newStorageKey()));
    expect(keys.size).toBe(100);
  });
});

describe("storagePath", () => {
  const at = new Date("2026-08-28T01:00:00.000Z");

  it("연·월로 나눠 담는다 — 한 디렉터리에 무한정 쌓이지 않게", () => {
    const key = "a".repeat(32);
    expect(storagePath(key, at)).toMatch(/\/2026\/08\/a{32}$/);
  });

  it.each([
    ["경로 탈출", "../../etc/passwd"],
    ["슬래시", "a/b"],
    ["짧은 것", "abc"],
    ["대문자", "A".repeat(32)],
    ["빈 것", ""],
  ])("%s 키는 던진다 — 파일 이름에 닿기 전에 막는다", (_label, key) => {
    expect(() => storagePath(key, at)).toThrow();
  });
});

describe("contentDisposition", () => {
  it("내려받기는 attachment다", () => {
    expect(contentDisposition("보고서.pdf", false)).toContain("attachment;");
  });

  it("이미지는 inline이다", () => {
    expect(contentDisposition("사진.png", true)).toContain("inline;");
  });

  it("한글 이름을 RFC 5987로 싣는다", () => {
    const value = contentDisposition("가정통신문.hwp", false);
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain(encodeURIComponent("가정통신문.hwp"));
  });

  it("따옴표·줄바꿈이 헤더를 깨지 못한다", () => {
    const value = contentDisposition('a"b\r\nX-Evil: 1.pdf', false);
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).not.toMatch(/filename="[^"]*"[^;]/);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/storage.test.ts`
Expected: FAIL — 모듈이 없다.

- [ ] **Step 4: storage를 쓴다**

`src/modules/community/community.storage.ts`:

```ts
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_ATTACHMENT_BYTES } from "./community.schema";

/**
 * 첨부 파일의 디스크 쪽. **DB를 모른다** — 여기 있는 것은 바이트와 경로뿐이다.
 *
 * 설계의 핵심은 하나다: **올린 사람이 붙인 파일 이름이 디스크에 절대 닿지
 * 않는다.** 경로 탈출(`../../etc/passwd`)과 확장자 위조를 검사로 막는 대신,
 * 그 값이 파일 이름이 될 길 자체를 없앤다. 디스크 이름은 랜덤 32자이고
 * 원래 이름은 DB에만 있다.
 */

/**
 * 볼륨 뿌리. 운영은 도커 볼륨(`/app/uploads`), 로컬은 저장소 안 `.uploads`다.
 * 로컬 기본값을 두는 이유는 개발자가 환경변수를 안 넣어도 첨부가 도는 편이
 * 낫기 때문이다 — `.gitignore`에 들어 있다.
 */
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

/** 디스크 이름 규격. 이 정규식이 경로 탈출을 막는 유일한 문이다. */
const STORAGE_KEY = /^[0-9a-f]{32}$/;

type Allowed = { mime: string; inline: boolean };

/**
 * 허용 목록. **확장자가 타입을 정한다** — 브라우저가 보낸 `Content-Type`은
 * 올리는 쪽이 마음대로 적을 수 있어 믿지 않는다.
 *
 * `inline: true`는 브라우저에 그대로 보여 주는 것이고, 그 자리에 스크립트가
 * 돌 수 있는 형식이 있으면 안 된다. **svg는 그래서 목록에 없다** — 같은
 * 출처에서 열리면 그 안의 스크립트가 세션 쿠키에 닿는다. html·js도 없다.
 */
const ALLOWED: Record<string, Allowed> = {
  png: { mime: "image/png", inline: true },
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  gif: { mime: "image/gif", inline: true },
  webp: { mime: "image/webp", inline: true },

  pdf: { mime: "application/pdf", inline: false },
  hwp: { mime: "application/x-hwp", inline: false },
  hwpx: { mime: "application/hwp+zip", inline: false },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inline: false,
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inline: false,
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    inline: false,
  },
  txt: { mime: "text/plain", inline: false },
  zip: { mime: "application/zip", inline: false },
};

export type UploadVerdict =
  | { ok: true; mimeType: string; inline: boolean }
  | { ok: false; code: "ATTACHMENT_TYPE" | "ATTACHMENT_TOO_LARGE" };

/**
 * 받을 수 있는 파일인가. **라우트 핸들러가 바이트를 쓰기 전에 부른다.**
 * `bodySizeLimit`은 라우트 핸들러에 안 걸리므로, 용량을 재는 곳이 여기뿐이다.
 */
export function classifyUpload(
  filename: string,
  _mimeType: string,
  size: number,
): UploadVerdict {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  const allowed = ALLOWED[ext];
  if (!allowed) return { ok: false, code: "ATTACHMENT_TYPE" };

  // 빈 파일도 거부한다 — 고를 때 잘못 누른 것이지 올리려던 것이 아니다.
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: "ATTACHMENT_TOO_LARGE" };
  }

  return { ok: true, mimeType: allowed.mime, inline: allowed.inline };
}

export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * 디스크 경로. 키가 규격에 안 맞으면 **던진다** — 조용히 정규화하면
 * 언젠가 정규화가 틀리는 날이 온다. 연·월로 나눠 한 디렉터리에 파일이
 * 무한정 쌓이지 않게 한다.
 */
export function storagePath(key: string, at: Date): string {
  if (!STORAGE_KEY.test(key)) {
    throw new Error(`storageKey가 규격에 맞지 않습니다: ${key.slice(0, 8)}…`);
  }
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return path.join(UPLOAD_ROOT, year, month, key);
}

export async function writeAttachment(
  key: string,
  at: Date,
  bytes: Buffer,
): Promise<void> {
  const target = storagePath(key, at);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export function readAttachment(key: string, at: Date): Promise<Buffer> {
  return readFile(storagePath(key, at));
}

/**
 * 지운다. **없어도 오류를 내지 않는다** — 이 함수를 부르는 자리는 DB 행을
 * 이미 지운 뒤라, 파일이 없다고 거기서 멈추면 되레 정리가 막힌다.
 */
export async function deleteAttachment(key: string, at: Date): Promise<void> {
  await rm(storagePath(key, at), { force: true });
}

/**
 * `Content-Disposition`. 원래 이름이 헤더에 들어가는 유일한 자리다 —
 * 따옴표·줄바꿈이 섞이면 헤더가 쪼개져 응답 전체를 조작할 수 있으므로,
 * ASCII 폴백은 위험한 문자를 지우고 진짜 이름은 RFC 5987로 인코딩해 싣는다.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\;\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/storage.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/modules/community/community.storage.ts tests/modules/community/storage.test.ts .gitignore
git commit -m "feat(community): 첨부 파일의 디스크 층을 넣는다"
```

---

### Task 14: `attachment.service.ts` — 문 셋을 세운다

**Files:**
- Modify: `src/modules/community/community.repo.ts`
- Create: `src/modules/community/attachment.service.ts`
- Test: `tests/modules/community/attachment.service.test.ts`

**Interfaces:**
- Consumes: Task 5의 `getWritableBySlug`, Task 13의 storage
- Produces:
  - repo: `countPending(uploaderUserId, db?)` · `listStalePending(uploaderUserId, before, db?)` · `deleteAttachments(ids, db?)` · `createAttachment(data, db?)` · `findAttachmentForDownload(id, db?)`
  - service: `uploadAttachment(actor, { slug, filename, mimeType, bytes })` → `{ id, filename, size }` · `getDownload(actor, attachmentId)` → `{ bytes, filename, mimeType, inline }`

- [ ] **Step 1: repo에 첨부 함수를 더한다**

```ts
/** 아직 글에 안 붙은 내 첨부 수. 계정당 디스크 사용을 묶는 상한이 이 값을 본다. */
export function countPending(
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.communityAttachment.count({ where: { uploaderUserId, postId: null } });
}

/** 내 것 중 오래된 고아. 남의 행은 애초에 조건에 안 걸린다. */
export function listStalePending(
  uploaderUserId: string,
  before: Date,
  db: DbClient = prisma,
) {
  return db.communityAttachment.findMany({
    where: { uploaderUserId, postId: null, createdAt: { lt: before } },
    select: { id: true, storageKey: true, createdAt: true },
  });
}

export async function deleteAttachments(
  ids: string[],
  db: DbClient = prisma,
): Promise<void> {
  if (ids.length === 0) return;
  await db.communityAttachment.deleteMany({ where: { id: { in: ids } } });
}

export type NewAttachment = {
  uploaderUserId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
};

export async function createAttachment(
  data: NewAttachment,
  db: DbClient = prisma,
): Promise<{ id: string; createdAt: Date }> {
  return db.communityAttachment.create({
    data,
    select: { id: true, createdAt: true },
  });
}

/**
 * 내려받기용. 글과 게시판까지 함께 읽는다 — 권한을 판정하려면 게시판이,
 * 지워진 글인지 보려면 글이 필요하고, 두 번 왕복할 이유가 없다.
 */
export function findAttachmentForDownload(id: string, db: DbClient = prisma) {
  return db.communityAttachment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/modules/community/attachment.service.test.ts`. **이 테스트의 목적은 「라우트가 세워야 할 문 셋이 실제로 서 있는가」다.**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const countPending = vi.fn();
const listStalePending = vi.fn();
const deleteAttachments = vi.fn();
const createAttachment = vi.fn();
const findAttachmentForDownload = vi.fn();
const getWritableBySlug = vi.fn();
const getReadableBySlug = vi.fn();
const writeAttachment = vi.fn();
const readAttachment = vi.fn();
const deleteAttachment = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "attachment-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  countPending,
  listStalePending,
  deleteAttachments,
  createAttachment,
  findAttachmentForDownload,
}));
vi.mock("@/modules/community/board.service", () => ({
  getWritableBySlug,
  getReadableBySlug,
}));
vi.mock("@/modules/community/community.storage", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/community/community.storage")
  >("@/modules/community/community.storage");
  // classifyUpload·newStorageKey는 진짜를 쓴다 — 허용 목록이 이 서비스의
  // 문 가운데 하나라 목으로 가리면 검증이 사라진다.
  return { ...actual, writeAttachment, readAttachment, deleteAttachment };
});
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/attachment.service");

function user(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "김민준",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

const board = {
  id: "c1",
  slug: "free",
  name: "자유게시판",
  anonymous: false,
  allowAttachments: true,
  active: true,
  readRoles: ["STUDENT"],
  writeRoles: ["STUDENT"],
};

const upload = {
  slug: "free",
  filename: "사진.png",
  mimeType: "image/png",
  bytes: Buffer.from("PNG"),
};

beforeEach(() => {
  vi.clearAllMocks();
  getWritableBySlug.mockResolvedValue(board);
  getReadableBySlug.mockResolvedValue(board);
  countPending.mockResolvedValue(0);
  listStalePending.mockResolvedValue([]);
  // 약속을 돌려주게 둔다 — 서비스가 `.catch()`를 붙이는 자리가 있다.
  deleteAttachments.mockResolvedValue(undefined);
  writeAttachment.mockResolvedValue(undefined);
  deleteAttachment.mockResolvedValue(undefined);
  createAttachment.mockResolvedValue({
    id: "a1",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
  });
});

describe("uploadAttachment — 문 ①: 권한", () => {
  it("쓸 수 있는 게시판이면 받는다", async () => {
    const result = await service.uploadAttachment(student, upload);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(writeAttachment).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "a1", filename: "사진.png" });
  });

  it("**쓸 수 없으면 바이트 하나 쓰기 전에 막는다**", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));

    await expect(service.uploadAttachment(parent, upload)).rejects.toThrow(ForbiddenError);
    expect(writeAttachment).not.toHaveBeenCalled();
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it("첨부를 안 받는 게시판이면 거부한다", async () => {
    getWritableBySlug.mockResolvedValue({ ...board, allowAttachments: false });

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_ALLOWED"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });
});

describe("uploadAttachment — 문 ②: 형식과 용량", () => {
  it("svg는 거부하고 디스크를 안 건드린다", async () => {
    await expect(
      service.uploadAttachment(student, { ...upload, filename: "icon.svg" }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_TYPE"));
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("5MB를 넘으면 거부한다", async () => {
    const big = { ...upload, filename: "큰.pdf", bytes: Buffer.alloc(5 * 1024 * 1024 + 1) };
    await expect(service.uploadAttachment(student, big)).rejects.toThrow(
      new CommunityError("ATTACHMENT_TOO_LARGE"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });
});

describe("uploadAttachment — 문 ③: 미결 첨부 수", () => {
  it("10개를 넘으면 거부한다", async () => {
    countPending.mockResolvedValue(10);
    await expect(service.uploadAttachment(student, upload)).rejects.toThrow(
      new CommunityError("ATTACHMENT_PENDING_LIMIT"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("9개면 통과한다", async () => {
    countPending.mockResolvedValue(9);
    await expect(service.uploadAttachment(student, upload)).resolves.toBeDefined();
  });
});

describe("uploadAttachment — 고아 정리", () => {
  it("올릴 때마다 내 오래된 고아를 지운다 — DB와 디스크 둘 다", async () => {
    listStalePending.mockResolvedValue([
      { id: "old1", storageKey: "a".repeat(32), createdAt: new Date("2026-08-27T00:00:00.000Z") },
    ]);

    await service.uploadAttachment(student, upload);

    expect(listStalePending).toHaveBeenCalledWith("s-1", expect.any(Date));
    expect(deleteAttachments).toHaveBeenCalledWith(["old1"]);
    expect(deleteAttachment).toHaveBeenCalledWith("a".repeat(32), expect.any(Date));
  });

  it("정리가 실패해도 업로드는 성공한다 — 청소가 본 일을 막지 않는다", async () => {
    listStalePending.mockRejectedValue(new Error("db down"));
    await expect(service.uploadAttachment(student, upload)).resolves.toBeDefined();
  });
});

describe("uploadAttachment — 감사로그", () => {
  it("파일 이름·크기를 남긴다", async () => {
    await service.uploadAttachment(student, upload);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:create",
        targetId: "a1",
        metadata: expect.objectContaining({ filename: "사진.png", size: 3 }),
      }),
      txClient,
    );
  });
});

describe("uploadAttachment — DB와 디스크의 순서", () => {
  it("**파일은 커밋 뒤에 쓴다** — 트랜잭션 안에서 쓰면 롤백 때 파일이 영구히 샌다", async () => {
    const order: string[] = [];
    createAttachment.mockImplementation(async () => {
      order.push("row");
      return { id: "a1", createdAt: new Date("2026-08-28T00:00:00.000Z") };
    });
    writeAttachment.mockImplementation(async () => {
      order.push("file");
    });

    await service.uploadAttachment(student, upload);

    expect(order).toEqual(["row", "file"]);
  });

  it("디스크 쓰기가 실패하면 행을 지우고 올린다 — 가리킬 것이 없는 행을 안 남긴다", async () => {
    writeAttachment.mockRejectedValue(new Error("ENOSPC"));

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow("ENOSPC");
    expect(deleteAttachments).toHaveBeenCalledWith(["a1"]);
  });

  it("그 정리마저 실패해도 원래 오류를 올린다", async () => {
    writeAttachment.mockRejectedValue(new Error("ENOSPC"));
    deleteAttachments.mockRejectedValue(new Error("db down"));

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow("ENOSPC");
  });
});

describe("getDownload", () => {
  const attachment = {
    id: "a1",
    postId: "p1",
    storageKey: "b".repeat(32),
    filename: "사진.png",
    mimeType: "image/png",
    size: 3,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    post: { id: "p1", deletedAt: null, community: board },
  };

  beforeEach(() => {
    findAttachmentForDownload.mockResolvedValue(attachment);
    readAttachment.mockResolvedValue(Buffer.from("PNG"));
  });

  it("읽기 권한이 있으면 준다 — 이미지는 inline", async () => {
    const result = await service.getDownload(student, "a1");

    expect(getReadableBySlug).toHaveBeenCalledWith(student, "free");
    expect(result).toMatchObject({ filename: "사진.png", mimeType: "image/png", inline: true });
  });

  it("읽기 권한이 없으면 거부하고 파일을 안 읽는다", async () => {
    getReadableBySlug.mockRejectedValue(new ForbiddenError("community:read"));

    await expect(service.getDownload(parent, "a1")).rejects.toThrow(ForbiddenError);
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it("지워진 글의 첨부는 막는다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      post: { ...attachment.post, deletedAt: new Date() },
    });
    await expect(service.getDownload(student, "a1")).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_FOUND"),
    );
  });

  it("**아직 글에 안 붙은 첨부는 올린 본인만 본다**", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      postId: null,
      post: null,
      uploaderUserId: "s-1",
    });

    await expect(service.getDownload(student, "a1")).resolves.toBeDefined();
    await expect(service.getDownload(user("STUDENT", "s-9"), "a1")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("없는 첨부면 ATTACHMENT_NOT_FOUND", async () => {
    findAttachmentForDownload.mockResolvedValue(null);
    await expect(service.getDownload(student, "a1")).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_FOUND"),
    );
  });

  it("문서는 inline이 아니다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      filename: "보고서.pdf",
      mimeType: "application/pdf",
    });
    const result = await service.getDownload(student, "a1");
    expect(result.inline).toBe(false);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/attachment.service.test.ts`
Expected: FAIL — `attachment.service`가 없다.

- [ ] **Step 4: 서비스를 쓴다**

`src/modules/community/attachment.service.ts`:

```ts
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import { MAX_PENDING_ATTACHMENTS } from "./community.schema";
import {
  classifyUpload,
  deleteAttachment,
  newStorageKey,
  readAttachment,
  writeAttachment,
} from "./community.storage";

/**
 * 첨부 서비스. **여기가 업로드의 문이다.**
 *
 * 이 경로는 글이 생기기 전에 돌고 서버 액션이 아니다. 그래서 다른 쓰기 경로가
 * 당연히 가지고 있는 문 셋을 스스로 세운다 — 하나라도 빠지면 로그인한 아무나
 * 디스크를 채울 수 있다.
 *
 *   ① 권한   — 그 게시판에 쓸 수 있는가, 첨부를 받는 게시판인가
 *   ② 형식·용량 — `bodySizeLimit`은 라우트 핸들러에 안 걸린다. 재는 곳이 여기뿐이다
 *   ③ 미결 수 — 고아 정리가 "그 사람이 다음에 올릴 때"만 돌기 때문에 필요하다
 *
 * 셋을 **바이트를 쓰기 전에** 통과시킨다.
 */

/** 고아로 보는 나이. 글쓰기 한 번이 이보다 오래 걸리는 일은 없다. */
const PENDING_TTL_MS = 60 * 60 * 1000;

export type UploadInput = {
  slug: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export async function uploadAttachment(
  actor: SessionUser,
  input: UploadInput,
): Promise<{ id: string; filename: string; size: number; mimeType: string }> {
  // ① 권한. 던지면 여기서 끝난다 — 아래 어느 줄도 안 돈다.
  const community = await board.getWritableBySlug(actor, input.slug);
  if (!community.allowAttachments) throw new CommunityError("ATTACHMENT_NOT_ALLOWED");

  // ② 형식·용량.
  const verdict = classifyUpload(input.filename, input.mimeType, input.bytes.byteLength);
  if (!verdict.ok) throw new CommunityError(verdict.code);

  // ③ 미결 수. 정리를 먼저 돌려 방금 만료된 것이 상한을 차지하지 않게 한다.
  await sweepMyOrphans(actor.id);
  if ((await repo.countPending(actor.id)) >= MAX_PENDING_ATTACHMENTS) {
    throw new CommunityError("ATTACHMENT_PENDING_LIMIT");
  }

  const storageKey = newStorageKey();

  // DB 먼저, 디스크는 커밋 뒤. **순서를 뒤집으면 파일이 영구히 샌다** —
  // 트랜잭션 안에서 파일을 쓰면 감사 기록이나 커밋이 실패했을 때 행은 사라지고
  // 파일만 남는데, 고아 정리는 `CommunityAttachment` 행을 훑으므로 그 파일을
  // 영영 못 찾는다.
  //
  // 이 순서가 남기는 것은 "행은 있고 파일이 없는" 짧은 창뿐이고, 그건 내려받기
  // 라우트가 ENOENT → 404로 정직하게 답한다. 5MB 쓰기가 Postgres 커넥션을 쥔
  // 채 돌지 않는 것은 덤이다.
  const { id, createdAt } = await withTransaction(async (tx) => {
    const created = await repo.createAttachment(
      {
        uploaderUserId: actor.id,
        storageKey,
        filename: input.filename,
        mimeType: verdict.mimeType,
        size: input.bytes.byteLength,
      },
      tx,
    );

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:attachment:create",
        targetType: "CommunityAttachment",
        targetId: created.id,
        metadata: {
          slug: community.slug,
          filename: input.filename,
          size: input.bytes.byteLength,
          mimeType: verdict.mimeType,
        },
      },
      tx,
    );

    return created;
  });

  try {
    // **경로 계산이 행의 createdAt을 쓴다.** 읽을 때도 같은 값을 쓰므로 둘이
    // 어긋날 수 없다 — 지금 시각을 다시 재면 자정을 넘기는 순간 못 찾는다.
    await writeAttachment(storageKey, createdAt, input.bytes);
  } catch (error) {
    // 쓰기가 실패했으면 가리킬 것이 없는 행이다. 최선을 다해 지우고 올린다 —
    // 이 정리가 실패해도 남는 것은 행 하나뿐이라 고아 정리가 나중에 걷어 간다.
    await repo.deleteAttachments([id]).catch(() => {});
    throw error;
  }

  return {
    id,
    filename: input.filename,
    size: input.bytes.byteLength,
    mimeType: verdict.mimeType,
  };
}

/**
 * 내 고아만 지운다. 크론 없이 수렴하고 남의 행은 건드리지 않는다.
 * **실패해도 삼킨다** — 청소가 본 일을 막으면 안 된다.
 */
async function sweepMyOrphans(uploaderUserId: string): Promise<void> {
  try {
    const stale = await repo.listStalePending(
      uploaderUserId,
      new Date(Date.now() - PENDING_TTL_MS),
    );
    if (stale.length === 0) return;

    await repo.deleteAttachments(stale.map((a) => a.id));
    for (const attachment of stale) {
      await deleteAttachment(attachment.storageKey, attachment.createdAt);
    }
  } catch {
    // 청소 실패는 업로드를 막지 않는다.
  }
}

export type Download = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  inline: boolean;
};

export async function getDownload(
  actor: SessionUser,
  attachmentId: string,
): Promise<Download> {
  const attachment = await repo.findAttachmentForDownload(attachmentId);
  if (!attachment) throw new CommunityError("ATTACHMENT_NOT_FOUND");

  if (attachment.post === null) {
    // 아직 글에 안 붙은 첨부. 글쓰기 화면의 미리보기가 이 길로 온다.
    // **올린 본인만** — 게시판 권한으로는 가릴 수 없는 상태다.
    if (attachment.uploaderUserId === null || attachment.uploaderUserId !== actor.id) {
      throw new ForbiddenError("community:attachment:read");
    }
  } else {
    // 지워진 글의 첨부는 없는 것으로 친다 — 글이 안 보이는데 첨부만 열리면 안 된다.
    if (attachment.post.deletedAt) throw new CommunityError("ATTACHMENT_NOT_FOUND");
    // 게시판 읽기 권한을 다시 묻는다. 첨부 id만 알면 열리는 길을 만들지 않는다.
    await board.getReadableBySlug(actor, attachment.post.community.slug);
  }

  // 저장할 때 정한 타입을 그대로 믿지 않고 확장자로 다시 판정한다 — 허용
  // 목록이 좁아지면(svg를 실수로 넣었다가 빼면) 이미 올라온 파일도 함께
  // octet-stream 내려받기로 떨어진다. 막는 것이 아니라 인라인으로 안 여는 것이다.
  const verdict = classifyUpload(attachment.filename, attachment.mimeType, attachment.size);
  const inline = verdict.ok && verdict.inline;
  const mimeType = verdict.ok ? verdict.mimeType : "application/octet-stream";

  return {
    bytes: await readAttachment(attachment.storageKey, attachment.createdAt),
    filename: attachment.filename,
    mimeType,
    inline,
  };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run --project unit tests/modules/community/attachment.service.test.ts`
Expected: PASS

- [ ] **Step 6: 글 수정에서 뗀 파일을 디스크에서도 지운다**

Task 8의 `post.service.updatePost`는 `detachFromPost`가 돌려준 `detached`를 받아만 두고 비워 둔 자리가 있다. 이제 그 자리에 한 줄을 넣는다.

`post.service.ts` 위에 import를 더한다.

```ts
import { deleteAttachment } from "./community.storage";
```

`updatePost`의 트랜잭션 **뒤**, 「4단계에서 이 자리에 한 줄이 들어온다」라고 적힌 주석을 지우고 대신 넣는다.

```ts
  // 커밋된 뒤에 디스크를 지운다 — 롤백되면 행은 살아 있는데 파일만 사라진다.
  for (const file of detached) {
    await deleteAttachment(file.storageKey, file.createdAt);
  }
```

`post.service.test.ts`에 `community.storage` 목을 더한다. `detachFromPost`의 목 반환값은 이미 `[]`라 그대로 둔다.

```ts
const deleteAttachment = vi.fn();
vi.mock("@/modules/community/community.storage", () => ({ deleteAttachment }));
```

그리고 테스트를 하나 더한다 — **뗀 파일이 커밋 뒤에 지워지는가.**

```ts
  it("수정에서 뺀 첨부는 디스크에서도 지운다", async () => {
    detachFromPost.mockResolvedValue([
      { storageKey: "c".repeat(32), createdAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);

    await service.updatePost(student, input);

    expect(deleteAttachment).toHaveBeenCalledWith(
      "c".repeat(32),
      new Date("2026-08-01T00:00:00.000Z"),
    );
  });
```

- [ ] **Step 7: 전체 단위 검증**

Run: `npm run verify:unit`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add src/modules/community tests/modules/community
git commit -m "feat(community): 첨부 서비스가 업로드의 문 셋을 세운다"
```

---

### Task 15: 라우트 핸들러 둘

**Files:**
- Create: `src/app/api/community/attachments/route.ts`
- Create: `src/app/api/community/attachments/[attachmentId]/route.ts`

**Interfaces:**
- Consumes: Task 14의 `uploadAttachment` · `getDownload`
- Produces:
  - `POST /api/community/attachments` — multipart `{ slug, file }` → `201 { id, filename, size, mimeType }`
  - `GET /api/community/attachments/<id>` — 바이트

- [ ] **Step 1: 업로드 라우트를 쓴다**

`src/app/api/community/attachments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { uploadAttachment } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";

/**
 * 첨부 업로드. **서버 액션이 아니라 라우트 핸들러다** —
 * `next.config.ts`의 `serverActions.bodySizeLimit`(6mb)이 서버 액션 전체에
 * 걸려서, 첨부를 위해 그 값을 올리면 명단 업로드를 포함한 모든 액션의 상한이
 * 함께 올라간다. 앱 컨테이너는 mem_limit 512m이고 Next는 액션 본문을 메모리에
 * 담는다.
 *
 * 대신 **`bodySizeLimit`이 이 경로에는 안 걸린다.** 용량을 재는 곳은
 * attachment.service의 문 ②뿐이다.
 */

const MESSAGES: Record<string, string> = {
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
  ATTACHMENT_TYPE: "올릴 수 없는 형식입니다.",
  ATTACHMENT_TOO_LARGE: "파일은 5MB를 넘을 수 없습니다.",
  ATTACHMENT_PENDING_LIMIT:
    "글에 붙이지 않은 첨부가 너무 많습니다. 쓰던 글을 저장하거나 잠시 후 다시 시도해 주세요.",
};

/** 오류 코드 → HTTP 상태. 클라이언트가 다시 시도할지 정하는 데 쓴다. */
const STATUS: Record<string, number> = {
  COMMUNITY_NOT_FOUND: 404,
  ATTACHMENT_NOT_ALLOWED: 400,
  ATTACHMENT_TYPE: 415,
  ATTACHMENT_TOO_LARGE: 413,
  ATTACHMENT_PENDING_LIMIT: 429,
};

export async function POST(request: Request) {
  // 리다이렉트가 아니라 401이다 — fetch로 부르는 경로라 로그인 화면 HTML을
  // 돌려받아 봐야 클라이언트가 할 일이 없다.
  //
  // **`requireAuth`가 막는 것을 여기서 손으로 다시 세운다** — 중지·삭제된 계정과
  // **mustChangePassword까지.** 앞의 둘만 보면 비밀번호를 바꾸라고 붙잡아 둔
  // 계정이 이 경로로만 앱을 쓰게 된다.
  const actor = await getSessionUser();
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt || actor.mustChangePassword) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했습니다." }, { status: 400 });
  }

  const slug = String(form.get("slug") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "파일을 골라 주세요." }, { status: 400 });
  }

  try {
    const result = await uploadAttachment(actor, {
      slug,
      filename: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "이 게시판에 첨부할 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (error instanceof CommunityError) {
      return NextResponse.json(
        { error: MESSAGES[error.message] ?? "올리지 못했습니다." },
        { status: STATUS[error.message] ?? 400 },
      );
    }
    throw error;
  }
}
```

`file.arrayBuffer()`는 **용량 검사보다 먼저** 전체를 메모리에 담는다. 프록시의 본문 상한(Step 3)이 그 앞의 방어선이다 — 그것 없이 이 라우트만으로는 큰 요청이 메모리에 들어온 뒤에야 거부된다.

- [ ] **Step 2: 내려받기 라우트를 쓴다**

`src/app/api/community/attachments/[attachmentId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { getDownload } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import { contentDisposition } from "@/modules/community/community.storage";

/**
 * 첨부 내려받기. 권한이 붙은 자료라 정적 파일로 서빙하지 않는다 —
 * 세션과 게시판 읽기 권한을 확인한 뒤에만 바이트가 나간다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  // 업로드 라우트와 같은 문이다 — mustChangePassword까지 본다.
  const actor = await getSessionUser();
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt || actor.mustChangePassword) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const file = await getDownload(actor, attachmentId);

    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.filename, file.inline),
        // 브라우저가 타입을 추측해 실행하지 않게.
        "X-Content-Type-Options": "nosniff",
        // 허용 목록이 뚫려 HTML이 흘러도 아무것도 못 하게. 이 응답에만 건다 —
        // next.config.ts의 전역 CSP는 페이지용이라 여기서 덮어쓴다.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // 권한이 붙은 자료라 프록시가 들고 있으면 안 된다.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      // 권한이 없는 것과 없는 것을 가르지 않는다 — 가르면 첨부 id를 훑어
      // "존재하는 id"를 알아낼 수 있다.
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    if (error instanceof CommunityError) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    // 행은 있는데 디스크에 파일이 없는 경우(트랜잭션이 되돌아간 자리).
    if ((error as { code?: string }).code === "ENOENT") {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    throw error;
  }
}
```

- [ ] **Step 3: 프록시 본문 상한을 문서에 적는다**

`docs/deploy.md`에 한 절을 더한다. **이것 없이 배포하면 첫 업로드가 앱에 닿기도 전에 죽고 앱 로그에는 아무것도 안 남는다.**

```markdown
### 첨부 업로드와 프록시 본문 상한

커뮤니티 첨부는 파일당 5MB까지 받는다. 앞단 프록시의 본문 상한이 그보다 작으면
업로드가 앱에 닿기 전에 끊기고, **앱 로그에는 아무 흔적도 남지 않는다.**
nginx 기본값은 `client_max_body_size 1m`이다.

nginx:

    client_max_body_size 8m;   # 5MB + multipart 경계·헤더 여유

Caddy는 기본 상한이 없어 손댈 것이 없다. Cloudflare를 앞에 두면 요금제별
업로드 상한(무료 100MB)이 따로 걸린다 — 5MB는 그 안이다.
```

- [ ] **Step 4: 브라우저에서 라우트만 먼저 확인한다**

화면은 아직 없다. `curl`로 문 셋이 실제로 서 있는지 본다. 세션 쿠키는 브라우저 개발자 도구에서 복사한다.

```bash
# ① 로그인 안 함 → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/community/attachments

# ② 학생 쿠키로 쓸 수 없는 게시판(notice) → 403
curl -s -b "$COOKIE" -F slug=notice -F file=@/path/to/사진.png \
  -w "\n%{http_code}\n" http://localhost:3000/api/community/attachments

# ③ 쓸 수 있는 게시판 → 201 + {"id":…}
curl -s -b "$COOKIE" -F slug=free -F file=@/path/to/사진.png \
  -w "\n%{http_code}\n" http://localhost:3000/api/community/attachments

# ④ svg → 415
curl -s -b "$COOKIE" -F slug=free -F file=@/path/to/icon.svg \
  -w "\n%{http_code}\n" http://localhost:3000/api/community/attachments

# ⑤ 미결 상한(10). ③에서 이미 하나 올렸으므로 201이 아홉 번, 그 뒤 429다.
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " -b "$COOKIE" -F slug=free \
    -F file=@/path/to/사진.png http://localhost:3000/api/community/attachments
done; echo
# 기대: 201 201 201 201 201 201 201 201 201 429 429

# ⑥ ③이 준 id로 내려받기 → 200, 헤더 확인
curl -s -D - -o /dev/null -b "$COOKIE" \
  http://localhost:3000/api/community/attachments/<id>
```

⑥의 응답 헤더에 `X-Content-Type-Options: nosniff` · `Content-Security-Policy: default-src 'none'; sandbox` · `Cache-Control: private, no-store`가 모두 있어야 한다. 디스크에도 파일이 생겼는지 본다.

```bash
find .uploads -type f | head
```

파일 이름이 **랜덤 32자**여야 한다. `사진.png`가 보이면 storage가 원래 이름을 쓰고 있는 것이므로 Task 13으로 돌아간다.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/community docs/deploy.md
git commit -m "feat(community): 첨부 업로드·내려받기 라우트를 넣는다"
```

---

### Task 16: 화면에 첨부를 붙이고 볼륨을 만든다

**Files:**
- Create: `src/app/(app)/community/[slug]/attachment-picker.tsx` (클라이언트)
- Create: `src/app/(app)/community/[slug]/[postId]/attachment-list.tsx`
- Modify: `src/app/(app)/community/[slug]/post-form.tsx`
- Modify: `src/app/(app)/community/[slug]/[postId]/page.tsx`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 15의 라우트 둘
- Produces: 완성된 커뮤니티

- [ ] **Step 1: 첨부 고르개를 쓴다**

`attachment-picker.tsx` — `"use client"`. 폼 안에 놓이고, 고른 파일을 **즉시** 라우트로 올린 뒤 받은 id를 hidden으로 싣는다.

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";

type Attached = { id: string; filename: string; size: number };

/**
 * 파일을 고르면 곧바로 올리고 id만 폼에 싣는다. 서버 액션으로 파일을 보내지
 * 않는 이유는 `bodySizeLimit`이 액션 전체에 걸려서다 (설계 §첨부).
 */
export function AttachmentPicker({
  slug,
  initial = [],
  max,
}: {
  slug: string;
  initial?: Attached[];
  max: number;
}) {
  const [files, setFiles] = useState<Attached[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);

    // 한 번에 여럿 골라도 하나씩 보낸다 — 상한과 오류가 파일마다 다르다.
    for (const file of Array.from(list)) {
      if (files.length >= max) {
        setError(`첨부는 ${max}개까지 넣을 수 있습니다.`);
        break;
      }
      const body = new FormData();
      body.append("slug", slug);
      body.append("file", file);

      const res = await fetch("/api/community/attachments", { method: "POST", body });
      const json = (await res.json()) as Attached & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "올리지 못했습니다.");
        break;
      }
      setFiles((prev) => [...prev, { id: json.id, filename: json.filename, size: json.size }]);
    }

    setBusy(false);
    // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 change가 안 뜬다.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-3">
          {/* 폼이 서버 액션으로 보내는 것은 이 id뿐이다. */}
          <input type="hidden" name="attachmentIds" value={file.id} />
          <span className="min-w-0 truncate text-sm">{file.filename}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
          >
            빼기
          </Button>
        </div>
      ))}

      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={busy || files.length >= max}
        onChange={(event) => void pick(event.target.files)}
        className="text-sm"
      />

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
```

「빼기」는 목록에서만 뺀다 — 서버 행은 남고 1시간 뒤 고아 정리가 지운다. 수정 화면에서 뺀 기존 첨부는 저장할 때 `detachFromPost`가 디스크까지 지운다.

- [ ] **Step 2: 폼과 상세에 붙인다**

`post-form.tsx`에서 게시판이 `allowAttachments`면 `AttachmentPicker`를 놓는다. 수정 모드면 `initial`에 기존 첨부를 넘긴다.

`attachment-list.tsx`(서버 컴포넌트)는 글 상세의 본문 아래에 놓인다.

- 이미지(`mimeType`이 `image/`로 시작)는 `<img src={`/api/community/attachments/${id}`} className="max-w-full rounded-card" alt={filename} />`
- 나머지는 `<a href={…} className={buttonClass({ size: "sm", variant: "ghost" })}>` + 파일 이름 + 크기
- **`download` 속성을 붙이지 않는다** — 라우트가 `Content-Disposition`으로 이미 정한다

- [ ] **Step 3: Dockerfile에 업로드 폴더를 만든다**

`USER nextjs` **앞**에 넣는다. 안 하면 볼륨이 root 소유로 생겨 비루트로 도는 앱이 못 쓰고, 컨테이너가 `cap_drop: ALL`이라 나중에 고칠 방법도 없다.

```dockerfile
# 커뮤니티 첨부가 사는 곳. 볼륨이 이 경로에 마운트되면 도커가 여기의
# 소유권을 물려주므로, **USER를 바꾸기 전에** 만들어야 한다.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
```

- [ ] **Step 4: compose에 볼륨을 붙인다**

`app` 서비스에:

```yaml
    volumes:
      # 커뮤니티 첨부. DB 덤프에 안 들어가므로 **백업을 따로 떠야 한다.**
      - gbsw-uploads:/app/uploads
```

`environment`에:

```yaml
      UPLOAD_DIR: /app/uploads
```

파일 끝 `volumes:`에:

```yaml
  gbsw-uploads:
```

- [ ] **Step 5: `docs/deploy.md`에 백업 한 줄을 더한다**

```markdown
첨부 파일은 `gbsw-uploads` 볼륨에 있고 **DB 덤프에 들어가지 않는다.** 백업은 둘이다.

    docker run --rm -v gbsw-uploads:/data -v "$PWD:/out" alpine \
      tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

- [ ] **Step 6: `CLAUDE.md`를 고친다**

세 군데다.

1. 「현재 상태」 줄에 커뮤니티를 더한다.
2. 「아키텍처 규칙」의 **「권한 판정 경로는 `core/authz/can.ts` 하나뿐」 옆에** 경계를 적는다.

```markdown
- **커뮤니티의 읽기·쓰기만 이 규칙 밖이다.** 게시판마다 다르고 교사가 화면에서
  바꾸는 값이라 컴파일 시점 표에 담기지 않는다 — 판정은 `modules/community/
  community.access.ts`의 순수 함수 둘이 하고, 게시판을 다루는 권한
  (`community:manage`·`community:moderate`)만 `can()`에 있다. **다른 모듈이
  이것을 따라하면 안 된다**: 역할로 가를 수 있는 권한은 `can()`에 넣는다.
```

3. 「폴더 구조」의 `modules/` 아래에 커뮤니티 줄을 더한다.

```
    community/           게시판·글·댓글·첨부. merit과 같은 모양이되 순수 함수가
                          더 있다 — community.access.ts(역할 판정. DB를 모른다)·
                          community.view.ts(**익명을 가리는 유일한 자리**)·
                          community.storage.ts(디스크. DB를 모른다). 서비스는
                          board·post·comment·attachment 넷이다. **첨부 업로드는
                          서버 액션이 아니라 라우트 핸들러다** — bodySizeLimit이
                          액션 전체에 걸려서다.
```

4. 「주의점」에 두 줄을 더한다.

```markdown
- **익명 게시판은 화면까지만 익명이다.** 쓰기가 `recordAudit`을 남기므로, 교사가
  감사로그를 시각으로 대조하면 작성자를 알아낼 수 있다. 감수하고 택한 것이며
  (욕설·협박 글의 추적 수단이 그것뿐이다) 글쓰기 화면이 학생에게 그 사실을 알린다.
- **첨부는 `gbsw-uploads` 볼륨에 있고 DB 덤프에 안 들어간다.** 백업을 따로 뜬다
  (`docs/deploy.md`). 파일 이름은 랜덤 32자이고 올린 사람이 붙인 이름은 DB에만 있다.
```

- [ ] **Step 7: 브라우저에서 끝까지 확인한다**

| 확인 | 기대 |
|---|---|
| 학생이 글에 png를 붙여 쓴다 | 상세에서 이미지가 인라인으로 보인다 |
| pdf를 붙인다 | 링크로 나오고 누르면 내려받는다 |
| 6개째를 고른다 | 「첨부는 5개까지…」 |
| svg를 고른다 | 「올릴 수 없는 형식입니다.」 |
| 학부모가 그 글의 첨부 주소를 직접 연다 | 404 |
| 글을 수정하며 첨부 하나를 뺀다 | 상세에서 사라지고 디스크에서도 사라진다 |
| 글을 지운다 | 첨부가 안 열린다. **디스크 파일은 남아 있다** |
| 첨부를 올리고 글을 안 쓴 채 1시간 뒤 다시 올린다 | 앞의 고아가 DB·디스크에서 사라진다 |

마지막 줄은 기다리기 어려우면 DB에서 `createdAt`을 두 시간 앞으로 당겨 확인한다.

- [ ] **Step 8: 전체 검증**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 9: 도커로 한 번 띄워 본다**

볼륨 소유권은 컨테이너에서만 드러난다.

```bash
docker compose build app
docker compose up -d
docker compose exec app sh -c 'ls -ld /app/uploads && touch /app/uploads/.probe && rm /app/uploads/.probe && echo WRITABLE'
```

Expected: 소유자가 `nextjs`이고 `WRITABLE`이 찍힌다.

- [ ] **Step 10: 커밋**

```bash
git add src/app/\(app\)/community Dockerfile docker-compose.yml docs/deploy.md CLAUDE.md
git commit -m "feat(community): 글에 파일을 붙인다"
```

---

## 끝난 뒤

`npm run verify`가 통과하고 위 확인표가 전부 맞으면 배포한다. 절차는
`docs/deploy.md` — **rsync이고, 이미지는 하나씩 빌드한다**(동시에 하면 4GB
서버에서 buildkit이 죽고, compose가 컨테이너를 먼저 내리므로 사이트가 내려간
채 남는다). 이번에는 프록시의 `client_max_body_size`도 함께 올려야 한다.
