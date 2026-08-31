import type { Metadata } from "next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageScaffold } from "@/components/ui/page-scaffold";
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
    header: <span className="sr-only">작업</span>,
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
      <PageScaffold
        eyebrow="계정 연결"
        title="학부모 초대"
        description="학부모 가입코드는 학생 계정에서 만들 수 있습니다."
        width="compact"
      >
        <SectionCard variant="panel" title="이용 안내">
          <p className="text-caption text-mut">
            학부모 가입코드는 학생 본인만 만들 수 있습니다.
          </p>
        </SectionCard>
      </PageScaffold>
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
    <PageScaffold
      eyebrow="계정 연결"
      title="학부모 초대"
      description="가입코드를 만들어 보호자 계정을 내 학생 정보와 안전하게 연결합니다."
      width="standard"
    >
      <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 @3xl:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
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
              ariaLabel="내가 만든 학부모 초대코드"
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
    </PageScaffold>
  );
}
