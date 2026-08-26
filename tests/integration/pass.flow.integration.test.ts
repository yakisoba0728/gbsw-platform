import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import * as repo from "@/modules/pass/pass.repo";

/**
 * 단위 테스트가 목으로 덮는 두 가지를 실제 DB에서 확인한다.
 *
 * 1. 조건부 갱신(transition)이 정말로 동시 결재를 하나로 만드는가
 * 2. 겹침 질의(findOverlapping)의 경계가 맞는가 — 맞닿은 구간은 겹치지 않는다
 *
 * 자기가 만든 행만 지운다. 다른 테스트의 시드를 건드리지 않는다.
 */

const SUFFIX = "pass-flow-integration";
const ids = { user: `u-${SUFFIX}`, profile: "" };

beforeAll(async () => {
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
});

afterAll(async () => {
  // Pass는 StudentProfile에 Cascade, StudentProfile은 User에 Cascade다.
  await prisma.user.deleteMany({ where: { id: ids.user } });
});

describe("transition — 조건부 갱신 (동시 결재)", () => {
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
