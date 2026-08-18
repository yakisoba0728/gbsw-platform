import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { SectionCard } from "@/components/ui/section-card";
import { formatDateTime } from "@/lib/datetime";
import { listThresholdSettings } from "@/modules/merit/threshold.service";
import { ThresholdForm } from "./threshold-form";

export const metadata: Metadata = { title: "설정" };

/**
 * 학교 전체에 한 번에 적용되는 값. 지금은 벌점 기준 하나뿐이며, 설정이 늘면
 * SectionCard를 하나씩 얹는다. 학년도 전환은 명단 작업의 일부라 여기 두지 않는다.
 */
export default async function SettingsPage() {
  const actor = await requirePermission("merit:threshold:manage");

  const thresholds = await listThresholdSettings(actor);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard
        flush
        title="벌점 기준"
        hint="벌점이 몇 점부터 눈에 띄게 보일지 정합니다."
        controls={
          <p className="mt-1 text-caption text-mut">
            <strong className="font-medium">보여주기만 합니다</strong> — 기준을 넘어도
            회부·통보 같은 처리는 자동으로 일어나지 않습니다.
          </p>
        }
      >
        {thresholds.map((row) => (
          <ThresholdForm
            key={row.track}
            track={row.track}
            warn={row.warn}
            danger={row.danger}
            configured={row.configured}
            // 날짜 문자열은 서버에서 만든다 — 클라이언트에서 만들면 SSR이 그린
            // 값과 어긋나 하이드레이션이 깨진다.
            updatedLabel={
              row.updatedAt
                ? `${row.updatedByName ?? "(알 수 없음)"} · ${formatDateTime(row.updatedAt)}`
                : null
            }
          />
        ))}
      </SectionCard>
    </div>
  );
}
