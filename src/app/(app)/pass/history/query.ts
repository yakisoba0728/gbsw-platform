import { isCanonicalDateInput } from "@/lib/date-input";
import type { SearchParamsInput } from "@/lib/search-params";
import {
  passHistoryQuerySchema,
  type PassHistoryQuery,
} from "@/modules/pass/pass.schema";

type HistoryField = "type" | "status" | "q" | "from" | "to" | "page";

const DEFAULT_QUERY = passHistoryQuerySchema.parse({});

function parseField<Key extends HistoryField>(
  key: Key,
  value: SearchParamsInput[string],
): PassHistoryQuery[Key] {
  const parsed = passHistoryQuerySchema.safeParse({ [key]: value });
  return parsed.success ? parsed.data[key] : DEFAULT_QUERY[key];
}

export type ParsedHistoryPageParams = {
  query: PassHistoryQuery;
  periodError: string | null;
  initialFrom?: string;
  initialTo?: string;
};

export function parseHistoryPageParams(
  raw: SearchParamsInput,
): ParsedHistoryPageParams {
  const from = parseField("from", raw.from);
  const to = parseField("to", raw.to);
  const period = passHistoryQuerySchema.safeParse({ from: raw.from, to: raw.to });
  const periodError = period.success
    ? null
    : (period.error.issues.find(
        (issue) => issue.path[0] === "from" || issue.path[0] === "to",
      )?.message ?? null);

  const rawFrom = typeof raw.from === "string" ? raw.from : "";
  const rawTo = typeof raw.to === "string" ? raw.to : "";

  return {
    query: {
      type: parseField("type", raw.type),
      status: parseField("status", raw.status),
      q: parseField("q", raw.q),
      from,
      to,
      page: parseField("page", raw.page),
    },
    periodError,
    initialFrom: isCanonicalDateInput(rawFrom) ? rawFrom : undefined,
    initialTo: isCanonicalDateInput(rawTo) ? rawTo : undefined,
  };
}
