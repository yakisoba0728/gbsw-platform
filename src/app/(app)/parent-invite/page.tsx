import type { Metadata } from "next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { formatInviteCode } from "@/lib/invite-code";
import { listMyParentInvites } from "@/modules/invites/invite.service";
import { RevokeButton } from "@/app/(app)/admin/invites/revoke-button";
import { ParentInviteForm } from "./parent-invite-form";
import { honorificName } from "@/core/authz/roles";

export const metadata: Metadata = { title: "학부모 초대" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "대기", tone: "pending" },
  USED: { label: "가입 완료", tone: "approved" },
};

type MyInvite = {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
};

const COLUMNS: readonly Column<MyInvite>[] = [
  {
    key: "code",
    header: "코드",
    card: "title",
    cell: (row) => (
      <span className="font-mono text-sm font-medium text-ink">{row.code}</span>
    ),
  },
  {
    key: "name",
    header: "학부모",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-mut">{honorificName(row.name, "PARENT")}</span>
    ),
  },
  {
    key: "status",
    header: "상태",
    card: "trailing",
    cell: (row) => {
      const status = STATUS[row.status] ?? {
        label: row.status,
        tone: "neutral" as BadgeTone,
      };
      return <Badge tone={status.tone}>{status.label}</Badge>;
    },
  },
  {
    key: "createdAt",
    header: "만든 날",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-xs whitespace-nowrap tabular-nums text-mut">
        {row.createdAt}
      </span>
    ),
  },
  {
    key: "revoke",
    // 폐기 버튼 열 — 머리글에 이름이 없다.
    header: "",
    card: "actions",
    cell: (row) =>
      row.status === "PENDING" ? (
        <div className="flex justify-end">
          <RevokeButton inviteId={row.id} />
        </div>
      ) : null,
  },
];

export default async function ParentInvitePage() {
  const actor = await requirePermission("invite:create:parent");

  // 교사도 권한 검사는 통과하지만 학생 프로필이 없다.
  if (actor.role !== "STUDENT") {
    return (
      <div className="mx-auto max-w-xl">
        {/* 제목은 h2부터 — h1은 상단바가 이미 그린다. */}
        <SectionCard variant="panel" title="학부모 초대">
          <p className="text-caption text-mut">
            학부모 가입코드는 학생 본인만 만들 수 있습니다.
          </p>
        </SectionCard>
      </div>
    );
  }

  // 폐기한 코드는 보여주지 않는다.
  const invites = (await listMyParentInvites(actor))
    .filter((invite) => invite.status !== "REVOKED")
    .map((invite) => ({
      id: invite.id,
      code: formatInviteCode(invite.code),
      name: (invite.metadata as { name?: string } | null)?.name ?? "-",
      status: invite.status,
      createdAt: formatDate(invite.createdAt),
    }));

  return (
    // 두 단이 서는 기준은 뷰포트가 아니라 이 자리의 폭이다.
    <div className="@container mx-auto max-w-4xl">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[340px_1fr]">
        <SectionCard
          variant="panel"
          title="가입코드 만들기"
          hint="이 코드로 가입한 학부모는 나와 연결됩니다."
        >
          <ParentInviteForm />
        </SectionCard>

        <SectionCard title="내가 만든 코드" flush className="min-w-0">
          {invites.length === 0 ? (
            <EmptyState variant="inside">만든 코드가 없습니다.</EmptyState>
          ) : (
            <DataTable
              minWidth={520}
              rows={invites}
              rowKey={(row) => row.id}
              columns={COLUMNS}
              narrow="cards"
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
