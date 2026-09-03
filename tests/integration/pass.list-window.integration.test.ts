import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import { listMyChildren } from "@/modules/merit/award.service";
import {
  listActivePasses,
  listPendingPasses,
} from "@/modules/pass/decision.service";
import {
  getMyChildPasses,
  getMyChildPassesAwaitingConsent,
  getMyLivePasses,
  getMyPasses,
} from "@/modules/pass/request.service";
import {
  PASS_ADMIN_PAGE_SIZE,
  PASS_HISTORY_PAGE_SIZE,
} from "@/modules/pass/pass.schema";
import { user } from "../helpers/session";

vi.mock("server-only", () => ({}));

const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const ids = {
  admin: `pass-list-admin-${suffix}`,
  student: `pass-list-student-${suffix}`,
  parent: `pass-list-parent-${suffix}`,
  otherStudent: `pass-list-other-student-${suffix}`,
  profile: "",
};

const admin = user("ADMIN", ids.admin, {
  name: "출입증 목록 관리자",
  email: `pass-list-admin-${suffix}@example.invalid`,
});
const student = user("STUDENT", ids.student, {
  name: "B 자녀",
  email: `pass-list-student-${suffix}@example.invalid`,
});
const parent = user("PARENT", ids.parent, {
  name: "출입증 목록 학부모",
  email: `pass-list-parent-${suffix}@example.invalid`,
});

const now = new Date("2099-06-01T03:00:00.000Z");
let pendingBefore = 0;
let activeBefore = 0;

type CursorPage = {
  entries: { id: string }[];
  total: number;
  nextCursor: string | null;
};

/* 커서를 따라 끝까지 걷는다. 쪽 수를 전체 건수로 미리 묶어 두어, 커서가 듣지 않아
   같은 쪽이 되풀이되면 매달리지 않고 stoppedAtEnd: false로 끝난다. */
async function walkPages(
  fetchPage: (cursor: string | null) => Promise<CursorPage>,
): Promise<{ seen: string[]; total: number; pages: number; stoppedAtEnd: boolean }> {
  const seen: string[] = [];
  let cursor: string | null = null;
  let total = 0;
  let pages = 0;

  do {
    const page = await fetchPage(cursor);
    total = page.total;
    seen.push(...page.entries.map((entry) => entry.id));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages <= Math.ceil(total / PASS_ADMIN_PAGE_SIZE) + 1);

  return { seen, total, pages, stoppedAtEnd: cursor === null };
}

