import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
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

  if (slug !== view.community.slug) {
    redirect(`/community/${view.community.slug}/${postId}/edit`);
  }

  if (!view.post.canEdit || !view.canWrite) redirect("/forbidden");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href={`/community/${slug}/${postId}`}>글로 돌아가기</BackLink>
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
    </div>
  );
}
