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

export function periodStart(period: AuditPeriod, now = new Date()): Date | null {
  if (period === "all") return null;

  if (period === "today") {
    return parseDateInputKst(formatDateInput(now));
  }

  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
