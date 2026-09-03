import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";

/**
 * 20260903104853_check_constraints의 CHECK 제약을 DB에 대고 확인한다 (DATA-DB-01).
 *
 * 확인하는 것은 둘이다.
 * 1. **NOT VALID여도 새 쓰기는 막힌다.** 제약은 전부 검증되지 않은 상태로 붙었고
 *    (pg_constraint.convalidated = false) 그럼에도 위반 쓰기는 거절된다. 이 마이그레이션의
 *    핵심 근거라 아래 첫 describe가 둘을 한자리에서 보인다.
 * 2. 정상 값은 그대로 들어간다.
 *
 * 위반은 **Prisma를 우회해 $executeRaw로** 넣는다. 애플리케이션 타입이 막지 못하는
 * 경로(운영 SQL·잘못된 마이그레이션)를 재현하는 것이 목적이므로, Prisma의 타입으로
 * 막히면 아무것도 증명하지 못한다.
 */

const YEAR = 8201;
const SUFFIX = randomUUID().slice(0, 8);

// 마이그레이션이 붙인 제약 전부. 이름이 바뀌거나 빠지면 여기서 먼저 깨진다.
const ALL_CONSTRAINTS = [
  "user_role_allowed",
  "user_status_allowed",
  "Invite_role_allowed",
  "Invite_status_allowed",
  "Enrollment_status_allowed",
  "VerificationCode_channel_allowed",
  "MeritRule_track_allowed",
  "MeritRule_kind_allowed",
  "MeritRule_points_positive",
  "MeritThreshold_track_allowed",
  "MeritThreshold_danger_over_warn",
  "MeritAward_track_allowed",
  "MeritAward_kind_allowed",
  "MeritAward_status_allowed",
  "MeritAward_points_positive",
  "MeritAward_cancelled_fields",
  "Pass_type_allowed",
  "Pass_status_allowed",
  "Pass_period_order",
  "Community_roles_allowed",
  "Community_write_subset_read",
] as const;

/**
 * 드라이버 어댑터가 감싼 Postgres 오류에서 SQLSTATE와 제약 이름을 읽는다.
 * 코드 매핑(P2010)에 기대지 않고 원본 오류 문자열을 그대로 본다 — 어댑터가 바뀌어도
 * "어느 제약이 막았는가"라는 사실 자체는 남는다.
 */
function describeDbError(error: unknown): string {
  const err = error as { message?: unknown; meta?: unknown };
  return `${String(err?.message ?? "")}\n${JSON.stringify(err?.meta ?? null)}`;
}

/** 위반 쓰기가 지정한 CHECK 제약에 막히는지 확인한다. */
async function expectCheckViolation(
  run: () => Promise<unknown>,
  constraint: string,
): Promise<void> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }

  expect(caught, `${constraint}: 위반 쓰기가 통과했다`).toBeDefined();

  const text = describeDbError(caught);
  // 23514 = check_violation. 유니크·NOT NULL 같은 다른 이유로 막힌 것을 통과시키지 않는다.
  expect(text, `${constraint}: SQLSTATE 23514가 아니다 — ${text}`).toContain("23514");
  expect(text, `${constraint}: 다른 제약이 막았다 — ${text}`).toContain(constraint);
}

