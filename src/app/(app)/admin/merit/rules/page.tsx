import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchForm } from "@/components/ui/search-form";
import { hrefWith } from "@/lib/search-params";
import { filterRules } from "@/components/merit/rule-filter";
import { TrackTabs } from "@/components/merit/track-tabs";
import { listRules } from "@/modules/merit/rule.service";
import { RuleForm } from "./rule-form";
import { RuleTable } from "./rule-table";

export const metadata: Metadata = { title: "상벌점 규정" };

const BASE_PATH = "/admin/merit/rules";

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:rule:manage");

  const raw = await searchParams;
  // 모르는 값은 교내로 떨어진다 — 화면이 비는 것보다 낫다.
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const q = typeof raw.q === "string" ? raw.q : "";
  const kind: MeritKind | null = isMeritKind(raw.kind) ? raw.kind : null;

  const all = await listRules(actor, track);

  /*
   * 걸러내기는 화면에서 한다. 교내 73줄 · 기숙사 수십 줄 규모라 서버 왕복을
   * 한 번 더 하는 값이 없고, repo의 정렬(종류 → 분류 → 점수)을 그대로 물려받는다.
   * 조건은 URL에 남는다 — 새로고침·뒤로가기·링크 공유가 전부 그대로 동작한다.
   */
  const rules = filterRules(all, q).filter((rule) => kind === null || rule.kind === kind);
  const filtering = q !== "" || kind !== null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/*
        트랙을 바꾸면 검색 조건은 버린다 — 규정 목록이 트랙별로 아예 달라서
        "교내에서 찾던 말"이 기숙사 탭에서 0건으로 남으면 빈 화면처럼 읽힌다.
        (그래서 hrefWith가 아니라 경로만 새로 쓴다.)
      */}
      <TrackTabs current={track} hrefFor={(t) => `${BASE_PATH}?track=${t}`} />

      <RuleForm track={track} />

      <section className="rounded-card border border-line bg-surface p-4">
        {/* GET 폼이라 검색 결과가 URL에 남는다 (/merit의 학생 검색과 같은 방식).
            지금 보고 있는 트랙·종류를 함께 실어 보내지 않으면 검색과 동시에
            필터가 풀린다. */}
        <SearchForm
          defaultValue={q}
          placeholder="항목명 또는 분류로 검색"
          ariaLabel="규정 항목명 또는 분류 검색"
          hidden={{ track, kind }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold text-mut">종류</span>
          <ChipLink
            href={hrefWith(BASE_PATH, raw, { kind: null })}
            active={kind === null}
            size="sm"
          >
            전체
          </ChipLink>
          {MERIT_KINDS.map((k) => (
            <ChipLink
              key={k}
              href={hrefWith(BASE_PATH, raw, { kind: k })}
              active={kind === k}
              size="sm"
            >
              {MERIT_KIND_LABELS[k]}
            </ChipLink>
          ))}
        </div>

        <p className="mt-3 text-[12px] text-mut">
          {filtering
            ? `${all.length}개 중 ${rules.length}개`
            : `${all.length}개`}
          {filtering && (
            <>
              {" · "}
              <Link
                href={`/admin/merit/rules?track=${track}`}
                className="font-semibold text-pri hover:underline"
              >
                조건 지우기
              </Link>
            </>
          )}
        </p>
      </section>

      {filtering && rules.length === 0 ? (
        <EmptyState>조건에 맞는 규정이 없습니다.</EmptyState>
      ) : (
        <RuleTable rules={rules} />
      )}
    </div>
  );
}
