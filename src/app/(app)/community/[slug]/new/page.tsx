import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { requireAuth } from "@/core/auth/session";
import { getWritableBySlug } from "@/modules/community/board.service";
import { PostForm } from "../post-form";
import { orDenied } from "../../guard";

export const metadata: Metadata = { title: "글쓰기" };

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireAuth();
  const { slug } = await params;
  // 쓰기 권한이 없으면 여기서 403으로 막힌다. 서버 액션이 다시 검사한다.
  const community = await orDenied(getWritableBySlug(actor, slug));

  return (
    <PageScaffold
      eyebrow={<BackLink href={`/community/${slug}`}>{community.name}으로 돌아가기</BackLink>}
      title="새 글 쓰기"
      description={community.anonymous ? "작성자 정보가 화면에 공개되지 않는 게시판입니다." : `${community.name} 구성원에게 새 글을 공유합니다.`}
      width="form"
    >
      <PostForm
        slug={slug}
        boardName={community.name}
        anonymous={community.anonymous}
        allowAttachments={community.allowAttachments}
      />
    </PageScaffold>
  );
}
