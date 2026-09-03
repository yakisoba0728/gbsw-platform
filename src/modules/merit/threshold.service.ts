import { cache } from "react";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import {
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import {
  DEFAULT_DEMERIT_THRESHOLDS,
  type DemeritThresholds,
} from "./merit.points";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import type { ThresholdInput } from "./merit.schema";

export const readDemeritThresholds = cache(
  async (): Promise<Record<MeritTrack, DemeritThresholds>> => {
    const rows = await repo.listThresholds();
    const byTrack = new Map(rows.map((row) => [row.track, row]));

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

export async function getDemeritThresholds(
  track: MeritTrack,
): Promise<DemeritThresholds> {
  return (await readDemeritThresholds())[track];
}

type ThresholdSetting = DemeritThresholds & {
  track: MeritTrack;
  configured: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
};

export async function listThresholdSettings(
  actor: SessionUser,
): Promise<ThresholdSetting[]> {
  await assertCan(actor, "merit:threshold:manage");

  const rows = await repo.listThresholds();
  const byTrack = new Map(rows.map((row) => [row.track, row]));

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

export async function setDemeritThresholds(
  actor: SessionUser,
  input: ThresholdInput,
): Promise<void> {
  await assertCan(actor, "merit:threshold:manage");

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
