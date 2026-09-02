import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { listForManage } from "@/modules/community/board.service";
import { CommunityForm } from "../community-form";
import { DeleteCommunity } from "./delete-community";

export const metadata: Metadata = { title: "게시판 설정" };

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const actor = await requirePermission("community:manage");
  const { communityId } = await params;

  const boards = await listForManage(actor);
  const board = boards.find((row) => row.id === communityId);
  if (!board) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <BackLink href="/admin/community">커뮤니티 관리</BackLink>

      {board.active ? (
        <>
          <CommunityForm
            board={{
              id: board.id,
              slug: board.slug,
              name: board.name,
              description: board.description,
              readRoles: board.readRoles,
              writeRoles: board.writeRoles,
              anonymous: board.anonymous,
              allowAttachments: board.allowAttachments,
              sortOrder: board.sortOrder,
              updatedAt: board.updatedAt.toISOString(),
            }}
          />

          <SectionCard variant="panel" tone="danger" title="게시판 제거">
            <p className="mb-4 text-sm text-mut">
              목록과 주소에서 사라집니다. 글은 DB에 남지만 아무도 볼 수 없게 되고,
              되살릴 수 없습니다.
            </p>
            <DeleteCommunity
              communityId={board.id}
              updatedAt={board.updatedAt.toISOString()}
              name={board.name}
            />
          </SectionCard>
        </>
      ) : (
        <Note tone="warn">
          제거된 게시판입니다. 설정을 바꿀 수 없고 되살릴 수도 없습니다.
        </Note>
      )}
    </div>
  );
}
