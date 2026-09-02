import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { requireAuth } from "@/core/auth/session";
import { getWritableBySlug } from "@/modules/community/board.service";
import { PostForm } from "../post-form";
import { postDraftKey } from "../post-draft";
import { orDenied } from "../../guard";

export const metadata: Metadata = { title: "글쓰기" };

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireAuth();
  const { slug } = await params;
  const community = await orDenied(getWritableBySlug(actor, slug));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href={`/community/${slug}`}>{community.name}</BackLink>
      <PostForm
        slug={slug}
        boardName={community.name}
        anonymous={community.anonymous}
        allowAttachments={community.allowAttachments}
        draftKey={postDraftKey(actor.id, slug)}
      />
    </div>
  );
}
