import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();
const enrollmentFindMany = vi.fn();

// applyRoster()는 별도 파일(roster.repo.test.ts)에서 $transaction을 흉내 내
// 테스트한다 — listExisting()은 트랜잭션 밖에서 도는 단순 조회라 그 목과
// 섞이지 않게 파일을 분리했다.
vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
    enrollment: { findMany: enrollmentFindMany },
  },
}));

const { listExisting } = await import("@/modules/enrollment/roster.repo");

beforeEach(() => {
  studentProfileFindMany.mockReset();
  enrollmentFindMany.mockReset().mockResolvedValue([]);
});

describe("listExisting() — 이름을 NFC로 정규화한다 (I8)", () => {
  it("DB에 조합형(NFD)으로 저장된 이름도 완성형(NFC)으로 돌려준다", async () => {
    const nfdName = "김동혁".normalize("NFD");
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: nfdName, status: "ACTIVE", deletedAt: null },
        enrollments: [],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]!.name).toBe("김동혁".normalize("NFC"));
    expect(result[0]!.name).not.toBe(nfdName);
  });
});

describe("listExisting() — 소프트 삭제된 학생도 매칭을 위해 계속 들고 있는다", () => {
  it("WHERE에 deletedAt 조건을 넣지 않는다 — 명단에 다시 나타나면 원래 " +
    "studentCode로 이어붙어 되살아나야 한다(byCode 매칭). 여기서 걸러내면 그 " +
    "코드가 '명단에 없는 학생코드'로 보여 영영 못 돌아온다.", async () => {
    studentProfileFindMany.mockResolvedValue([]);

    await listExisting(2026);

    const call = studentProfileFindMany.mock.calls[0]![0] as { where: { user: unknown } };
    expect(call.where).toEqual({ user: { role: "STUDENT" } });
  });

  it("deletedAt이 찍힌 학생은 deleted: true로 표시한다", async () => {
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: "김동혁", status: "INACTIVE", deletedAt: new Date() },
        enrollments: [],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]!.deleted).toBe(true);
  });

  it("deletedAt이 null이면 deleted: false다", async () => {
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: "김동혁", status: "ACTIVE", deletedAt: null },
        enrollments: [],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]!.deleted).toBe(false);
  });
});
