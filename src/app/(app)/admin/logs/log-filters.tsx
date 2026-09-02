"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/input";
import { Segmented, SegmentButton } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SearchForm } from "@/components/ui/search-form";
import { auditActionLabel } from "@/modules/audit-log/audit-log.labels";
import { AUDIT_PERIODS, type AuditPeriod } from "@/modules/audit-log/audit-log.schema";

const PERIOD_LABEL: Record<AuditPeriod, string> = {
  today: "오늘",
  "7d": "7일",
  "30d": "30일",
  all: "전체",
};

export function LogFilters({
  actions,
  period,
  action,
  actor,
}: {
  actions: string[];
  period: AuditPeriod;
  action: string;
  actor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 block text-caption font-medium text-ink">
            기간
          </legend>
          <Segmented>
            {AUDIT_PERIODS.map((p) => (
              <SegmentButton
                key={p}
                active={period === p}
                onClick={() => apply({ period: p })}
              >
                {PERIOD_LABEL[p]}
              </SegmentButton>
            ))}
          </Segmented>
        </fieldset>

        <div className="min-w-52">
          <Label htmlFor="log-action">동작</Label>
          <Select
            id="log-action"
            size="sm"
            value={action}
            onChange={(event) => apply({ action: event.target.value })}
          >
            <option value="">전체 동작</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {auditActionLabel(a)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <SearchForm
        action="/admin/logs"
        name="actor"
        defaultValue={actor}
        placeholder="행위자 이름 · 이메일"
        ariaLabel="행위자 이름 · 이메일 검색"
        hidden={{ period, action: action || null }}
        className="mt-2.5 flex gap-2"
      />
    </>
  );
}
