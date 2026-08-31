import { randomUUID } from "node:crypto";
import { renderToReadableStream } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { prisma } from "@/core/db/client";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("server-only", () => ({}));

const { default: DashboardPage } = await import("@/app/(app)/page");

const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const ids = {
  parent: `dashboard-parent-${suffix}`,
  firstUser: `dashboard-child-a-${suffix}`,
  secondUser: `dashboard-child-b-${suffix}`,
  firstProfile: "",
  secondProfile: "",
};
let createdAcademicYear: number | null = null;

const parent: SessionUser = {
  id: ids.parent,
  name: "다자녀 학부모",
  email: `dashboard-parent-${suffix}@example.invalid`,
  role: "PARENT",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

describe("학부모 대시보드 다자녀 범위", () => {
  beforeAll(async () => {
    const current = await prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { year: true },
    });
    if (!current) {
      createdAcademicYear = 2199;
      await prisma.academicYear.create({
        data: { year: createdAcademicYear, isCurrent: true },
      });
    }

    await prisma.user.create({
      data: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        phone: `017-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "PARENT",
        status: "ACTIVE",
      },
    });

    const [second, first] = await Promise.all([
      prisma.user.create({
        data: {
          id: ids.secondUser,
          name: "B 자녀",
          email: `dashboard-child-b-${suffix}@example.invalid`,
          phone: `018-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
          role: "STUDENT",
          status: "ACTIVE",
          studentProfile: {
            create: {
              studentCode: `DB${suffix}`,
              birthDate: new Date("2010-02-01T00:00:00+09:00"),
              parents: { create: { parentUserId: parent.id } },
            },
          },
        },
        select: { studentProfile: { select: { id: true } } },
      }),
      prisma.user.create({
        data: {
          id: ids.firstUser,
          name: "A 자녀",
          email: `dashboard-child-a-${suffix}@example.invalid`,
          phone: `019-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
          role: "STUDENT",
          status: "ACTIVE",
          studentProfile: {
            create: {
              studentCode: `DA${suffix}`,
              birthDate: new Date("2010-01-01T00:00:00+09:00"),
              parents: { create: { parentUserId: parent.id } },
            },
          },
        },
        select: { studentProfile: { select: { id: true } } },
      }),
    ]);
    ids.firstProfile = first.studentProfile!.id;
    ids.secondProfile = second.studentProfile!.id;

    await prisma.pass.createMany({
      data: [
        {
          studentProfileId: ids.firstProfile,
          type: "OVERNIGHT",
          status: "REQUESTED",
          startAt: new Date("2099-01-02T09:00:00.000Z"),
          endAt: new Date("2099-01-03T09:00:00.000Z"),
          destination: "A 자녀 본가",
          reason: "다자녀 범위 테스트",
          requestedByUserId: ids.firstUser,
          requestedByName: "A 자녀",
        },
        {
          studentProfileId: ids.secondProfile,
          type: "OVERNIGHT",
          status: "REQUESTED",
          startAt: new Date("2099-01-04T09:00:00.000Z"),
          endAt: new Date("2099-01-05T09:00:00.000Z"),
          destination: "B 자녀 본가",
          reason: "다자녀 범위 테스트",
          requestedByUserId: ids.secondUser,
          requestedByName: "B 자녀",
        },
      ],
    });

    requireAuth.mockResolvedValue(parent);
  });

  afterAll(async () => {
    await prisma.pass.deleteMany({
      where: { studentProfileId: { in: [ids.firstProfile, ids.secondProfile] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.firstUser, ids.secondUser, parent.id] } },
    });
    if (createdAcademicYear !== null) {
      await prisma.academicYear.delete({ where: { year: createdAcademicYear } });
    }
  });

  it("상벌점 기준 자녀를 명시하고 모든 자녀의 동의 대기에 각 이름을 표시한다", async () => {
    const stream = await renderToReadableStream(await DashboardPage());
    await stream.allReady;
    const html = (await new Response(stream).text()).replaceAll("<!-- -->", "");

    expect(html).toContain("상벌점 · A 자녀님");
    expect(html).toContain("모든 자녀");
    expect(html).toContain("A 자녀님 · 외박 · A 자녀 본가");
    expect(html).toContain("B 자녀님 · 외박 · B 자녀 본가");
  });
});
