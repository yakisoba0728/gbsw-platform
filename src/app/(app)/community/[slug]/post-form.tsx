"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { MAX_ATTACHMENTS_PER_POST } from "@/modules/community/community.schema";
import { EMPTY_POST_STATE } from "./action-state";
import { createPostAction, updatePostAction } from "./actions";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";

export type EditingPost = {
  id: string;
  title: string;
  body: string;
  /** ISO 문자열. 낙관적 잠금에 실어 보낸다. */
  updatedAt: string;
  attachments: PickedAttachment[];
};

/**
 * 글쓰기·수정 폼. **확인 모달을 달지 않는다** — 되돌릴 수 있고(수정·삭제)
 * 게시판에서 가장 자주 하는 동작이라, 한 번 더 누르게 하면 그 자리가 안 쓰인다.
 */
export function PostForm({
  slug,
  boardName,
  anonymous,
  allowAttachments,
  post,
}: {
  slug: string;
  boardName: string;
  anonymous: boolean;
  allowAttachments: boolean;
  post?: EditingPost;
}) {
  const editing = post !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updatePostAction : createPostAction,
    EMPTY_POST_STATE,
  );

  // React 19가 액션이 끝난 폼을 리셋하므로, 실패가 실어 온 제출값을
  // defaultValue로 내려 두면 리셋이 그 값으로 되돌아간다.
  const v = state.values;

  return (
    <SectionCard
      variant="panel"
      title={editing ? "게시글 내용 수정" : "게시글 내용"}
      hint={editing ? boardName : `${boardName} 게시판`}
    >
      {anonymous && (
        <Note tone="warn" className="mb-4">
          이 게시판의 글은 작성자가 화면에 보이지 않습니다. 다만 학교는 감사 기록으로
          작성자를 확인할 수 있습니다.
        </Note>
      )}

      <form action={formAction} className="space-y-3">
        {editing ? (
          <>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="updatedAt" value={post.updatedAt} />
          </>
        ) : (
          <input type="hidden" name="slug" value={slug} />
        )}

        <div>
          <Label htmlFor="pf-title">제목</Label>
          <Input
            id="pf-title"
            name="title"
            required
            maxLength={200}
            defaultValue={v?.title ?? post?.title ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="pf-body">내용</Label>
          <Textarea
            id="pf-body"
            name="body"
            required
            rows={12}
            maxLength={20000}
            defaultValue={v?.body ?? post?.body ?? ""}
            aria-describedby="pf-body-hint"
          />
          <p id="pf-body-hint" className="mt-1 text-caption text-mut">
            마크다운을 쓸 수 있습니다 — **굵게**, *기울임*, # 제목, - 목록, &gt; 인용,
            [글자](주소), 표, `코드`.
          </p>
        </div>

        {allowAttachments && (
          <div>
            <Label htmlFor="pf-files">첨부파일</Label>
            <AttachmentPicker
              slug={slug}
              initial={post?.attachments ?? []}
              max={MAX_ATTACHMENTS_PER_POST}
            />
          </div>
        )}

        {state.error && <Note tone="error">{state.error}</Note>}

        <Button type="submit" disabled={pending}>
          {pending ? "저장하는 중…" : editing ? "저장" : "올리기"}
        </Button>
      </form>
    </SectionCard>
  );
}
