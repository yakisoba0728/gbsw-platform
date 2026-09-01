import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import type { SessionUser } from "@/core/auth/session";
import { formatDateInput, parseDateTimeInputKst } from "@/lib/datetime";
import { approvePass, issuePass } from "@/modules/pass/decision.service";
import { PassError } from "@/modules/pass/pass.error";
import * as repo from "@/modules/pass/pass.repo";
import {
  consentPass,
  getPassDetail,
  requestPass,
} from "@/modules/pass/request.service";

vi.mock("server-only", () => ({}));

/**
 * 단위 테스트가 목으로 덮는 경합 규칙을 실제 DB에서 확인한다.
 *
 * 1. 조건부 갱신(transition)이 정말로 동시 결재를 하나로 만드는가
 * 2. 겹침 질의(findOverlapping)의 경계가 맞는가 — 맞닿은 구간은 겹치지 않는다
 * 3. 학생 신청과 교사 직접 부여가 각각 학생 행 잠금 안에서 겹침을 재검사하는가
 * 4. 외박의 신청→보호자 확인→교사 승인이 상태와 메모를 실제 DB에 남기는가
 *
 * 자기가 만든 행만 지운다. 다른 테스트의 시드를 건드리지 않는다.
 */

const SUFFIX = "pass-flow-integration";
const ids = {
  user: `u-${SUFFIX}`,
  admin: `a-${SUFFIX}`,
  parent: `p-${SUFFIX}`,
  profile: "",
  schoolClass: "",
};

function studentActor(): SessionUser {
  return {
    id: ids.user,
    name: "통합 테스트 학생",
    email: `${SUFFIX}@example.invalid`,
    role: "STUDENT",
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

function adminActor(): SessionUser {
  return {
    id: ids.admin,
    name: "통합 테스트 교사",
    email: `admin-${SUFFIX}@example.invalid`,
    role: "ADMIN",
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

function parentActor(): SessionUser {
  return {
    id: ids.parent,
    name: "통합 테스트 보호자",
    email: `parent-${SUFFIX}@example.invalid`,
    role: "PARENT",
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      id: ids.admin,
      name: "통합 테스트 교사",
      email: `admin-${SUFFIX}@example.invalid`,
      phone: "01000000001",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: ids.parent,
      name: "통합 테스트 보호자",
      email: `parent-${SUFFIX}@example.invalid`,
      phone: "01000000002",
      role: "PARENT",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: ids.user,
      name: "통합 테스트 학생",
      email: `${SUFFIX}@example.invalid`,
      phone: "01000000000",
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: {
        create: {
          studentCode: `SC-${SUFFIX}`.slice(0, 20),
          birthDate: new Date("2010-03-01T00:00:00+09:00"),
        },
      },
    },
  });

  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { userId: ids.user },
    select: { id: true },
  });
  ids.profile = profile.id;

  await prisma.parentStudent.create({
    data: { parentUserId: ids.parent, studentId: ids.profile },
  });

  const current = await prisma.academicYear.findFirstOrThrow({
    where: { isCurrent: true },
    select: { year: true },
  });
  const schoolClass = await prisma.schoolClass.upsert({
    where: { year_grade_classNo: { year: current.year, grade: 9, classNo: 99 } },
    create: { year: current.year, grade: 9, classNo: 99 },
    update: {},
  });
  ids.schoolClass = schoolClass.id;
  await prisma.enrollment.create({
    data: {
      studentProfileId: ids.profile,
      year: current.year,
      classId: schoolClass.id,
      number: 9999,
      status: "ENROLLED",
    },
  });
});

afterAll(async () => {
  // 한 DELETE에서 학생(출입증 Cascade)과 교사(결재자 SetNull)를 함께 지우면
  // PostgreSQL의 참조 동작 순서가 충돌할 수 있어 테스트 행을 먼저 명시적으로 걷는다.
  await prisma.auditLog.deleteMany({
    where: { actorUserId: { in: [ids.user, ids.admin, ids.parent] } },
  });
  if (ids.profile) {
    await prisma.pass.deleteMany({ where: { studentProfileId: ids.profile } });
  }
  await prisma.user.deleteMany({
    where: { id: { in: [ids.user, ids.admin, ids.parent] } },
  });
  if (ids.schoolClass) {
    await prisma.schoolClass.deleteMany({ where: { id: ids.schoolClass } });
  }
});

