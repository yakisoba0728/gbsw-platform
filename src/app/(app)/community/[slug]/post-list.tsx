import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";
import type { PostListItemView } from "@/modules/community/community.view";

/**
 * 글 목록. **익명 게시판이면 작성자 열을 아예 뺀다** — 「익명」이 스무 줄
 * 늘어서는 것은 정보가 아니다. 그 사실은 게시판 이름 아래의 안내 한 줄이 말한다.
 */
function columns(slug: string, anonymous: boolean): Column<PostListItemView>[] {
  const cols: Column<PostListItemView>[] = [
    {
      key: "title",
      header: "제목",
      card: "title",
      cell: (post) => (
        <span className="flex items-baseline gap-1.5">
          <Link
            href={`/community/${slug}/${post.id}`}
            className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {post.title}
          </Link>
          {post.commentCount > 0 && (
            <span className="text-caption text-mut">[{post.commentCount}]</span>
          )}
        </span>
      ),
    },
  ];

  if (!anonymous) {
    cols.push({
      key: "author",
      header: "작성자",
      card: "meta",
      width: "w-40",
      cell: (post) => post.author?.display ?? "—",
    });
  }

  cols.push({
    key: "createdAt",
    header: "작성일",
    card: "meta",
    width: "w-32",
    cell: (post) => formatDate(post.createdAt),
  });

  return cols;
}

export function PostList({
  slug,
  posts,
  anonymous,
}: {
  slug: string;
  posts: readonly PostListItemView[];
  anonymous: boolean;
}) {
  return (
    <DataTable
      ariaLabel="게시글 목록"
      minWidth={anonymous ? 480 : 640}
      rows={posts}
      rowKey={(post) => post.id}
      columns={columns(slug, anonymous)}
      narrow="cards"
    />
  );
}
