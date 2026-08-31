import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { PageScaffold } from "@/components/ui/page-scaffold";
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

  // 권한 거부는 403, 없는 게시판은 404로 간다 — 둘을 한 화면에 섞지 않는다.
  const view = await orDenied(listPostPage(actor, slug, parsePage(query.page)));

  return (
    <PageScaffold
        eyebrow="커뮤니티 게시판"
        title={view.community.name}
        description={view.community.description ?? undefined}
        width="data"
        actions={
          view.canWrite ? (
            <Link href={`/community/${slug}/new`} className={buttonClass()}>
              새 글 쓰기
            </Link>
          ) : undefined
        }
      >

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

        {/* 쪽 넘기기는 표를 담은 카드의 바닥 띠다(Pagination의 규격). 예전에는
            카드 밖에 서 있어서 어느 목록의 쪽인지 테두리가 말해 주지 않았다. */}
        <Pagination
          page={view.page}
          pageCount={view.pageCount}
          href={(page) => `/community/${slug}?page=${page}`}
          label={`${view.community.name} 글 목록`}
        />
      </div>
    </PageScaffold>
  );
}