/** 컬럼 하나를 Prisma 밖에서 덮어쓴다. 값은 바인딩해 넘긴다. */
function rawSetColumn(
  table: string,
  column: string,
  value: unknown,
  idColumn: string,
  idValue: unknown,
): Promise<number> {
  return prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "${column}" = $1 WHERE "${idColumn}" = $2`,
    value,
    idValue,
  );
}

const adminUserId = randomUUID();
const studentUserId = randomUUID();
let studentProfileId: string;
let enrollmentId: string;
let inviteId: string;
let verificationCodeId: string;
let meritRuleId: string;
let meritAwardId: string;
let passId: string;
let communityId: string;

const communitySlug = `check-constraints-${SUFFIX}`;
const verificationTarget = `check-constraints-${SUFFIX}@example.invalid`;
const thresholdTrack = "DORM";

beforeAll(async () => {
  await prisma.academicYear.create({ data: { year: YEAR } });

  await prisma.user.create({
    data: {
      id: adminUserId,
      name: "제약 테스트 교사",
      email: `itest-check-admin-${SUFFIX}@example.invalid`,
      phone: "010-0000-8201",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: studentUserId,
      name: "제약 테스트 학생",
      email: `itest-check-student-${SUFFIX}@example.invalid`,
      phone: "010-0000-8202",
      role: "STUDENT",
      status: "ACTIVE",
    },
  });

  const profile = await prisma.studentProfile.create({
    data: {
      userId: studentUserId,
      studentCode: `ITCK${SUFFIX.slice(0, 4).toUpperCase()}`,
      birthDate: new Date("2010-03-01T00:00:00+09:00"),
    },
  });
  studentProfileId = profile.id;

  const rule = await prisma.meritRule.create({
    data: { track: "SCHOOL", kind: "MERIT", label: "제약 테스트 규정", points: 3 },
  });
  meritRuleId = rule.id;
});

afterAll(async () => {
  await prisma.communityAttachment.deleteMany({ where: { uploaderUserId: adminUserId } });
  await prisma.community.deleteMany({ where: { slug: communitySlug } });
  await prisma.pass.deleteMany({ where: { studentProfileId } });
  await prisma.meritAward.deleteMany({ where: { studentProfileId } });
  await prisma.meritRule.deleteMany({ where: { id: meritRuleId } });
  await prisma.meritThreshold.deleteMany({ where: { track: thresholdTrack } });
  await prisma.verificationCode.deleteMany({ where: { target: verificationTarget } });
  await prisma.invite.deleteMany({ where: { createdById: adminUserId } });
  await prisma.enrollment.deleteMany({ where: { year: YEAR } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, studentUserId] } } });
  await prisma.academicYear.deleteMany({ where: { year: YEAR } });
});

// 정상 값으로 만드는 행들. 각 테스트가 이 행을 Prisma 밖에서 덮어쓴다.
beforeEach(async () => {
  await prisma.enrollment.deleteMany({ where: { studentProfileId } });
  await prisma.invite.deleteMany({ where: { createdById: adminUserId } });
  await prisma.verificationCode.deleteMany({ where: { target: verificationTarget } });
  await prisma.meritThreshold.deleteMany({ where: { track: thresholdTrack } });
  await prisma.meritAward.deleteMany({ where: { studentProfileId } });
  await prisma.pass.deleteMany({ where: { studentProfileId } });
  await prisma.community.deleteMany({ where: { slug: communitySlug } });

  await prisma.user.update({
    where: { id: studentUserId },
    data: { role: "STUDENT", status: "ACTIVE" },
  });

  enrollmentId = (
    await prisma.enrollment.create({
      data: { studentProfileId, year: YEAR, grade: 1, classNo: 1, number: 1 },
    })
  ).id;

  inviteId = (
    await prisma.invite.create({
      data: {
        code: `ITCK${randomUUID().slice(0, 8).toUpperCase()}`,
        role: "STUDENT",
        createdById: adminUserId,
        createdByName: "제약 테스트 교사",
      },
    })
  ).id;

  verificationCodeId = (
    await prisma.verificationCode.create({
      data: {
        challengeId: `chal-${Math.random().toString(36).slice(2)}`,
        channel: "EMAIL",
        target: verificationTarget,
        codeHash: `hash-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    })
  ).id;

  meritAwardId = (
    await prisma.meritAward.create({
      data: {
        studentProfileId,
        year: YEAR,
        ruleId: meritRuleId,
        track: "SCHOOL",
        kind: "MERIT",
        label: "제약 테스트 규정",
        points: 3,
        occurredOn: new Date("2026-03-02T00:00:00+09:00"),
        awardedByUserId: adminUserId,
        awardedByName: "제약 테스트 교사",
      },
    })
  ).id;

  passId = (
    await prisma.pass.create({
      data: {
        studentProfileId,
        type: "OUTING",
        status: "REQUESTED",
        startAt: new Date("2026-03-02T09:00:00+09:00"),
        endAt: new Date("2026-03-02T17:00:00+09:00"),
        destination: "치과",
        reason: "진료",
        requestedByUserId: studentUserId,
        requestedByName: "제약 테스트 학생",
      },
    })
  ).id;

  communityId = (
    await prisma.community.create({
      data: {
        slug: communitySlug,
        name: "제약 테스트 게시판",
        readRoles: ["STUDENT", "PARENT"],
        writeRoles: ["STUDENT"],
      },
    })
  ).id;
});

