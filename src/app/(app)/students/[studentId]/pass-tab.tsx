import Link from "next/link";
import { Suspense } from "react";
import { PassDetailCell } from "@/components/pass/pass-detail-cell";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonRows, SkeletonTabs } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { SessionUser } from "@/core/auth/session";
import {
  PASS_STATUS_LABELS,
  PASS_STATUSES,
  PASS_TYPE_LABELS,
  isPassStatus,
  isPassType,
  type PassStatus,
} from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import type { SearchParamsInput } from "@/lib/search-params";
import {
  countStudentPasses,
  listPassHistory,
} from "@/modules/pass/decision.service";
import { PASS_STATUS_TONES, passPeriod } from "@/modules/pass/pass.labels";
import { passHistoryQuerySchema } from "@/modules/pass/pass.schema";
import { studentHref } from "./student-tab";

type ResultPromise = ReturnType<typeof listPassHistory>;
type PassRow = Awaited<ResultPromise>["entries"][number];
type CountsPromise = ReturnType<typeof countStudentPasses>;
type Href = (patch: Record<string, string | null>) => string;

/**
 * 출입증 갈래 — 그 학생의 누적. 상태별 건수 한 줄과 목록이다.
 *
 * **기간을 안 자른다.** 전체 내역(`/pass/history`)의 기본 30일 창은 전교를
 * 훑지 않으려는 장치이고, 한 사람을 보는 자리에서는 그 창이 기록을 잘라 낸다
 * (`decision.service`의 `historyFilter`).
 *
 * **아무것도 await 하지 않는다** — 멈추면 상태 칩까지 뼈대가 된다.
 */