describe("외박 신청 → 보호자 확인 → 교사 승인", () => {
  it("각 단계의 상태와 보호자·교사 메모를 실제 DB에 보존한다", async () => {
    const requestedAt = new Date("2036-01-10T00:00:00.000Z");
    const consentedAt = new Date("2036-01-10T00:05:00.000Z");
    const approvedAt = new Date("2036-01-10T00:10:00.000Z");

    const created = await requestPass(
      studentActor(),
      {
        type: "OVERNIGHT",
        startDate: "2036-01-10",
        startTime: "18:00",
        endDate: "2036-01-11",
        endTime: "09:00",
        destination: "본가",
        reason: "가족 행사",
      },
      requestedAt,
    );

    await expect(getPassDetail(adminActor(), created.id)).resolves.toMatchObject({
      type: "OVERNIGHT",
      status: "REQUESTED",
      consentedAt: null,
      decidedAt: null,
    });

    await consentPass(
      parentActor(),
      { passId: created.id, consentNote: "어머니가 앱에서 확인" },
      consentedAt,
    );

    await expect(getPassDetail(adminActor(), created.id)).resolves.toMatchObject({
      status: "CONSENTED",
      consentedByUserId: ids.parent,
      consentedByName: "통합 테스트 보호자",
      consentedAt,
      consentByProxy: false,
      consentNote: "어머니가 앱에서 확인",
      decidedAt: null,
    });

    await approvePass(
      adminActor(),
      {
        passId: created.id,
        decisionNote: "기숙사 일정 확인",
        consentNote: null,
      },
      approvedAt,
    );

    await expect(getPassDetail(adminActor(), created.id)).resolves.toMatchObject({
      status: "APPROVED",
      consentedByUserId: ids.parent,
      consentedByName: "통합 테스트 보호자",
      consentedAt,
      consentByProxy: false,
      consentNote: "어머니가 앱에서 확인",
      decidedByUserId: ids.admin,
      decidedByName: "통합 테스트 교사",
      decidedAt: approvedAt,
      decisionNote: "기숙사 일정 확인",
    });
  });
});

