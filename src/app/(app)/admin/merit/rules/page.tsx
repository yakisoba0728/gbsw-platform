import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { filterRules } from "@/components/merit/rule-filter";
import { listRules } from "@/modules/merit/rule.service";
import { RuleForm } from "./rule-form";
import { RuleTable } from "./rule-table";

export const metadata: Metadata = { title: "상벌점 규정" };

type Params = Record<string, string | string[] | undefined>;

/**
 * 지금 쿼리를 유지한 채 일부만 바꾼 주소. 종류 칩이 검색어·트랙을 잃지 않게 한다.
 * (/merit의 hrefWith와 같은 방식)
 */
function hrefWith(params: Params, patch: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/admin/merit/rules?${qs}` : "/admin/merit/rules";
}

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
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            // 트랙을 바꾸면 검색 조건은 버린다 — 규정 목록이 트랙별로 아예 달라서
            // "교내에서 찾던 말"이 기숙사 탭에서 0건으로 남으면 빈 화면처럼 읽힌다.
            href={`/admin/merit/rules?track=${t}`}
            className={
              t === track
                ? "rounded-full bg-pri px-4 py-2 text-[13px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {MERIT_TRACK_LABELS[t]}
          </Link>
        ))}
      </div>

      <RuleForm track={track} />

      <section className="rounded-card border border-line bg-surface p-4">
        {/* GET 폼이라 검색 결과가 URL에 남는다 (/merit의 학생 검색과 같은 방식) */}
        <form method="get" className="flex gap-2">
          <input type="hidden" name="track" value={track} />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="항목명 또는 분류로 검색"
            className="flex-1 rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-btn bg-pri px-4 py-2.5 text-[13px] font-bold text-white"
          >
            검색
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] font-semibold text-mut">종류</span>
          <KindChip
            href={hrefWith(raw, { kind: null })}
            label="전체"
            selected={kind === null}
          />
          {MERIT_KINDS.map((k) => (
            <KindChip
              key={k}
              href={hrefWith(raw, { kind: k })}
              label={MERIT_KIND_LABELS[k]}
              selected={kind === k}
            />
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
        <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
          조건에 맞는 규정이 없습니다.
        </div>
      ) : (
        <RuleTable rules={rules} />
      )}
    </div>
  );
}

function KindChip({
  href,
  label,
  selected,
}: {
  href: string;
  label: string;
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        selected
          ? "rounded-full bg-pri px-3.5 py-1.5 text-[12.5px] font-bold text-white"
          : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-mut hover:border-pri hover:text-pri"
      }
    >
      {label}
    </Link>
  );
}
