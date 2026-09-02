"use client";

import Form from "next/form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASS_HISTORY_DEFAULT_DAYS, type PassHistoryQuery } from "@/modules/pass/pass.schema";

const PATH = "/pass/history";
const REVERSED_PERIOD_MESSAGE = "시작일은 종료일보다 늦을 수 없습니다.";

export function PeriodForm({
  query,
  serverError,
  initialFrom,
  initialTo,
}: {
  query: PassHistoryQuery;
  serverError: string | null;
  initialFrom?: string;
  initialTo?: string;
}) {
  const [from, setFrom] = useState(initialFrom ?? query.from ?? "");
  const [to, setTo] = useState(initialTo ?? query.to ?? "");
  const [dirty, setDirty] = useState(false);
  const reversed = from !== "" && to !== "" && from > to;
  const error = reversed ? REVERSED_PERIOD_MESSAGE : dirty ? null : serverError;

  return (
    <div className="space-y-1.5">
      <Form
        action={PATH}
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(event) => {
          if (reversed) event.preventDefault();
        }}
      >
        {query.type && <input type="hidden" name="type" value={query.type} />}
        {query.status && <input type="hidden" name="status" value={query.status} />}
        {query.q && <input type="hidden" name="q" value={query.q} />}

        <span className="w-40 shrink-0">
          <Input
            type="date"
            name="from"
            size="sm"
            value={from}
            max={to || undefined}
            aria-label="시작일"
            aria-invalid={reversed || undefined}
            aria-describedby={error ? "pass-history-period-error" : undefined}
            onChange={(event) => {
              setFrom(event.currentTarget.value);
              setDirty(true);
            }}
          />
        </span>
        <span className="text-mut2" aria-hidden>
          ~
        </span>
        <span className="w-40 shrink-0">
          <Input
            type="date"
            name="to"
            size="sm"
            value={to}
            min={from || undefined}
            aria-label="종료일"
            aria-invalid={reversed || undefined}
            aria-describedby={error ? "pass-history-period-error" : undefined}
            onChange={(event) => {
              setTo(event.currentTarget.value);
              setDirty(true);
            }}
          />
        </span>

        <Button type="submit" variant="secondary" size="sm" disabled={reversed}>
          적용
        </Button>

        {!from && !to && (
          <span className="text-xs text-mut">
            최근 {PASS_HISTORY_DEFAULT_DAYS}일
          </span>
        )}
      </Form>

      {error && (
        <p id="pass-history-period-error" role="alert" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
