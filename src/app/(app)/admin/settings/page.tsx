import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { SectionCard } from "@/components/ui/section-card";
import { formatDateTime } from "@/lib/datetime";
import { listThresholdSettings } from "@/modules/merit/threshold.service";
import { ThresholdForm } from "./threshold-form";

export const metadata: Metadata = { title: "설정" };

/**
 * 학교 전체에 한 번에 적용되는 값을 모아 두는 화면.
 *
 * **지금은 벌점 기준 하나뿐이다.** 설정이 하나라고 화면을 만들지 않으면 그
 * 값은 코드 상수로 남고, 학칙이 바뀔 때마다 배포가 필요해진다 — 이 화면이
 * 있는 이유가 그것이다.
 *
 * 나중에 붙을 자리도 여기다: 학년당 반 수, 초대코드 만료 기본값, 문자 발송
 * 사용 여부처럼 "학교마다 다르고 자주 안 바뀌는" 값들. 하나가 늘 때마다
 * SectionCard를 하나 더 얹고, 세 개를 넘어가면 그때 좌측 하위 메뉴로 나눈다
 * (지금 나누면 카드 하나짜리 목차가 된다).
 *
 * 학년도 관리(/admin/students의 학년도 전환)는 여기로 옮기지 않는다 — 그쪽은
 * 명단 작업의 한복판에서 쓰는 조작이라 명단 화면에 있어야 한다.
 */
export default async function SettingsPage() {
  const actor = await requirePermission("merit:threshold:manage");

  const thresholds = await listThresholdSettings(actor);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionCard
        flush
        title="벌점 기준"
        hint="벌점이 몇 점부터 눈에 띄게 표시될지 정합니다. 교내와 기숙사가 각각 다를 수 있습니다."
        controls={
          <p className="mt-1 text-[12px] text-mut">
            <strong className="font-bold">보여주기만 합니다</strong> — 기준을 넘어도
            회부·통보·퇴사 같은 처리는 자동으로 일어나지 않습니다. 바꾸면{" "}
            <Link
              href="/merit/stats"
              className="font-semibold text-pri hover:underline"
            >
              통계
            </Link>
            의 &ldquo;기준 초과 학생&rdquo; 명단과 반 명단의 강조가 곧바로 달라집니다.
            이미 부여된 점수는 건드리지 않습니다.
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