describe("CHECK 제약은 NOT VALID로 붙었지만 새 쓰기를 막는다", () => {
  it("마이그레이션이 붙인 제약이 전부 있고, 전부 검증되지 않은 상태다", async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
      SELECT "conname", "convalidated"
      FROM pg_constraint
      WHERE "contype" = 'c' AND "conname" = ANY(${[...ALL_CONSTRAINTS]}::text[])
    `;

    expect(rows.map((r) => r.conname).sort()).toEqual([...ALL_CONSTRAINTS].sort());
    // 하나라도 true면 배포에서 기존 행을 검사했다는 뜻이다 — 그 순간 배포가 막힐 수 있다.
    expect(rows.filter((r) => r.convalidated).map((r) => r.conname)).toEqual([]);
  });

  it("검증되지 않았어도 새 INSERT를 거절한다 — Prisma를 우회해 넣어도 막힌다", async () => {
    const id = randomUUID();
    await expectCheckViolation(
      () =>
        prisma.$executeRaw`
          INSERT INTO "user"
            ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "phone", "role", "status")
          VALUES
            (${id}, '몰래 넣은 교사', ${`itest-check-raw-${SUFFIX}@example.invalid`},
             false, now(), now(), '010-0000-8203', 'TEACHER', 'ACTIVE')
        `,
      "user_role_allowed",
    );

    // 거절된 행은 남지 않는다.
    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
  });
});

describe("허용 값 집합", () => {
  const cases: Array<{
    constraint: string;
    table: string;
    column: string;
    bad: unknown;
    good: unknown;
    idColumn: string;
    id: () => unknown;
  }> = [
    {
      constraint: "user_role_allowed",
      table: "user",
      column: "role",
      bad: "TEACHER",
      good: "PARENT",
      idColumn: "id",
      id: () => studentUserId,
    },
    {
      constraint: "user_status_allowed",
      table: "user",
      column: "status",
      bad: "DISABLED",
      good: "INACTIVE",
      idColumn: "id",
      id: () => studentUserId,
    },
    {
      constraint: "Invite_role_allowed",
      table: "Invite",
      column: "role",
      bad: "TEACHER",
      good: "PARENT",
      idColumn: "id",
      id: () => inviteId,
    },
    {
      constraint: "Invite_status_allowed",
      table: "Invite",
      column: "status",
      bad: "EXPIRED",
      good: "REVOKED",
      idColumn: "id",
      id: () => inviteId,
    },
    {
      constraint: "Enrollment_status_allowed",
      table: "Enrollment",
      column: "status",
      bad: "LEAVE",
      good: "GRADUATED",
      idColumn: "id",
      id: () => enrollmentId,
    },
    {
      constraint: "VerificationCode_channel_allowed",
      table: "VerificationCode",
      column: "channel",
      bad: "SMS",
      good: "PHONE",
      idColumn: "id",
      id: () => verificationCodeId,
    },
    {
      constraint: "MeritRule_track_allowed",
      table: "MeritRule",
      column: "track",
      bad: "CLUB",
      good: "DORM",
      idColumn: "id",
      id: () => meritRuleId,
    },
    {
      constraint: "MeritRule_kind_allowed",
      table: "MeritRule",
      column: "kind",
      bad: "PENALTY",
      good: "DEMERIT",
      idColumn: "id",
      id: () => meritRuleId,
    },
    {
      constraint: "MeritAward_track_allowed",
      table: "MeritAward",
      column: "track",
      bad: "CLUB",
      good: "DORM",
      idColumn: "id",
      id: () => meritAwardId,
    },
    {
      constraint: "MeritAward_kind_allowed",
      table: "MeritAward",
      column: "kind",
      bad: "PENALTY",
      good: "OFFSET",
      idColumn: "id",
      id: () => meritAwardId,
    },
    {
      constraint: "Pass_type_allowed",
      table: "Pass",
      column: "type",
      bad: "FIELDTRIP",
      good: "OVERNIGHT",
      idColumn: "id",
      id: () => passId,
    },
    {
      constraint: "Pass_status_allowed",
      table: "Pass",
      column: "status",
      bad: "EXPIRED",
      good: "CONSENTED",
      idColumn: "id",
      id: () => passId,
    },
  ];

  for (const c of cases) {
    it(`${c.constraint}: '${String(c.bad)}'는 거절하고 '${String(c.good)}'는 받는다`, async () => {
      await expectCheckViolation(
        () => rawSetColumn(c.table, c.column, c.bad, c.idColumn, c.id()),
        c.constraint,
      );

      await expect(
        rawSetColumn(c.table, c.column, c.good, c.idColumn, c.id()),
      ).resolves.toBe(1);
    });
  }

  it("MeritAward_status_allowed: 모르는 상태는 거절한다", async () => {
    // cancelledAt은 null로 둔다. 함께 채우면 MeritAward_cancelled_fields도 깨져
    // 어느 제약이 막았는지 흐려진다 — 여기서는 상태 집합만 시험한다.
    await expectCheckViolation(
      () => rawSetColumn("MeritAward", "status", "VOIDED", "id", meritAwardId),
      "MeritAward_status_allowed",
    );

    await expect(
      prisma.$executeRaw`
        UPDATE "MeritAward" SET "status" = 'CANCELLED', "cancelledAt" = now()
        WHERE "id" = ${meritAwardId}
      `,
    ).resolves.toBe(1);
  });

  it("MeritThreshold_track_allowed: 모르는 트랙은 거절한다", async () => {
    await expectCheckViolation(
      () => prisma.$executeRaw`
        INSERT INTO "MeritThreshold" ("track", "warn", "danger", "updatedAt", "updatedByName")
        VALUES ('CLUB', 10, 20, now(), '제약 테스트 교사')
      `,
      "MeritThreshold_track_allowed",
    );

    await expect(
      prisma.meritThreshold.create({
        data: {
          track: thresholdTrack,
          warn: 10,
          danger: 20,
          updatedByName: "제약 테스트 교사",
        },
      }),
    ).resolves.toMatchObject({ track: thresholdTrack });
  });

  it("Community_roles_allowed: 역할 아닌 문자열이 배열에 있으면 거절한다", async () => {
    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "Community" SET "readRoles" = ARRAY['STUDENT', 'TEACHER']::text[]
        WHERE "id" = ${communityId}
      `,
      "Community_roles_allowed",
    );

    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "Community"
        SET "readRoles" = ARRAY['STUDENT', 'GUEST']::text[],
            "writeRoles" = ARRAY['STUDENT', 'GUEST']::text[]
        WHERE "id" = ${communityId}
      `,
      "Community_roles_allowed",
    );

    // ADMIN은 판정에서 어차피 통과하는 값이라 배열에 있어도 막지 않는다.
    await expect(
      prisma.$executeRaw`
        UPDATE "Community"
        SET "readRoles" = ARRAY['ADMIN', 'STUDENT', 'PARENT']::text[],
            "writeRoles" = ARRAY['ADMIN', 'STUDENT']::text[]
        WHERE "id" = ${communityId}
      `,
    ).resolves.toBe(1);
  });
});

describe("상태별 필드 조합", () => {
  it("MeritAward_cancelled_fields: 취소인데 취소 시각이 없으면 거절한다", async () => {
    await expectCheckViolation(
      () => rawSetColumn("MeritAward", "status", "CANCELLED", "id", meritAwardId),
      "MeritAward_cancelled_fields",
    );
  });

  it("MeritAward_cancelled_fields: 반영 중인데 취소 시각이 있으면 거절한다", async () => {
    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "MeritAward" SET "cancelledAt" = now() WHERE "id" = ${meritAwardId}
      `,
      "MeritAward_cancelled_fields",
    );
  });

  it("MeritAward_cancelled_fields: 상태와 시각을 함께 쓰면 받는다", async () => {
    await expect(
      prisma.meritAward.update({
        where: { id: meritAwardId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByUserId: adminUserId,
          cancelledByName: "제약 테스트 교사",
          cancelReason: "오기입",
        },
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("MeritRule_points_positive / MeritAward_points_positive: 0점·음수를 거절한다", async () => {
    await expectCheckViolation(
      () => rawSetColumn("MeritRule", "points", 0, "id", meritRuleId),
      "MeritRule_points_positive",
    );
    await expectCheckViolation(
      () => rawSetColumn("MeritAward", "points", -3, "id", meritAwardId),
      "MeritAward_points_positive",
    );

    await expect(rawSetColumn("MeritRule", "points", 1, "id", meritRuleId)).resolves.toBe(1);
  });

  it("MeritThreshold_danger_over_warn: 위험이 경고 이하면 거절한다", async () => {
    await prisma.meritThreshold.create({
      data: { track: thresholdTrack, warn: 10, danger: 20, updatedByName: "제약 테스트 교사" },
    });

    await expectCheckViolation(
      () => rawSetColumn("MeritThreshold", "danger", 10, "track", thresholdTrack),
      "MeritThreshold_danger_over_warn",
    );

    await expect(
      rawSetColumn("MeritThreshold", "danger", 11, "track", thresholdTrack),
    ).resolves.toBe(1);
  });

  it("Pass_period_order: 끝이 시작보다 앞서거나 같으면 거절한다", async () => {
    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "Pass" SET "endAt" = "startAt" WHERE "id" = ${passId}
      `,
      "Pass_period_order",
    );

    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "Pass" SET "endAt" = "startAt" - interval '1 hour' WHERE "id" = ${passId}
      `,
      "Pass_period_order",
    );
  });

  // Pass의 status와 decidedAt·cancelledAt 조합은 이 마이그레이션에 넣지 않았다.
  // 근거는 migration.sql의 「넣지 않은 것」에 적었다 — 결합이 서비스에만 있고
  // pass.repo.transition의 계약에는 없어서다. 그 조합을 지키는 것은 아래처럼
  // 서비스를 거친 쓰기이며, 지금은 DB가 아니라 서비스가 지킨다.
  it("Pass: 승인 뒤 취소해도 결재 시각은 남는다 — DB는 이 조합을 판단하지 않는다", async () => {
    await prisma.pass.update({
      where: { id: passId },
      data: { status: "APPROVED", decidedAt: new Date(), decidedByName: "제약 테스트 교사" },
    });

    await expect(
      prisma.pass.update({
        where: { id: passId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByName: "제약 테스트 교사",
          cancelReason: "일정 변경",
        },
      }),
    ).resolves.toMatchObject({ status: "CANCELLED", decidedAt: expect.any(Date) });
  });

  it("Community_write_subset_read: 읽을 수 없는 역할에 글쓰기를 줄 수 없다", async () => {
    // 학부모가 읽지 못하는 게시판에 학부모 글쓰기를 준다.
    await expectCheckViolation(
      () => prisma.$executeRaw`
        UPDATE "Community"
        SET "readRoles" = ARRAY['STUDENT']::text[],
            "writeRoles" = ARRAY['STUDENT', 'PARENT']::text[]
        WHERE "id" = ${communityId}
      `,
      "Community_write_subset_read",
    );

    await expect(
      prisma.community.update({
        where: { id: communityId },
        data: { readRoles: ["STUDENT", "PARENT"], writeRoles: ["STUDENT", "PARENT"] },
      }),
    ).resolves.toMatchObject({ writeRoles: ["STUDENT", "PARENT"] });
  });
});
