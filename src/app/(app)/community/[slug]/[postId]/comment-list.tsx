import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/datetime";
import type { CommentView } from "@/modules/community/community.view";
import { DeleteComment } from "./delete-comment";

/**
 * 댓글 목록. 표가 아니라 `<ul>`이다 — 댓글은 열이 없다.
 *
 * **익명 게시판에서 작성자 자리는 「익명」이다.** 글 목록에서는 그 열을 통째로
 * 뺐지만(같은 말이 스무 줄 늘어서므로) 여기서는 자리가 비면 누가 말했는지가
 * 아니라 말이 몇 개인지도 안 읽힌다.
 */
export function CommentList({ comments }: { comments: readonly CommentView[] }) {
  if (comments.length === 0) {
    return <EmptyState variant="inside">아직 댓글이 없습니다.</EmptyState>;
  }

  return (
    <ul>
      {comments.map((comment) => (
        <li
          key={comment.id}
          className="border-b border-line2 px-5 py-3 last:border-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-ink">
                {comment.author?.display ?? "익명"}
              </span>
              {comment.byPostAuthor && <Badge tone="info">글쓴이</Badge>}
              <span className="text-caption text-mut">
                {formatDateTime(comment.createdAt)}
              </span>
            </span>

            {comment.canDelete && (
              <DeleteComment
                commentId={comment.id}
                byModerator={!comment.isMine}
              />
            )}
          </div>

          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
        </li>
      ))}
    </ul>
  );
}
