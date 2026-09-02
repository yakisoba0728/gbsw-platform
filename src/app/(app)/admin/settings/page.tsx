import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { SectionCard } from "@/components/ui/section-card";
import { formatDateTime } from "@/lib/datetime";
import { listThresholdSettings } from "@/modules/merit/threshold.service";
import { ThresholdForm } from "./threshold-form";
import { honorificName } from "@/core/authz/roles";

export const metadata: Metadata = { title: "설정" };

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
            updatedAt={row.updatedAt?.toISOString() ?? null}
            updatedLabel={
              row.updatedAt
                ? `${row.updatedByName ? honorificName(row.updatedByName, "ADMIN") : "(알 수 없음)"} · ${formatDateTime(row.updatedAt)}`
                : null
            }
          />
        ))}
      </SectionCard>
    </div>
  );
}
