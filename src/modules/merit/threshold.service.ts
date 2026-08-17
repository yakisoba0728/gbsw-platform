import { cache } from "react";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
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
 * 벌점 경고·위험 기준.
 *
 * 부여·취소(award.service), 규정 관리(rule.service), 통계(stats.service)에 이은
 * **네 번째 책임**이라 파일을 나눈다 — CLAUDE.md의 "repo는 하나, 서비스는
 * 책임별로 나눈다"이고, 화면 경계(app/(app)/admin/settings)와도 겹친다.
 *
 * ## 기본값을 마이그레이션이 아니라 읽을 때 채우는 이유
 *
 * 마이그레이션으로 두 행을 심으면 기본값이 **두 곳**(코드 상수와 이미 배포된
 * DB의 행)에 생기고, 그 뒤로 둘은 절대 다시 만나지 않는다 — 상수를 고쳐도
 * 배포된 학교는 옛 행을 그대로 쓰고, 그 사실이 화면 어디에도 안 드러난다.
 * 읽을 때 채우면 "한 번도 설정하지 않았다"는 상태가 그대로 남아서, 설정
 * 화면이 "아직 기본값입니다"라고 적을 수 있다(listThresholdSettings의
 * configured). 빈 DB에서 화면이 사는 것은 덤이 아니라 이 선택의 결과다.
 */

/**
 * 저장된 기준을 읽어 트랙별로 채운다. 없는 트랙은 코드 기본값.
 *
 * **한 요청 안에서는 한 번만 조회한다** (React cache) —
 * academic-year.service.ts의 getCurrentYear와 같은 규약이다. 통계 화면 하나가
 * 이 값을 여러 번 필요로 한다(명단 걸러내기·단계 계산·화면에 적을 숫자).
 * 같은 요청 안에서 기준이 바뀔 일은 없고, 요청이 끝나면 캐시도 사라져서
 * 기준을 바꾼 직후 화면이 옛 값을 보지 않는다.
 *
 * **권한을 걸지 않는다.** getCurrentYear와 같은 판단이다 — 학년도처럼 화면 곳곳이
 * 표시를 위해 읽는 값이고, 숫자 자체가 이미 학생용 화면에도 적히는 공개된
 * 학칙 수치다. 통제해야 하는 것은 읽기가 아니라 **바꾸는 일**이며 그쪽은
 * setDemeritThresholds가 assertCan으로 막는다.
 */
export const readDemeritThresholds = cache(
  async (): Promise<Record<MeritTrack, DemeritThresholds>> => {
    const rows = await repo.listThresholds();
    const byTrack = new Map(rows.map((row) => [row.track, row]));

    // MERIT_TRACKS를 돌며 만든다 — DB에서 온 track을 그대로 키로 쓰면 트랙이
    // 사라진 뒤 남은 행("CLUB")이 결과에 섞여 화면 모양이 흐트러진다.
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
   * 학교가 한 번이라도 저장했는가. false면 화면이 보고 있는 값은 코드 기본값이다 —
   * "우리 학교가 정한 20점"과 "아무도 안 정해서 남아 있는 20점"은 다른 사실이라
   * 설정 화면에서 구분되어야 한다.
   */
  configured: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
};

/**
 * 설정 화면이 보는 목록. 현재 값 + 마지막으로 고친 사람.
 *
 * 순서는 MERIT_TRACKS를 따른다 — 트랙 순서가 화면마다 흔들리면 같은 칸을
 * 매번 다시 찾아야 한다.
 */
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
 * 기준 저장.
 *
 * 값이 그대로면 쓰지도, 기록하지도 않는다 — 저장만 눌러도 감사로그가 쌓이지
 * 않게 (rule.service.updateRule·academic-year.service.setCurrentYear와 같은 원칙).
 * **단, 행이 아직 없으면 기본값과 같은 값이어도 저장한다** — "학교가 이 값을
 * 확인했다"는 사실 자체가 기록이고, 그래야 설정 화면의 "아직 기본값입니다"가
 * 사라진다.
 */
export async function setDemeritThresholds(
  actor: SessionUser,
  input: ThresholdInput,
): Promise<void> {
  await assertCan(actor, "merit:threshold:manage");

  /*
   * 입력 모양은 경계(thresholdSchema)가 이미 봤다. 여기서 순서만 한 번 더 보는
   * 것은 재검증이 아니라 **업무 불변식**이다 — 위험이 경고 이하인 행이 한 줄
   * 들어가면 demeritLevel의 경고 구간이 통째로 사라지는데, 화면에는 아무 이상이
   * 없어 보인다. 폼을 안 거치는 호출부(스크립트·미래의 API)가 생겨도 이 한 줄이
   * 남아 있어야 그 사고가 안 난다.
   */
  if (input.danger <= input.warn) throw new MeritError("INVALID_THRESHOLD_ORDER");

  const rows = await repo.listThresholds();
  const current = rows.find((row) => row.track === input.track);

  if (current && current.warn === input.warn && current.danger === input.danger) {
    return;
  }

  await repo.upsertThreshold({
    track: input.track,
    warn: input.warn,
    danger: input.danger,
    updatedByUserId: actor.id,
    updatedByName: actor.name,
  });

  // "이전"은 실제로 쓰이던 값이다 — 행이 없었으면 화면이 보여주던 것은
  // 코드 기본값이므로 그 숫자를 남긴다. null을 남기면 첫 설정(가장 흔한
  // 경우)에서 로그가 무엇이 바뀌었는지 답하지 못한다.
  const before = current ?? DEFAULT_DEMERIT_THRESHOLDS[input.track];

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:threshold:update",
    targetType: "MeritThreshold",
    targetId: input.track,
    metadata: {
      track: input.track,
      warnFrom: before.warn,
      warnTo: input.warn,
      dangerFrom: before.danger,
      dangerTo: input.danger,
    },
  });
}
