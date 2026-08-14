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
        user: { id: "u-1", name: nfdName, status: "ACTIVE" },
        enrollments: [],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]!.name).toBe("김동혁".normalize("NFC"));
    expect(result[0]!.name).not.toBe(nfdName);
  });
});
