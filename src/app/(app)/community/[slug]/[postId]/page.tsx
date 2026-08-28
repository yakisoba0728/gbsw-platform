import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { orDenied } from "../../guard";
import { formatDateTime } from "@/lib/datetime";
import { listComments } from "@/modules/community/comment.service";
import { getPost } from "@/modules/community/post.service";
import { AttachmentList } from "./attachment-list";
import { CommentForm } from "./comment-form";
import { CommentList } from "./comment-list";
import { DeletePost } from "./delete-post";

export const metadata: Metadata = { title: "글" };

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const actor = await requireAuth();
  const { slug, postId } = await params;

  const [view, comments] = await orDenied(
    Promise.all([getPost(actor, postId), listComments(actor, postId)]),
  );

  // **주소의 게시판과 글의 게시판이 다르면 정규 주소로 보낸다.** 안 그러면
  // 뒤로가기·「수정」 링크가 엉뚱한 게시판을 가리키고, 첨부 고르개가 그 slug로
  // 파일을 올려 게시판 설정(첨부 허용 여부)을 우회하는 길이 생긴다.
  if (slug !== view.community.slug) {
    redirect(`/community/${view.community.slug}/${postId}`);
  }

  const { post } = view;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href={`/community/${slug}`}>{view.community.name}</BackLink>

      {/* 제목 앞뒤로 다른 것이 오는 카드라 SectionCard로는 표현할 수 없다. */}
      <article className={cardClass("page")}>
        <h2 className="text-xl font-semibold text-ink">{post.title}</h2>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-mut">
            {post.author?.display ?? "익명"}
            {" · "}
            {formatDateTime(post.createdAt)}
            {post.updatedAt.getTime() !== post.createdAt.getTime() && " · 수정됨"}
          </p>

          <span className="flex gap-1">
            {post.canEdit && (
              <Link
                href={`/community/${slug}/${postId}/edit`}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                수정
              </Link>
            )}
            {post.canDelete && (
              <DeletePost postId={postId} byModerator={!post.isMine} />
            )}
          </span>
        </div>

        {/* 마크다운. 날 HTML은 파싱하지 않고 허용 목록으로 한 번 더 거른다. */}
        <Markdown className="mt-5 text-ink">{post.body}</Markdown>

        <AttachmentList attachments={view.attachments} />
      </article>

      <SectionCard
        title="댓글"
        aside={<span className="text-xs text-mut">{comments.length}개</span>}
        flush
      >
        <CommentList comments={comments} />
        {view.canWrite && <CommentForm postId={postId} />}
      </SectionCard>
    </div>
  );
}
