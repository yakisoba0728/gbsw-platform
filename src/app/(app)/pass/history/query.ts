import { isCanonicalDateInput } from "@/lib/date-input";
import type { SearchParamsInput } from "@/lib/search-params";
import {
  passHistoryQuerySchema,
  type PassHistoryQuery,
} from "@/modules/pass/pass.schema";

type HistoryField = "type" | "status" | "q" | "from" | "to" | "page";

const DEFAULT_QUERY = passHistoryQuerySchema.parse({});

/**
 * URL의 한 필드만 검증한다. 한 필드가 잘못됐다고 이미 유효한 다른 조건까지
 * 기본값으로 되돌리면, 기간 오류를 고친 뒤 사용자가 유형·상태·검색어를 다시
 * 골라야 한다. 잘못된 필드만 기본값으로 내리고 나머지는 그대로 살린다.
 */
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

/**
 * 전체 내역 페이지의 URL 경계.
 *
 * 날짜 두 칸은 각각 형식을 검증한 뒤 관계도 함께 검증한다. 시작일이 종료일보다
 * 늦더라도 다른 필터는 유효하므로 유지하고, 조회와 내보내기만 `periodError`로
 * 멈춘다. 날짜 입력값도 그대로 돌려줘 사용자가 틀린 한 칸만 고칠 수 있게 한다.
 */
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
