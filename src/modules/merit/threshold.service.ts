import { cache } from "react";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import {
  DEFAULT_DEMERIT_THRESHOLDS,
  isMeritTrack,
  MERIT_TRACKS,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import type { ThresholdInput } from "./merit.schema";

/**
 * 벌점 경고·위험 기준. 기본값은 마이그레이션이 아니라 읽을 때 채운다 — 행을
 * 심으면 기본값이 코드와 DB 두 곳에 생겨 다시 만나지 않는다.
 */

/**
 * 저장된 기준을 읽어 트랙별로 채운다. 없는 트랙은 코드 기본값.
 * 한 요청 안에서는 한 번만 조회한다(React cache).
 * 권한을 걸지 않는다 — 공개된 학칙 수치이고, 통제할 것은 바꾸는 쪽이다.
 */
export const readDemeritThresholds = cache(
  async (): Promise<Record<MeritTrack, DemeritThresholds>> => {
    const rows = await repo.listThresholds();
    const byTrack = new Map(rows.map((row) => [row.track, row]));

    // MERIT_TRACKS를 돌며 만든다 — DB의 track을 키로 쓰면 사라진 트랙의 행이 섞인다.
    return Object.fromEntries(
      MERIT_TRACKS.map((track) => {
        const row = byTrack.get(track);
        return [
          track,
          row
            ? { warn: row.warn, danger: row.danger }
            : DEFAULT_DEMERIT_THRESHOLDS[track],
        ];
      }),
    ) as Record<MeritTrack, DemeritThresholds>;
  },
);

/** 트랙 하나의 기준. 화면·통계가 실제로 부르는 입구다. */
export async function getDemeritThresholds(
  track: MeritTrack,
): Promise<DemeritThresholds> {
  return (await readDemeritThresholds())[track];
}

export type ThresholdSetting = DemeritThresholds & {
  track: MeritTrack;
  /**
   * 학교가 한 번이라도 저장했는가. false면 화면이 보는 값은 코드 기본값이다 —
   * "정한 20점"과 "아무도 안 정해서 남은 20점"은 다른 사실이다.
   */
  configured: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
};

/** 설정 화면이 보는 목록. 순서는 MERIT_TRACKS를 따른다. */
export async function listThresholdSettings(
  actor: SessionUser,
): Promise<ThresholdSetting[]> {
  await assertCan(actor, "merit:threshold:manage");

  const rows = await repo.listThresholds();
  const byTrack = new Map(
    rows.filter((row) => isMeritTrack(row.track)).map((row) => [row.track, row]),
  );

  return MERIT_TRACKS.map((track) => {
    const row = byTrack.get(track);
    if (!row) {
      return {
        track,
        ...DEFAULT_DEMERIT_THRESHOLDS[track],
        configured: false,
        updatedAt: null,
        updatedByName: null,
      };
    }
    return {
      track,
      warn: row.warn,
      danger: row.danger,
      configured: true,
      updatedAt: row.updatedAt,
      updatedByName: row.updatedByName,
    };
  });
}

/**
 * 기준 저장. 값이 그대로면 쓰지도 기록하지도 않는다. 단, 행이 아직 없으면
 * 기본값과 같아도 저장한다 — "학교가 이 값을 확인했다"는 사실이 기록이다.
 */
export async function setDemeritThresholds(
  actor: SessionUser,
  input: ThresholdInput,
): Promise<void> {
  await assertCan(actor, "merit:threshold:manage");

  // 재검증이 아니라 업무 불변식이다 — 위험이 경고 이하면 경고 구간이 통째로
  // 사라지는데 화면에는 아무 이상이 없어 보인다. 폼을 안 거치는 호출부도 막는다.
  if (input.danger <= input.warn) throw new MeritError("INVALID_THRESHOLD_ORDER");

  await withTransaction(async (tx) => {
    const current = await repo.findThreshold(input.track, tx);
    const write = {
      track: input.track,
      warn: input.warn,
      danger: input.danger,
      updatedByUserId: actor.id,
      updatedByName: actor.name,
    };

    if (input.updatedAt === null) {
      if (current) throw new MeritError("THRESHOLD_CONFLICT");

      const created = await repo.createThreshold(write, tx);
      if (!created) throw new MeritError("THRESHOLD_CONFLICT");

      await recordAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        action: "merit:threshold:update",
        targetType: "MeritThreshold",
        targetId: input.track,
        metadata: {
          track: input.track,
          warnFrom: DEFAULT_DEMERIT_THRESHOLDS[input.track].warn,
          warnTo: input.warn,
          dangerFrom: DEFAULT_DEMERIT_THRESHOLDS[input.track].danger,
          dangerTo: input.danger,
        },
      }, tx);
      return;
    }

    if (!current || current.updatedAt.getTime() !== input.updatedAt.getTime()) {
      throw new MeritError("THRESHOLD_CONFLICT");
    }

    if (current.warn === input.warn && current.danger === input.danger) return;

    const updated = await repo.updateThreshold(write, input.updatedAt, tx);
    if (!updated) throw new MeritError("THRESHOLD_CONFLICT");

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:threshold:update",
      targetType: "MeritThreshold",
      targetId: input.track,
      metadata: {
        track: input.track,
        warnFrom: current.warn,
        warnTo: input.warn,
        dangerFrom: current.danger,
        dangerTo: input.danger,
      },
    }, tx);
  });
}
