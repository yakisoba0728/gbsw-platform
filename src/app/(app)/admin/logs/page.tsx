import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { formatDateTime } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import {
  auditActionLabel,
  auditActionTone,
  auditTargetLabel,
  formatAuditMetadata,
} from "@/modules/audit-log/audit-log.labels";
import { auditQuerySchema } from "@/modules/audit-log/audit-log.schema";
import { readAuditLog } from "@/modules/audit-log/audit-log.service";
import { LogFilters } from "./log-filters";

export const metadata: Metadata = { title: "로그" };

const HEADERS = ["시각", "행위자", "동작", "대상", "접속", "상세"] as const;

/** 본문 셀의 좌우 여백. 머리글과 같은 규칙을 써야 세로줄이 맞는다. */
const cell = (index: number) => `${tableCellPadding(index, HEADERS.length)} py-3`;

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("audit:read");

  const raw = await searchParams;
  // 검증은 경계에서 한 번만. 잘못된 쿼리는 기본값으로 떨어진다.
  const parsed = auditQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});

  const { entries, total, actions, page, pageCount } = await readAuditLog(
    actor,
    query,
  );

  return (
    <SectionCard
      title="감사로그"
      aside={<span className="text-[12px] text-mut">{total}건</span>}
      controls={
        <LogFilters
          actions={actions}
          period={query.period}
          action={query.action ?? ""}
          actor={query.actor ?? ""}
        />
      }
      flush
      className="mx-auto max-w-6xl"
    >
      {entries.length === 0 ? (
        <EmptyState variant="inside">조건에 맞는 기록이 없습니다.</EmptyState>
      ) : (
        /*
          시각은 `26. 8. 14. 오전 8:30:16`이 통째로 들어가야 한다 —
          whitespace-nowrap이라 좁으면 넘쳐서 옆 열을 덮는다.
          상세는 남는 폭을 가져간다 (가장 길고 가장 자주 읽는 열).
        */
        <TableFrame
          minWidth={840}
          fixed
          cols={[
            "w-[188px]",
            "w-[148px]",
            "w-[132px]",
            "w-[76px]",
            "w-[132px]",
            undefined,
          ]}
          headers={HEADERS}
        >
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-line2 last:border-0">
                <td className={`${cell(0)} whitespace-nowrap text-mut`}>
                  {formatDateTime(entry.createdAt)}
                </td>
                <td className={cell(1)}>
                  <span className="block truncate text-ink">{entry.actorName}</span>
                  <span className="block truncate text-[12px] text-mut">
                    {entry.actor
                      ? isRole(entry.actor.role)
                        ? ROLE_LABELS[entry.actor.role]
                        : entry.actor.email
                      : "탈퇴한 계정"}
                  </span>
                </td>
                <td className={cell(2)}>
                  <Badge tone={auditActionTone(entry.action)}>
                    {auditActionLabel(entry.action)}
                  </Badge>
                </td>
                <td className={`${cell(3)} text-mut`}>
                  {auditTargetLabel(entry.targetType)}
                </td>
                <td
                  className={`${cell(4)} text-mut`}
                  title={entry.userAgent ?? undefined}
                >
                  {entry.ip ?? "—"}
                </td>
                <td className={`${cell(5)} text-[12px] break-words text-mut`}>
                  {formatAuditMetadata(entry.action, entry.metadata) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between border-t border-line px-5 py-3.5 text-[13px]">
          <PageLink page={page - 1} disabled={page <= 1} params={raw}>
            이전
          </PageLink>
          <span className="text-mut">
            {page} / {pageCount}
          </span>
          <PageLink page={page + 1} disabled={page >= pageCount} params={raw}>
            다음
          </PageLink>
        </nav>
      )}
    </SectionCard>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-mut2">{children}</span>;
  }

  return (
    <Link
      href={hrefWith("/admin/logs", params, { page: String(page) })}
      className="font-semibold text-pri hover:underline"
    >
      {children}
    </Link>
  );
}
