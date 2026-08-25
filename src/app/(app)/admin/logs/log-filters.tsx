"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChipDivider } from "@/components/ui/filter-row";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/ui/search-form";
import { auditActionLabel } from "@/modules/audit-log/audit-log.labels";
import { AUDIT_PERIODS, type AuditPeriod } from "@/modules/audit-log/audit-log.schema";

const PERIOD_LABEL: Record<AuditPeriod, string> = {
  today: "오늘",
  "7d": "7일",
  "30d": "30일",
  all: "전체",
};

/** 필터는 URL 쿼리에 싣는다 — 새로고침·뒤로가기·링크 공유가 그대로 동작한다. */
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
    // 필터가 바뀌면 첫 페이지로 돌아간다.
    query.delete("page");
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    // 카드 머리글 안에 들어간다 — 여백·구분선은 머리글이 이미 갖고 있다.
    <>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {AUDIT_PERIODS.map((p) => (
          <Button
            key={p}
            variant="chip"
            size="sm"
            active={period === p}
            onClick={() => apply({ period: p })}
          >
            {PERIOD_LABEL[p]}
          </Button>
        ))}

        <ChipDivider />

        <Button
          variant="chip"
          size="sm"
          active={!action}
          onClick={() => apply({ action: "" })}
        >
          전체 동작
        </Button>
        {actions.map((a) => (
          <Button
            key={a}
            variant="chip"
            size="sm"
            active={action === a}
            onClick={() => apply({ action: a })}
          >
            {auditActionLabel(a)}
          </Button>
        ))}
      </div>

      {/* 검색은 GET으로 보낸다 — 지금 고른 기간·동작은 hidden으로 함께 실어야
          검색과 동시에 필터가 풀리지 않는다. */}
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
