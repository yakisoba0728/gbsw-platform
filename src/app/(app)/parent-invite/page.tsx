import type { Metadata } from "next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { formatInviteCode } from "@/lib/invite-code";
import { listMyParentInvites } from "@/modules/invites/invite.service";
import { RevokeButton } from "@/app/(app)/admin/invites/revoke-button";
import { ParentInviteForm } from "./parent-invite-form";

export const metadata: Metadata = { title: "학부모 초대" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "대기", tone: "pending" },
  USED: { label: "가입 완료", tone: "approved" },
};

export default async function ParentInvitePage() {
  const actor = await requirePermission("invite:create:parent");

  // 관리자도 권한 검사는 통과하지만(모든 액션 허용) 학생 프로필이 없다.
  if (actor.role !== "STUDENT") {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-line bg-surface p-6">
        {/* 제목은 h2부터 시작한다 — h1은 상단바가 (app) 모든 화면에 이미 그린다. */}
        <h2 className="text-lg font-extrabold text-ink">학부모 초대</h2>
        <p className="mt-2 text-sm leading-relaxed text-mut">
          학부모 가입코드는 학생 본인만 만들 수 있습니다. 코드에 학생이 귀속되기
          때문에 대리 발급은 지원하지 않습니다.
        </p>
      </div>
    );
  }

  // 폐기한 코드는 보여주지 않는다 — 학생에게는 남길 이유가 없다.
  const invites = (await listMyParentInvites(actor)).filter(
    (invite) => invite.status !== "REVOKED",
  );

  return (
    <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[340px_1fr]">
      <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
        {/* 제목은 h2부터 시작한다 — h1은 상단바가 (app) 모든 화면에 이미 그린다. */}
        <h2 className="text-base font-extrabold text-ink">학부모 초대코드</h2>
        <p className="mt-1 mb-5 text-[13px] leading-relaxed text-mut">
          부모님이 이 코드로 가입하면 나와 연결됩니다.
        </p>
        <ParentInviteForm />
      </section>

      <SectionCard title="내가 만든 코드" flush className="min-w-0">
        {invites.length === 0 ? (
          <EmptyState variant="inside">아직 만든 코드가 없습니다.</EmptyState>
        ) : (
          <ul className="divide-y divide-line2">
            {invites.map((invite) => {
              const status = STATUS[invite.status] ?? {
                label: invite.status,
                tone: "neutral" as BadgeTone,
              };
              const meta = invite.metadata as { name?: string } | null;

              return (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                >
                  <span className="font-semibold text-ink">
                    {formatInviteCode(invite.code)}
                  </span>
                  <span className="text-sm text-mut">{meta?.name ?? "-"}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-[12px] text-mut">
                    {formatDate(invite.createdAt)}
                  </span>
                  {invite.status === "PENDING" && (
                    <span className="ml-auto">
                      <RevokeButton inviteId={invite.id} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
