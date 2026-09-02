import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DEMERIT_THRESHOLDS } from "@/core/authz/merit-track";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const listThresholds = vi.fn();
const findThreshold = vi.fn();
const createThreshold = vi.fn();
const updateThreshold = vi.fn();
const {
  recordAudit,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("merit-threshold-service-test");

vi.mock("@/modules/merit/merit.repo", () => ({
  listThresholds,
  findThreshold,
  createThreshold,
  updateThreshold,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { MeritError } = await import("@/modules/merit/merit.error");
const service = await import("@/modules/merit/threshold.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });
const student = user("STUDENT", "s-1", { name: "이정민" });
const parent = user("PARENT", "p-1", { name: "이정민" });
const THRESHOLD_UPDATED_AT = new Date("2026-08-17T00:00:00.000Z");
const NEXT_UPDATED_AT = new Date("2026-08-18T00:00:00.000Z");

function row(track: string, warn: number, danger: number) {
  return {
    track,
    warn,
    danger,
    updatedAt: THRESHOLD_UPDATED_AT,
    updatedByName: "이정민",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listThresholds.mockResolvedValue([]);
  findThreshold.mockResolvedValue(null);
  createThreshold.mockResolvedValue(true);
  updateThreshold.mockResolvedValue(true);
  recordAudit.mockResolvedValue(undefined);
  withTransaction.mockClear();
});

describe("readDemeritThresholds — 읽기와 폴백", () => {
  it("행이 하나도 없으면 코드 기본값이 그대로 나온다", async () => {
    const all = await service.readDemeritThresholds();

    expect(all.SCHOOL).toEqual(DEFAULT_DEMERIT_THRESHOLDS.SCHOOL);
    expect(all.DORM).toEqual(DEFAULT_DEMERIT_THRESHOLDS.DORM);
  });

  it("저장된 트랙은 저장값을, 없는 트랙은 기본값을 쓴다", async () => {
    listThresholds.mockResolvedValue([row("SCHOOL", 15, 25)]);

    const all = await service.readDemeritThresholds();

    expect(all.SCHOOL).toEqual({ warn: 15, danger: 25 });
    expect(all.DORM).toEqual(DEFAULT_DEMERIT_THRESHOLDS.DORM);
  });

  it("모르는 트랙 행은 무시한다", async () => {
    listThresholds.mockResolvedValue([row("CLUB", 1, 2)]);

    const all = await service.readDemeritThresholds();

    expect(all).toEqual(DEFAULT_DEMERIT_THRESHOLDS);
    expect("CLUB" in all).toBe(false);
  });

  it("트랙 하나만 묻는 경로도 같은 값을 준다", async () => {
    listThresholds.mockResolvedValue([row("DORM", 40, 60)]);

    expect(await service.getDemeritThresholds("DORM")).toEqual({ warn: 40, danger: 60 });
    expect(await service.getDemeritThresholds("SCHOOL")).toEqual(
      DEFAULT_DEMERIT_THRESHOLDS.SCHOOL,
    );
  });
});

describe("listThresholdSettings — 설정 화면이 보는 값", () => {
  it("관리자는 현재 값과 마지막 수정자를 함께 본다", async () => {
    listThresholds.mockResolvedValue([row("SCHOOL", 15, 25)]);

    const rows = await service.listThresholdSettings(admin);

    const school = rows.find((r) => r.track === "SCHOOL")!;
    expect(school.warn).toBe(15);
    expect(school.updatedByName).toBe("이정민");
    const dorm = rows.find((r) => r.track === "DORM")!;
    expect(dorm).toMatchObject({ ...DEFAULT_DEMERIT_THRESHOLDS.DORM, configured: false });
    expect(school.configured).toBe(true);
  });

  it("트랙 순서는 MERIT_TRACKS와 같다", async () => {
    const rows = await service.listThresholdSettings(admin);
    expect(rows.map((r) => r.track)).toEqual(["SCHOOL", "DORM"]);
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s는 설정 목록을 볼 수 없다", async (_label, actor) => {
    await expect(service.listThresholdSettings(actor)).rejects.toThrow("FORBIDDEN");
  });
});

describe("setDemeritThresholds — 저장", () => {
  const input = {
    track: "SCHOOL" as const,
    updatedAt: THRESHOLD_UPDATED_AT,
    warn: 15,
    danger: 25,
  };

  it("관리자는 기준을 바꾸고 감사로그가 남는다", async () => {
    findThreshold.mockResolvedValue(row("SCHOOL", 20, 30));

    await service.setDemeritThresholds(admin, input);

    expect(updateThreshold).toHaveBeenCalledWith({
      track: "SCHOOL",
      warn: 15,
      danger: 25,
      updatedByUserId: admin.id,
      updatedByName: admin.name,
    }, THRESHOLD_UPDATED_AT, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        actorName: admin.name,
        action: "merit:threshold:update",
        targetType: "MeritThreshold",
        targetId: "SCHOOL",
        metadata: {
          track: "SCHOOL",
          warnFrom: 20,
          warnTo: 15,
          dangerFrom: 30,
          dangerTo: 25,
        },
      }),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("첫 저장의 '이전'은 실제로 쓰이던 기본값이다", async () => {
    findThreshold.mockResolvedValue(null);

    await service.setDemeritThresholds(admin, { ...input, updatedAt: null });

    expect(createThreshold).toHaveBeenCalledWith(
      expect.objectContaining({ track: "SCHOOL", warn: 15, danger: 25 }),
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          track: "SCHOOL",
          warnFrom: DEFAULT_DEMERIT_THRESHOLDS.SCHOOL.warn,
          warnTo: 15,
          dangerFrom: DEFAULT_DEMERIT_THRESHOLDS.SCHOOL.danger,
          dangerTo: 25,
        },
      }),
      txClient,
    );
  });

  it("값이 그대로면 쓰지도 기록하지도 않는다", async () => {
    findThreshold.mockResolvedValue(row("SCHOOL", 20, 30));

    await service.setDemeritThresholds(admin, {
      track: "SCHOOL",
      updatedAt: THRESHOLD_UPDATED_AT,
      warn: 20,
      danger: 30,
    });

    expect(createThreshold).not.toHaveBeenCalled();
    expect(updateThreshold).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("행이 없을 때 기본값과 똑같은 값을 넣으면 저장한다", async () => {
    findThreshold.mockResolvedValue(null);

    await service.setDemeritThresholds(admin, {
      track: "SCHOOL",
      updatedAt: null,
      ...DEFAULT_DEMERIT_THRESHOLDS.SCHOOL,
    });

    expect(createThreshold).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
  });

  it("화면이 읽은 뒤 다른 관리자가 설정을 바꾸면 충돌로 거부한다", async () => {
    findThreshold.mockResolvedValue({
      ...row("SCHOOL", 18, 28),
      updatedAt: NEXT_UPDATED_AT,
    });

    await expect(service.setDemeritThresholds(admin, input)).rejects.toThrow(MeritError);
    await expect(service.setDemeritThresholds(admin, input)).rejects.toThrow(
      "THRESHOLD_CONFLICT",
    );

    expect(updateThreshold).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("조건부 갱신 수가 0이면 감사 없이 충돌로 거부한다", async () => {
    findThreshold.mockResolvedValue(row("SCHOOL", 20, 30));
    updateThreshold.mockResolvedValue(false);

    await expect(service.setDemeritThresholds(admin, input)).rejects.toThrow(
      "THRESHOLD_CONFLICT",
    );

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("미설정 화면을 연 뒤 누군가 먼저 만들었으면 충돌로 거부한다", async () => {
    findThreshold.mockResolvedValue(row("SCHOOL", 20, 30));

    await expect(
      service.setDemeritThresholds(admin, { ...input, updatedAt: null }),
    ).rejects.toThrow("THRESHOLD_CONFLICT");

    expect(createThreshold).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("미설정 행 생성 경합에서 뒤늦게 지면 감사 없이 충돌로 거부한다", async () => {
    findThreshold.mockResolvedValue(null);
    createThreshold.mockResolvedValue(false);

    await expect(
      service.setDemeritThresholds(admin, { ...input, updatedAt: null }),
    ).rejects.toThrow("THRESHOLD_CONFLICT");

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s는 기준을 바꿀 수 없다", async (_label, actor) => {
    await expect(service.setDemeritThresholds(actor, input)).rejects.toThrow("FORBIDDEN");
    expect(createThreshold).not.toHaveBeenCalled();
    expect(updateThreshold).not.toHaveBeenCalled();
  });

  it("위험이 경고 이하면 서비스도 거부한다", async () => {
    await expect(
      service.setDemeritThresholds(admin, {
        track: "SCHOOL",
        updatedAt: THRESHOLD_UPDATED_AT,
        warn: 30,
        danger: 20,
      }),
    ).rejects.toThrow("INVALID_THRESHOLD_ORDER");
    expect(createThreshold).not.toHaveBeenCalled();
    expect(updateThreshold).not.toHaveBeenCalled();
  });
});
