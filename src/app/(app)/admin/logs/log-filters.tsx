"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [actorInput, setActorInput] = useState(actor);

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

        <span className="mx-1 h-4 w-px bg-line" aria-hidden />

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

      <form
        className="mt-2.5 flex gap-2"
        action={() => apply({ actor: actorInput })}
      >
        <Input
          dense
          name="actor"
          value={actorInput}
          onChange={(e) => setActorInput(e.currentTarget.value)}
          aria-label="행위자 이름 · 이메일 검색"
          placeholder="행위자 이름 · 이메일"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
          검색
        </Button>
      </form>
    </>
  );
}
