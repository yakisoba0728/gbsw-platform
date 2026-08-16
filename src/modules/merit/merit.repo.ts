import { prisma } from "@/core/db/client";
import type { MeritTrack } from "@/core/authz/merit-track";
import type { CreateRuleInput, UpdateRuleInput } from "./merit.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

// ── 규정 ──────────────────────────────────────────────────────

export async function createRule(input: CreateRuleInput): Promise<{ id: string }> {
  const rule = await prisma.meritRule.create({
    data: {
      track: input.track,
      kind: input.kind,
      label: input.label,
      points: input.points,
      category: input.category,
      description: input.description,
    },
    select: { id: true },
  });
  return rule;
}

export async function findRule(id: string) {
  return prisma.meritRule.findUnique({
    where: { id },
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
    },
  });
}

/** track·kind는 인자에 없다 — 생성 시 고정이다. */
export async function updateRule(
  id: string,
  data: Omit<UpdateRuleInput, "ruleId">,
): Promise<void> {
  await prisma.meritRule.update({
    where: { id },
    data: {
      label: data.label,
      points: data.points,
      category: data.category,
      description: data.description,
    },
  });
}

export async function deactivateRule(id: string): Promise<void> {
  await prisma.meritRule.update({ where: { id }, data: { active: false } });
}

/** 비활성 포함 전부. 규정 관리 화면이 쓴다. */
export async function listRules(track: MeritTrack) {
  return prisma.meritRule.findMany({
    where: { track },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { points: "asc" }],
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
    },
  });
}

/** 부여 화면의 선택지. 비활성은 빠진다. */
export async function listActiveRules(track: MeritTrack) {
  return prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: [{ kind: "asc" }, { points: "asc" }],
    select: { id: true, kind: true, label: true, points: true, category: true },
  });
}