describe("역할별 출입증 목록 창과 정확한 건수", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          phone: `013-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
          role: "ADMIN",
          status: "ACTIVE",
        },
        {
          id: parent.id,
          name: parent.name,
          email: parent.email,
          phone: `014-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
          role: "PARENT",
          status: "ACTIVE",
        },
      ],
    });
    const createdStudent = await prisma.user.create({
      data: {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: `015-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          create: {
            studentCode: `PL${suffix}`,
            birthDate: new Date("2010-01-01T00:00:00+09:00"),
          },
        },
      },
      select: { studentProfile: { select: { id: true } } },
    });
    ids.profile = createdStudent.studentProfile!.id;
    await prisma.parentStudent.create({
      data: { parentUserId: parent.id, studentId: ids.profile },
    });
    const otherStudent = await prisma.user.create({
      data: {
        id: ids.otherStudent,
        name: "A 자녀",
        email: `pass-list-other-${suffix}@example.invalid`,
        phone: `016-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          create: {
            studentCode: `PO${suffix}`,
            birthDate: new Date("2010-02-01T00:00:00+09:00"),
            parents: { create: { parentUserId: parent.id } },
          },
        },
      },
      select: { id: true },
    });
    expect(otherStudent.id).toBe(ids.otherStudent);

    const pendingWhere = {
      status: { in: ["REQUESTED", "CONSENTED"] },
      endAt: { gt: now },
    };
    const activeWhere = {
      status: "APPROVED",
      startAt: { lte: now },
      endAt: { gt: now },
    };
    [pendingBefore, activeBefore] = await Promise.all([
      prisma.pass.count({ where: pendingWhere }),
      prisma.pass.count({ where: activeWhere }),
    ]);

    await prisma.pass.createMany({
      data: [
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `pass-list-history-${suffix}-${String(index).padStart(3, "0")}`,
          studentProfileId: ids.profile,
          type: "OUTING",
          status: "CANCELLED",
          startAt: new Date(Date.UTC(2099, 6, index + 1, 3)),
          endAt: new Date(Date.UTC(2099, 6, index + 1, 5)),
          destination: "지난 기록",
          reason: "목록 페이지 테스트",
          requestedByUserId: student.id,
          requestedByName: student.name,
        })),
        ...Array.from({ length: 101 }, (_, index) => ({
          id: `pass-list-pending-${suffix}-${String(index).padStart(3, "0")}`,
          studentProfileId: ids.profile,
          type: "OUTING",
          status: "REQUESTED",
          startAt: new Date("2099-06-02T03:00:00.000Z"),
          endAt: new Date("2099-06-03T03:00:00.000Z"),
          destination: `결재 대기 ${index}`,
          reason: "정확한 건수 테스트",
          requestedByUserId: student.id,
          requestedByName: student.name,
        })),
        ...Array.from({ length: 201 }, (_, index) => ({
          id: `pass-list-active-${suffix}-${String(index).padStart(3, "0")}`,
          studentProfileId: ids.profile,
          type: "OUTING",
          status: "APPROVED",
          startAt: new Date("2099-05-31T03:00:00.000Z"),
          endAt: new Date("2099-06-02T03:00:00.000Z"),
          destination: `사용 중 ${index}`,
          reason: "정확한 건수 테스트",
          requestedByUserId: student.id,
          requestedByName: student.name,
        })),
      ],
    });
  });

  afterAll(async () => {
    await prisma.pass.deleteMany({ where: { studentProfileId: ids.profile } });
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [admin.id, student.id, parent.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, student.id, parent.id, ids.otherStudent] } },
    });
  });

  it("학생과 학부모가 50건 이후 기록도 페이지로 모두 볼 수 있다", async () => {
    const studentPage1 = await getMyPasses(student, 1);
    const studentLastPage = await getMyPasses(student, 17);
    const studentClampedPage = await getMyPasses(student, 999);
    const parentPage1 = await getMyChildPasses(parent, 1, now);
    const parentLastPage = await getMyChildPasses(parent, 17, now);
    const parentClampedPage = await getMyChildPasses(parent, 999, now);

    expect(studentPage1.entries).toHaveLength(PASS_HISTORY_PAGE_SIZE);
    expect(studentPage1.total).toBe(327);
    expect(studentPage1.pageCount).toBe(17);
    expect(studentLastPage.entries).toHaveLength(7);
    expect(studentClampedPage.page).toBe(17);
    expect(studentClampedPage.entries).toHaveLength(7);

    expect(parentPage1.entries).toHaveLength(PASS_HISTORY_PAGE_SIZE);
    expect(parentPage1.total).toBe(327);
    expect(parentPage1.pageCount).toBe(17);
    expect(parentLastPage.entries).toHaveLength(7);
    expect(parentClampedPage.page).toBe(17);
    expect(parentClampedPage.entries).toHaveLength(7);
  });

  it("대시보드는 페이지 앞의 취소 기록을 건너뛰고 살아 있는 출입증 5건을 찾는다", async () => {
    const historyPage = await getMyPasses(student, 1);
    const live = await getMyLivePasses(student, now);

    expect(historyPage.entries.every((pass) => pass.status === "CANCELLED")).toBe(true);
    expect(live).toHaveLength(5);
    expect(live.every((pass) => ["REQUESTED", "CONSENTED", "APPROVED"].includes(pass.status))).toBe(
      true,
    );
  });

  it("학부모 자녀 선택 순서는 이름과 id로 항상 같다", async () => {
    const children = await listMyChildren(parent);

    expect(children.map((child) => child.name)).toEqual(["A 자녀", "B 자녀"]);
  });

  it("교사 현황은 표시 상한과 별개로 전체 건수를 돌려준다", async () => {
    const [pending, active] = await Promise.all([
      listPendingPasses(admin, now),
      listActivePasses(admin, now),
    ]);

    expect(pending.entries).toHaveLength(PASS_ADMIN_PAGE_SIZE);
    expect(pending.total).toBe(pendingBefore + 101);
    expect(pending.nextCursor).toBe(pending.entries.at(-1)!.id);
    expect(active.entries).toHaveLength(PASS_ADMIN_PAGE_SIZE);
    expect(active.total).toBe(activeBefore + 201);
    expect(active.nextCursor).toBe(active.entries.at(-1)!.id);
  });

  it("교사는 커서를 따라 마지막 결재 대기 신청까지 도달한다", async () => {
    const walk = await walkPages((cursor) => listPendingPasses(admin, now, cursor));

    // 커서를 무시하면 같은 쪽이 반복되어 여기서 멈추지 않는다.
    expect(walk.stoppedAtEnd).toBe(true);
    expect(walk.seen).toHaveLength(walk.total);
    expect(new Set(walk.seen).size).toBe(walk.seen.length);
    // 상한 100건에 가려 승인도 반려도 할 수 없던 101번째 신청이다.
    expect(walk.seen).toContain(`pass-list-pending-${suffix}-100`);
  });

  it("교사는 커서를 따라 마지막 사용 중 출입증까지 도달한다", async () => {
    const walk = await walkPages((cursor) => listActivePasses(admin, now, cursor));

    expect(walk.stoppedAtEnd).toBe(true);
    expect(walk.seen).toHaveLength(walk.total);
    expect(new Set(walk.seen).size).toBe(walk.seen.length);
    // 상한 200건에 가려 정문에서 찾을 수 없던 201번째 출입증이다.
    expect(walk.seen).toContain(`pass-list-active-${suffix}-200`);
  });

  it("커서 행이 결재되어 목록에서 빠져도 다음 쪽이 한 건을 건너뛰지 않는다", async () => {
    const first = await listPendingPasses(admin, now);
    const cursor = first.nextCursor!;
    const second = await listPendingPasses(admin, now, cursor);
    const head = second.entries[0]!.id;

    await prisma.pass.update({
      where: { id: cursor },
      data: { status: "APPROVED", decidedByUserId: admin.id, decidedByName: admin.name },
    });

    try {
      const again = await listPendingPasses(admin, now, cursor);

      expect(again.entries[0]!.id).toBe(head);
      expect(again.total).toBe(first.total - 1);
    } finally {
      await prisma.pass.update({
        where: { id: cursor },
        data: { status: "REQUESTED", decidedByUserId: null, decidedByName: null },
      });
    }
  });

  it("보호자 동의 대기는 호출 화면의 상한 이상을 읽지 않는다", async () => {
    const idsToDelete = Array.from(
      { length: 51 },
      (_, index) => `pass-list-consent-${suffix}-${String(index).padStart(3, "0")}`,
    );
    await prisma.pass.createMany({
      data: idsToDelete.map((id, index) => ({
        id,
        studentProfileId: ids.profile,
        type: "OVERNIGHT",
        status: "REQUESTED",
        startAt: new Date(Date.UTC(2099, 7, index + 1, 3)),
        endAt: new Date(Date.UTC(2099, 7, index + 2, 3)),
        destination: `동의 대기 ${index}`,
        reason: "조회 상한 테스트",
        requestedByUserId: student.id,
        requestedByName: student.name,
      })),
    });

    try {
      const dashboard = await getMyChildPassesAwaitingConsent(parent, now, 5);
      const fullView = await getMyChildPassesAwaitingConsent(parent, now);

      expect(dashboard).toHaveLength(5);
      expect(fullView).toHaveLength(50);
    } finally {
      await prisma.pass.deleteMany({ where: { id: { in: idsToDelete } } });
    }
  });
});