export function PassTab({
  actor,
  studentId,
  params,
}: {
  actor: SessionUser;
  studentId: string;
  params: SearchParamsInput;
}) {
  // 검증은 URL 경계에서 한 번만. 화면이 고를 수 있는 것(상태·쪽)만 읽고,
  // 학생은 주소창이 아니라 경로에서 온다 — 쿼리로 받으면 남의 학생이 섞인다.
  const parsed = passHistoryQuerySchema.safeParse({
    status: params.status,
    page: params.page,
    studentProfileId: studentId,
  });
  const query = parsed.success
    ? parsed.data
    : passHistoryQuerySchema.parse({ studentProfileId: studentId });

  const href: Href = (patch) => studentHref(studentId, params, { tab: "pass", ...patch });

  // 조회를 시작만 하고 약속을 나눠 기다린다 — 경계마다 다시 부르지 않는다.
  const resultPromise = listPassHistory(actor, query);
  const countsPromise = countStudentPasses(actor, studentId);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 경계는 자식이 다시 매달려도
  // 옛 내용을 그대로 보여준다 — 상태를 눌러도 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({
    status: query.status ?? null,
    page: query.page,
  });

  return (
    <div className="space-y-4">
      {/* 건수는 결과라 경계 안이다. 켜진 칩도 함께 바뀌므로 같은 key를 쓴다. */}
      <Suspense
        key={`filter:${boundaryKey}`}
        fallback={<SkeletonTabs count={6} size="sm" className="flex-wrap" />}
      >
        <StatusFilter promise={countsPromise} current={query.status} href={href} />
      </Suspense>

      <div className={cardClass("flush")}>
        <Suspense key={`rows:${boundaryKey}`} fallback={<SkeletonRows rows={8} />}>
          <PassRows promise={resultPromise} status={query.status} />
        </Suspense>

        {/* 쪽 넘기기는 다 읽은 뒤에 쓴다 — 위에 두면 목록보다 먼저 눈에 든다. */}
        <Suspense key={`pagination:${boundaryKey}`} fallback={null}>
          <PassPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * 상태별 건수 겸 필터. 숫자는 누적 전체라 상태를 골라도 안 흔들린다 —
 * 흔들리면 「승인됨 3」이 필터의 결과인지 그 학생의 사실인지 알 수 없다.
 */
async function StatusFilter({
  promise,
  current,
  href,
}: {
  promise: CountsPromise;
  current: PassStatus | undefined;
  href: Href;
}) {
  const { byStatus, total } = await promise;

  return (
    <FilterRow label="상태">
      <ChipLink href={href({ status: null, page: null })} active={!current} size="sm">
        전체 {total}
      </ChipLink>
      {PASS_STATUSES.map((status) => (
        <ChipLink
          key={status}
          href={href({ status, page: null })}
          active={current === status}
          size="sm"
        >
          {PASS_STATUS_LABELS[status]} {byStatus[status]}
        </ChipLink>
      ))}
    </FilterRow>
  );
}

async function PassPagination({
  promise,
  page,
  href,
}: {
  promise: ResultPromise;
  page: number;
  href: Href;
}) {
  const { pageCount } = await promise;

  return (
    <Pagination
      label="학생 출입증 내역 페이지"
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

/**
 * 학급·학생 열이 없다 — 누구의 기록인지는 화면 머리글이 이미 답했고, 표에 다시
 * 적으면 같은 값이 스무 줄 반복된다(전체 내역과 갈리는 유일한 지점이다).
 */
const COLUMNS: readonly Column<PassRow>[] = [
  {
    key: "type",
    header: "유형",
    width: "w-[64px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-caption text-mut">
        {isPassType(row.type) ? PASS_TYPE_LABELS[row.type] : row.type}
      </span>
    ),
  },
  {
    key: "status",
    header: "상태",
    // 「보호자 확인됨」이 한 줄에 서는 폭이다. 접히면 표 전체가 두꺼워진다.
    width: "w-[112px]",
    card: "trailing",
    cell: (row) =>
      isPassStatus(row.status) ? (
        <Badge tone={PASS_STATUS_TONES[row.status]}>
          {PASS_STATUS_LABELS[row.status]}
        </Badge>
      ) : (
        <span className="text-caption text-mut">{row.status}</span>
      ),
  },
  {
    key: "period",
    header: "기간",
    // 외박이 가장 길다 — 「26. 8. 26. 오전 12:00 ~ 26. 8. 28. 오전 12:00」.
    // 브라우저에서 재니 글자 237px + 셀 여백 24px = 261px이다. 주석이 예로 들던
    // 「오후 6:00」보다 「오전 12:00」이 길어, 192px도 216px도 모자랐다.
    width: "w-[264px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="block text-xs tabular-nums text-mut">{passPeriod(row)}</span>
    ),
  },
  {
    key: "detail",
    // 이 칸은 행선지만 담지 않는다 — 사유와 반려·취소 사유가 아래에 이어 선다.
    header: "행선지 · 사유",
    card: "title",
    cell: (row) => <PassDetailCell pass={row} />,
  },
  {
    key: "decided",
    header: "결재자",
    width: "w-[112px]",
    card: "meta",
    cardLabel: "결재",
    cell: (row) => {
      // 결재는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다.
      const name = row.decidedByName
        ? honorificName(row.decidedByName, "ADMIN")
        : "—";
      return (
        <TruncatedText full={name} className="text-xs text-mut">
          {name}
        </TruncatedText>
      );
    },
  },
  {
    key: "open",
    header: "상세",
    width: "w-[72px]",
    card: "actions",
    cell: (row) => (
      <Link
        href={`/pass/${row.id}`}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        보기
      </Link>
    ),
  },
];

/** 결과 목록. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function PassRows({
  promise,
  status,
}: {
  promise: ResultPromise;
  status: PassStatus | undefined;
}) {
  const { entries } = await promise;

  if (entries.length === 0) {
    return (
      <EmptyState variant="inside">
        {status
          ? `${PASS_STATUS_LABELS[status]} 기록이 없습니다.`
          : "출입증 기록이 없습니다."}
      </EmptyState>
    );
  }

  return (
    <DataTable
      minWidth={852}
      narrow="cards"
      // **fixed가 없으면 행선지 열이 안 잘린다.** table-layout이 auto면 셀 폭을
      // 내용이 정하므로 `truncate`가 기댈 확정 폭이 없다.
      fixed
      rows={entries}
      rowKey={(row) => row.id}
      columns={COLUMNS}
    />
  );
}
