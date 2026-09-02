import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PlainText } from "@/components/ui/plain-text";
import { formatDateTime } from "@/lib/datetime";
import type { CommentView } from "@/modules/community/community.view";
import { DeleteContent } from "./delete-content";

export function CommentList({ comments }: { comments: readonly CommentView[] }) {
  if (comments.length === 0) {
    return <EmptyState variant="inside">아직 댓글이 없습니다.</EmptyState>;
  }

  return (
    <ul>
      {comments.map((comment, index) => (
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
              <DeleteContent
                kind="comment"
                id={comment.id}
                byModerator={!comment.isMine}
                accessibleName={`${index + 1}번째 댓글 삭제`}
              />
            )}
          </div>

          <PlainText className="mt-1 text-sm text-ink">{comment.body}</PlainText>
        </li>
      ))}
    </ul>
  );
}
