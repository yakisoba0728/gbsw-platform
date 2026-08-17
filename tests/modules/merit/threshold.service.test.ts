import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { DEFAULT_DEMERIT_THRESHOLDS } from "@/core/authz/merit-track";

/**
 * 벌점 기준 설정.
 *
 * **행이 없어도 화면이 동작해야 한다** — 학교가 아직 한 번도 설정하지 않은
 * 상태가 정상이고, 그때는 코드의 기본값이 그대로 쓰인다. 그래서 "빈 DB"가
 * 여기서 첫 번째 케이스다.
 */

const listThresholds = vi.fn();
const upsertThreshold = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({ listThresholds, upsertThreshold }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const service = await import("@/modules/merit/threshold.service");

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "이정민",
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

/** repo.listThresholds가 내는 모양 (updatedAt·이름 스냅샷 포함). */
function row(track: string, warn: number, danger: number) {
  return {
    track,
    warn,
    danger,
    updatedAt: new Date("2026-08-17T00:00:00+09:00"),
    updatedByName: "이정민",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listThresholds.mockResolvedValue([]);
  upsertThreshold.mockResolvedValue(undefined);
  recordAudit.mockResolvedValue(undefined);
});

describe("readDemeritThresholds — 읽기와 폴백", () => {
  it("행이 하나도 없으면 코드 기본값이 그대로 나온다 — 빈 DB에서도 화면이 산다", async () => {
    const all = await service.readDemeritThresholds();

    expect(all.SCHOOL).toEqual(DEFAULT_DEMERIT_THRESHOLDS.SCHOOL);
    expect(all.DORM).toEqual(DEFAULT_DEMERIT_THRESHOLDS.DORM);
  });

  it("저장된 트랙은 저장값을, 없는 트랙은 기본값을 쓴다 — 한쪽만 설정한 상태가 정상이다", async () => {
    listThresholds.mockResolvedValue([row("SCHOOL", 15, 25)]);

    const all = await service.readDemeritThresholds();

    expect(all.SCHOOL).toEqual({ warn: 15, danger: 25 });
    expect(all.DORM).toEqual(DEFAULT_DEMERIT_THRESHOLDS.DORM);
  });

  it("모르는 트랙 행은 무시한다 — 트랙이 사라져도 화면 모양이 안 깨진다", async () => {
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
    // 한 번도 저장 안 한 트랙은 "설정된 적 없음"이 드러나야 한다 —
    // 기본값인지 학교가 정한 값인지 화면에서 구분되어야 하기 때문이다.
    const dorm = rows.find((r) => r.track === "DORM")!;
    expect(dorm).toMatchObject({ ...DEFAULT_DEMERIT_THRESHOLDS.DORM, configured: false });
    expect(school.configured).toBe(true);
  });

  it("트랙 순서는 MERIT_TRACKS와 같다 — 화면마다 순서가 흔들리지 않게", async () => {
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
  const input = { track: "SCHOOL" as const, warn: 15, danger: 25 };

  it("관리자는 기준을 바꾸고 감사로그가 남는다", async () => {
    listThresholds.mockResolvedValue([row("SCHOOL", 20, 30)]);

    await service.setDemeritThresholds(admin, input);

    expect(upsertThreshold).toHaveBeenCalledWith({
      track: "SCHOOL",
      warn: 15,
      danger: 25,
      updatedByUserId: admin.id,
      updatedByName: admin.name,
    });
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
    );
  });

  it("첫 저장의 '이전'은 실제로 쓰이던 기본값이다 — null이면 로그에서 무엇이 바뀌었는지 못 읽는다", async () => {
    listThresholds.mockResolvedValue([]);

    await service.setDemeritThresholds(admin, input);

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
    );
  });

  it("값이 그대로면 쓰지도 기록하지도 않는다 — 저장만 눌러도 로그가 쌓이면 안 된다", async () => {
    listThresholds.mockResolvedValue([row("SCHOOL", 20, 30)]);

    await service.setDemeritThresholds(admin, { track: "SCHOOL", warn: 20, danger: 30 });

    expect(upsertThreshold).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("행이 없을 때 기본값과 똑같은 값을 넣으면 저장한다 — '학교가 확인했다'는 사실 자체가 기록이다", async () => {
    listThresholds.mockResolvedValue([]);

    await service.setDemeritThresholds(admin, {
      track: "SCHOOL",
      ...DEFAULT_DEMERIT_THRESHOLDS.SCHOOL,
    });

    expect(upsertThreshold).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s는 기준을 바꿀 수 없다", async (_label, actor) => {
    await expect(service.setDemeritThresholds(actor, input)).rejects.toThrow("FORBIDDEN");
    expect(upsertThreshold).not.toHaveBeenCalled();
  });

  it("위험이 경고 이하면 서비스도 거부한다 — 스키마를 안 거친 호출이 있어도 막힌다", async () => {
    await expect(
      service.setDemeritThresholds(admin, { track: "SCHOOL", warn: 30, danger: 20 }),
    ).rejects.toThrow("INVALID_THRESHOLD_ORDER");
    expect(upsertThreshold).not.toHaveBeenCalled();
  });
});
