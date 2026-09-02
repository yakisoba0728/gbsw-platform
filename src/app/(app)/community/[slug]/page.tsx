import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { cardClass } from "@/components/ui/card";
import { requireAuth } from "@/core/auth/session";
import { parsePage } from "@/modules/community/community.schema";
import { listPostPage } from "@/modules/community/post.service";
import { PostList } from "./post-list";
import { orDenied } from "../guard";

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

  const view = await orDenied(listPostPage(actor, slug, parsePage(query.page)));

  return (
    <div className="mx-auto max-w-5xl">

      <PageHeader
        title={view.community.name}
        description={view.community.description ?? undefined}
        actions={
          view.canWrite ? (
            <Link href={`/community/${slug}/new`} className={buttonClass({ size: "sm" })}>
              글쓰기
            </Link>
          ) : undefined
        }
      />

      {view.community.anonymous && (
        <Note tone="warn" className="mb-4">
          익명 게시판입니다. 글과 댓글의 작성자가 화면에서 아무에게도 보이지 않습니다.
        </Note>
      )}

      <div className={cardClass("flush")}>
        {view.posts.length === 0 ? (
          <EmptyState
            variant="inside"
            action={
              view.canWrite ? (
                <Link
                  href={`/community/${slug}/new`}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  첫 글 쓰기
                </Link>
              ) : undefined
            }
          >
            아직 글이 없습니다.
          </EmptyState>
        ) : (
          <PostList
            slug={slug}
            posts={view.posts}
            anonymous={view.community.anonymous}
          />
        )}

        <Pagination
          page={view.page}
          pageCount={view.pageCount}
          href={(page) => `/community/${slug}?page=${page}`}
          label={`${view.community.name} 글 목록`}
        />
      </div>
    </div>
  );
}