describe("transition — 조건부 갱신 (동시 결재)", () => {
  it("일반 승인 메모는 보호자 확인 메모와 섞이지 않고 DB에 보존된다", async () => {
    const created = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "REQUESTED",
      startAt: new Date("2035-01-01T05:00:00.000Z"),
      endAt: new Date("2035-01-01T09:00:00.000Z"),
      destination: "치과",
      reason: "검진",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });

    await approvePass(
      adminActor(),
      {
        passId: created.id,
        decisionNote: "병원 예약 확인",
        consentNote: null,
      },
      new Date("2035-01-01T00:00:00.000Z"),
    );

    const approved = await prisma.pass.findUniqueOrThrow({
      where: { id: created.id },
      select: { status: true, decisionNote: true, consentNote: true },
    });
    expect(approved).toEqual({
      status: "APPROVED",
      decisionNote: "병원 예약 확인",
      consentNote: null,
    });
  });

  it("두 번 불러도 한 번만 바뀐다", async () => {
    const created = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "REQUESTED",
      startAt: new Date("2030-01-01T05:00:00.000Z"),
      endAt: new Date("2030-01-01T09:00:00.000Z"),
      destination: "치과",
      reason: "검진",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });

    const first = await repo.transition(created.id, ["REQUESTED", "CONSENTED"], {
      status: "APPROVED",
      decidedByName: "교사 A",
      decidedAt: new Date(),
    });
    const second = await repo.transition(created.id, ["REQUESTED", "CONSENTED"], {
      status: "APPROVED",
      decidedByName: "교사 B",
      decidedAt: new Date(),
    });

    expect(first).toBe(1);
    // 0이어야 서비스가 ALREADY_DECIDED로 떨어져 감사로그가 두 줄 안 남는다.
    expect(second).toBe(0);

    const after = await prisma.pass.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.decidedByName).toBe("교사 A");
  });

  it("동시에 부른 둘 중 하나만 성공한다", async () => {
    const created = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "REQUESTED",
      startAt: new Date("2030-02-01T05:00:00.000Z"),
      endAt: new Date("2030-02-01T09:00:00.000Z"),
      destination: "치과",
      reason: "검진",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });

    const results = await Promise.all([
      repo.transition(created.id, ["REQUESTED"], { status: "APPROVED" }),
      repo.transition(created.id, ["REQUESTED"], { status: "REJECTED" }),
    ]);

    expect(results.filter((count) => count === 1)).toHaveLength(1);
  });

  it("DB 시계에서 이미 만료됐으면 전이하지 않는다", async () => {
    const created = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "REQUESTED",
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() - 1_000),
      destination: "이미 끝난 외출",
      reason: "만료 경합 테스트",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });

    const changed = await repo.transitionUnexpired(
      created.id,
      ["REQUESTED"],
      { status: "APPROVED" },
    );

    expect(changed).toBe("EXPIRED");
  });

  it("행 잠금을 기다리는 동안 만료되면 잠금을 얻은 뒤 다시 DB 시각으로 막는다", async () => {
    const created = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "REQUESTED",
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 300),
      destination: "곧 끝나는 외출",
      reason: "잠금 대기 만료 테스트",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });

    let releaseLock!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });

    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Pass" WHERE "id" = ${created.id} FOR UPDATE
      `;
      markLocked();
      await release;
    });
    await locked;

    const transition = repo.transitionUnexpired(
      created.id,
      ["REQUESTED"],
      { status: "APPROVED" },
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    releaseLock();

    const [changed] = await Promise.all([transition, blocker.then(() => -1)]);
    expect(changed).toBe("EXPIRED");
  });
});

describe("findOverlapping — 경계", () => {
  const BASE_START = new Date("2030-03-01T05:00:00.000Z");
  const BASE_END = new Date("2030-03-01T09:00:00.000Z");

  beforeAll(async () => {
    await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "APPROVED",
      startAt: BASE_START,
      endAt: BASE_END,
      destination: "치과",
      reason: "검진",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });
  });

  it("한가운데는 겹친다", async () => {
    const found = await repo.findOverlapping(
      ids.profile,
      new Date("2030-03-01T06:00:00.000Z"),
      new Date("2030-03-01T07:00:00.000Z"),
    );
    expect(found).not.toBeNull();
  });

  it("끝에 맞닿은 구간은 겹치지 않는다 — 18시에 들어와 18시에 다시 나갈 수 있다", async () => {
    const found = await repo.findOverlapping(
      ids.profile,
      BASE_END,
      new Date("2030-03-01T11:00:00.000Z"),
    );
    expect(found).toBeNull();
  });

  it("시작 앞에 맞닿은 구간도 겹치지 않는다", async () => {
    const found = await repo.findOverlapping(
      ids.profile,
      new Date("2030-03-01T03:00:00.000Z"),
      BASE_START,
    );
    expect(found).toBeNull();
  });

  it("취소된 것은 겹침에 안 걸린다", async () => {
    const cancelled = await repo.createPass({
      studentProfileId: ids.profile,
      type: "OUTING",
      status: "CANCELLED",
      startAt: new Date("2030-04-01T05:00:00.000Z"),
      endAt: new Date("2030-04-01T09:00:00.000Z"),
      destination: "치과",
      reason: "검진",
      requestedByUserId: ids.user,
      requestedByName: "통합 테스트 학생",
    });
    expect(cancelled.id).toBeTruthy();

    const found = await repo.findOverlapping(
      ids.profile,
      new Date("2030-04-01T06:00:00.000Z"),
      new Date("2030-04-01T07:00:00.000Z"),
    );
    expect(found).toBeNull();
  });
});

describe("requestPass — 겹침 생성 경합", () => {
  it("동일 학생의 겹치는 병렬 신청 중 하나만 생성된다", async () => {
    const input = {
      type: "OUTING" as const,
      date: "2031-05-01",
      startTime: "14:00",
      endTime: "18:00",
      destination: "치과",
      reason: "정기 검진",
    };
    const now = new Date("2031-05-01T00:00:00.000Z");

    const results = await Promise.allSettled([
      requestPass(studentActor(), input, now),
      requestPass(studentActor(), input, now),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toEqual(
      expect.objectContaining({ reason: new PassError("OVERLAPPING_PASS") }),
    );
  });
});

describe("issuePass — 겹침 생성 경합", () => {
  // 앞선 신청 경합들이 같은 학생의 먼 미래 Pass를 남긴다. 직접 부여는 잠금 뒤
  // 실제 DB 시각부터 시작하므로 그 기록과도 겹칠 수 있어, 각 사례를 독립시킨다.
  beforeEach(async () => {
    await prisma.pass.deleteMany({ where: { studentProfileId: ids.profile } });
  });

  it("호출자 시각이 낡았어도 DB 시각에 끝난 승인 출입증은 만들지 않는다", async () => {
    const dbNow = await repo.currentDatabaseTime(prisma);
    const previousDate = formatDateInput(new Date(dbNow.getTime() - 24 * 60 * 60 * 1000));
    const staleNow = parseDateTimeInputKst(previousDate, "23:58");

    await expect(
      issuePass(
        adminActor(),
        {
          type: "OUTING",
          studentId: ids.profile,
          endTime: "23:59",
          destination: "교문",
          reason: "낡은 호출자 시각",
        },
        staleNow,
      ),
    ).rejects.toThrow(new PassError("PASS_EXPIRED"));

    await expect(
      prisma.pass.count({ where: { reason: "낡은 호출자 시각" } }),
    ).resolves.toBe(0);
  });

  it("동일 학생의 겹치는 병렬 직접 부여 중 하나만 생성된다", async () => {
    const input = {
      type: "OUTING" as const,
      studentId: ids.profile,
      endTime: "18:00",
      destination: "치과",
      reason: "정기 검진",
    };
    const now = new Date("2031-06-01T00:00:00.000Z");

    const results = await Promise.allSettled([
      issuePass(adminActor(), input, now),
      issuePass(adminActor(), input, now),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toEqual(
      expect.objectContaining({ reason: new PassError("OVERLAPPING_PASS") }),
    );
  });

  it("학생 신청과 교사 직접 부여가 동시에 겹쳐도 하나만 생성된다", async () => {
    const now = new Date("2031-07-01T05:00:00.000Z");
    const results = await Promise.allSettled([
      requestPass(
        studentActor(),
        {
          type: "OUTING",
          date: "2031-07-01",
          startTime: "14:00",
          endTime: "18:00",
          destination: "치과",
          reason: "혼합 경합",
        },
        now,
      ),
      issuePass(
        adminActor(),
        {
          type: "OUTING",
          studentId: ids.profile,
          endTime: "18:00",
          destination: "치과",
          reason: "혼합 경합",
        },
        now,
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toEqual(
      expect.objectContaining({ reason: new PassError("OVERLAPPING_PASS") }),
    );
  });

  it("비활성·비재학·학생 역할이 아닌 대상은 실제 DB에서도 직접 부여하지 않는다", async () => {
    const attempt = (suffix: string) =>
      issuePass(
        adminActor(),
        {
          type: "OUTING",
          studentId: ids.profile,
          endTime: "18:00",
          destination: "교문",
          reason: `대상 검증 ${suffix}`,
        },
        new Date(`2032-0${suffix}-01T05:00:00.000Z`),
      );

    await prisma.user.update({ where: { id: ids.user }, data: { status: "INACTIVE" } });
    await expect(attempt("1")).rejects.toThrow(new PassError("STUDENT_NOT_ELIGIBLE"));
    await prisma.user.update({ where: { id: ids.user }, data: { status: "ACTIVE" } });

    await prisma.enrollment.updateMany({
      where: { studentProfileId: ids.profile },
      data: { status: "WITHDRAWN" },
    });
    await expect(attempt("2")).rejects.toThrow(new PassError("STUDENT_NOT_ELIGIBLE"));
    await prisma.enrollment.updateMany({
      where: { studentProfileId: ids.profile },
      data: { status: "ENROLLED" },
    });

    await prisma.user.update({ where: { id: ids.user }, data: { role: "ADMIN" } });
    await expect(attempt("3")).rejects.toThrow(new PassError("STUDENT_NOT_ELIGIBLE"));
    await prisma.user.update({ where: { id: ids.user }, data: { role: "STUDENT" } });
  });
});
