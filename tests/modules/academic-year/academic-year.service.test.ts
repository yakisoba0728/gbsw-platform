import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const findCurrent = vi.fn();
const listYearsRepo = vi.fn();
const createYearRepo = vi.fn();
const setCurrentRepo = vi.fn();
const recordAudit = vi.fn();
const withTransaction = vi.fn();
const tx = { tx: true };

class YearTakenError extends Error {}

vi.mock("@/modules/academic-year/academic-year.repo", () => ({
  YearTakenError,
  findCurrent,
  listYears: listYearsRepo,
  createYear: createYearRepo,
  setCurrent: setCurrentRepo,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { AcademicYearError, createYear, getCurrentYear, listYears, setCurrentYear } =
  await import("@/modules/academic-year/academic-year.service");

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

beforeEach(() => {
  findCurrent.mockReset().mockResolvedValue({ year: 2026 });
  listYearsRepo.mockReset().mockResolvedValue([]);
  createYearRepo.mockReset();
  setCurrentRepo.mockReset().mockResolvedValue({
    changed: true,
    previousYear: 2026,
  });
  recordAudit.mockReset();
  withTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
});

describe("getCurrentYear()", () => {
  it("현재 학년도를 돌려준다", async () => {
    await expect(getCurrentYear()).resolves.toBe(2026);
  });

  it("현재 학년도가 없으면 던진다 — 조용히 넘어가면 소속이 통째로 비어 보인다", async () => {
    findCurrent.mockResolvedValue(null);
    await expect(getCurrentYear()).rejects.toThrow(AcademicYearError);
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

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(createYearRepo).toHaveBeenCalledWith(2027, tx);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "academic-year:create", targetId: "2027" }),
      tx,
    );
  });

  it("말이 안 되는 연도는 거부한다", async () => {
    await expect(createYear(admin, 1999)).rejects.toThrow("INVALID_YEAR");
    await expect(createYear(admin, 2200)).rejects.toThrow("INVALID_YEAR");
    expect(createYearRepo).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("이미 있는 학년도는 우리 오류로 옮긴다 — DB 장애와 구분해야 한다 (M3)", async () => {
    createYearRepo.mockRejectedValue(new YearTakenError());

    await expect(createYear(admin, 2027)).rejects.toThrow(AcademicYearError);
    await expect(createYear(admin, 2027)).rejects.toThrow("YEAR_TAKEN");
  });

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    createYearRepo.mockRejectedValue(boom);

    await expect(createYear(admin, 2027)).rejects.toBe(boom);
  });
});

describe("setCurrentYear()", () => {
  it("현재 학년도를 바꾸고 감사로그를 남긴다", async () => {
    await setCurrentYear(admin, 2027);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(setCurrentRepo).toHaveBeenCalledWith(2027, tx);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "academic-year:set-current",
        targetId: "2027",
        metadata: { from: 2026 },
      }),
      tx,
    );
  });

  it("이미 현재 학년도면 아무것도 하지 않는다", async () => {
    setCurrentRepo.mockResolvedValue({ changed: false, previousYear: 2026 });

    await setCurrentYear(admin, 2026);

    expect(setCurrentRepo).toHaveBeenCalledWith(2026, tx);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("병렬 전환 뒤 repo가 반환한 실제 직전 학년도를 감사한다", async () => {
    setCurrentRepo.mockResolvedValue({ changed: true, previousYear: 2027 });

    await setCurrentYear(admin, 2028);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { from: 2027 } }),
      tx,
    );
  });
});
