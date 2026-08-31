import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { requireAuth } from "@/core/auth/session";
import { getPost } from "@/modules/community/post.service";
import { PostForm } from "../../post-form";
import { orDenied } from "../../../guard";

export const metadata: Metadata = { title: "글 수정" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const actor = await requireAuth();
  const { slug, postId } = await params;

  const view = await orDenied(getPost(actor, postId));

  // 주소의 게시판과 글의 게시판이 다르면 정규 주소로 보낸다 — 첨부 고르개가
  // 이 slug로 파일을 올리므로, 어긋난 채로 두면 게시판의 첨부 설정을 우회하는
  // 길이 된다.
  if (slug !== view.community.slug) {
    redirect(`/community/${view.community.slug}/${postId}/edit`);
  }

  // 본인만 고친다 — 교사도 남의 글은 못 고친다. 서버 액션이 다시 검사한다.
  // `forbidden()`은 authInterrupts를 안 켜서 못 쓴다 (requireAuth와 같은 방식).
  if (!view.post.canEdit) redirect("/forbidden");

  return (
    <PageScaffold
      eyebrow={<BackLink href={`/community/${slug}/${postId}`}>글로 돌아가기</BackLink>}
      title="글 수정"
      description={`${view.community.name}에 올린 글의 내용과 첨부파일을 수정합니다.`}
      width="form"
    >
      <PostForm
        slug={slug}
        boardName={view.community.name}
        anonymous={view.community.anonymous}
        allowAttachments={view.community.allowAttachments}
        post={{
          id: view.post.id,
          title: view.post.title,
          body: view.post.body,
          updatedAt: view.post.updatedAt.toISOString(),
          attachments: view.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
          })),
        }}
      />
    </PageScaffold>
  );
}
