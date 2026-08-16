import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { listRules } from "@/modules/merit/rule.service";
import { RuleForm } from "./rule-form";
import { RuleTable } from "./rule-table";

export const metadata: Metadata = { title: "상벌점 규정" };

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:rule:manage");

  const raw = await searchParams;
  // 모르는 값은 교내로 떨어진다 — 화면이 비는 것보다 낫다.
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";

  const rules = await listRules(actor, track);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
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
      <RuleTable rules={rules} />
    </div>
  );
}
