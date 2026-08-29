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
      {/*
       * 동작은 **칩이 아니라 고르는 칸**이다. 감사로그의 동작은 스물일곱 가지이고
       * 앞으로도 는다 — 칩으로 늘어놓으면 넉 줄짜리 알약 벽이 되어, 표보다 필터가
       * 화면을 더 차지하고 그 안에서 원하는 하나를 눈으로 찾아야 한다.
       *
       * 기간은 넷뿐이고 늘 하나가 켜져 있어 세그먼티드로 남는다. 둘을 다른 모양으로
       * 두는 것이 이 줄의 요점이다: 왼쪽은 눈금, 오른쪽은 목록.
       */}
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <Label htmlFor="log-period">기간</Label>
          <Segmented id="log-period">
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
        </div>

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
