import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { formatDateTime } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { auditQuerySchema } from "@/modules/audit-log/audit-log.schema";
import { readAuditLog } from "@/modules/audit-log/audit-log.service";
import { LogFilters } from "./log-filters";

export const metadata: Metadata = { title: "로그" };

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
    <div className="mx-auto max-w-6xl rounded-card border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">감사로그</h2>
        <span className="text-[12px] text-mut">{total}건</span>
      </header>

      <LogFilters
        actions={actions}
        period={query.period}
        action={query.action ?? ""}
        actor={query.actor ?? ""}
      />

      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-mut">
          조건에 맞는 기록이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line2 text-[12px] text-mut">
                <th className="px-5 py-2.5 font-semibold">시각</th>
                <th className="px-3 py-2.5 font-semibold">행위자</th>
                <th className="px-3 py-2.5 font-semibold">동작</th>
                <th className="px-3 py-2.5 font-semibold">대상</th>
                <th className="px-3 py-2.5 font-semibold">접속</th>
                <th className="px-5 py-2.5 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-mut">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-ink">{entry.actorName}</span>
                    <span className="block text-[12px] text-mut">
                      {entry.actor
                        ? isRole(entry.actor.role)
                          ? ROLE_LABELS[entry.actor.role]
                          : entry.actor.email
                        : "탈퇴한 계정"}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-ink">
                    {entry.action}
                  </td>
                  <td className="px-3 py-3 text-mut">{entry.targetType}</td>
                  <td className="px-3 py-3 text-mut">
                    {entry.ip ?? "—"}
                    {entry.userAgent && (
                      <span
                        className="block max-w-[180px] truncate text-[11.5px] text-mut2"
                        title={entry.userAgent}
                      >
                        {entry.userAgent}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[12px] text-mut">
                    <Detail metadata={entry.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}

/** metadata를 key=value로 눕혀서 보여준다. */
function Detail({ metadata }: { metadata: unknown }) {
  if (metadata == null || typeof metadata !== "object") return <span>—</span>;

  const pairs = Object.entries(metadata as Record<string, unknown>);
  if (pairs.length === 0) return <span>—</span>;

  return (
    <span>
      {pairs.map(([key, value]) => (
        <span key={key} className="mr-2.5 whitespace-nowrap">
          <span className="text-mut2">{key}</span> {String(value)}
        </span>
      ))}
    </span>
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

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "page") query.set(key, value);
  }
  query.set("page", String(page));

  return (
    <Link
      href={`/admin/logs?${query.toString()}`}
      className="font-semibold text-pri hover:underline"
    >
      {children}
    </Link>
  );
}
