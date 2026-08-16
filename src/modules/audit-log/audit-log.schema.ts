import { z } from "zod";
import { formatDateInput, parseDateInputKst } from "@/lib/datetime";

export const AUDIT_PERIODS = ["today", "7d", "30d", "all"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export const PAGE_SIZE = 50;

export const auditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(60).optional(),
  period: z.enum(AUDIT_PERIODS).default("7d"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** 기간 필터를 실제 시각으로 바꾼다. all이면 하한이 없다. */
export function periodStart(period: AuditPeriod, now = new Date()): Date | null {
  if (period === "all") return null;

  if (period === "today") {
    // KST 기준 오늘 0시. 서버 타임존과 무관하다 — 시차를 손으로 더하고 빼는 대신
    // lib/datetime.ts를 거친다("포맷터를 페이지마다 만들면 timeZone 지정을
    // 빠뜨리는 순간 조용히 어긋나므로 여기 한 곳에서만 만든다").
    return parseDateInputKst(formatDateInput(now));
  }

  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
