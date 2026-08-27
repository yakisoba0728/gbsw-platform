import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { parsePage } from "@/modules/community/community.schema";
import { listPostPage } from "@/modules/community/post.service";
import { PostList } from "./post-list";

export const metadata: Metadata = { title: "게시판" };

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const { slug } = await params;
  const query = await searchParams;

  // 권한 거부·없는 게시판은 서비스가 던지고 error.tsx가 받는다.
  const view = await listPostPage(actor, slug, parsePage(query.page));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {view.community.anonymous && (
        <Note tone="warn">
          익명 게시판입니다. 글과 댓글의 작성자가 화면에서 아무에게도 보이지 않습니다.
        </Note>
      )}

      <SectionCard
        title={view.community.name}
        hint={view.community.description ?? undefined}
        aside={
          view.canWrite ? (
            <Link
              href={`/community/${slug}/new`}
              className={buttonClass({ size: "sm" })}
            >
              글쓰기
            </Link>
          ) : (
            <span className="text-xs text-mut">{view.total}개</span>
          )
        }
        flush
      >
        {view.posts.length === 0 ? (
          <EmptyState variant="inside">아직 글이 없습니다.</EmptyState>
        ) : (
          <PostList
            slug={slug}
            posts={view.posts}
            anonymous={view.community.anonymous}
          />
        )}
      </SectionCard>

      <Pagination
        page={view.page}
        pageCount={view.pageCount}
        href={(page) => `/community/${slug}?page=${page}`}
        label={`${view.community.name} 글 목록`}
      />
    </div>
  );
}
