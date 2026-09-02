"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { EMPTY_POST_STATE } from "../action-state";
import { createCommentAction } from "../actions";
import { AnonymousNote } from "../anonymous-note";

/**
 * 댓글 쓰기. **확인 모달을 달지 않는다** — 되돌릴 수 있고 가장 자주 하는 동작이다.
 *
 * 익명 게시판이면 글쓰기 화면과 같은 고지를 세운다 — 댓글도 감사로그에 작성자가
 * 남는데, 목록을 거치지 않고 들어온 학생은 그 사실을 어디서도 못 본다.
 */
export function CommentForm({
  postId,
  anonymous,
}: {
  postId: string;
  anonymous: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createCommentAction,
    EMPTY_POST_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // 성공하면 칸을 비운다. React 19가 폼을 리셋하지만 defaultValue를 안 쓰므로
  // 여기서 명시적으로 비워야 다음 댓글을 바로 칠 수 있다.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 px-5 py-4">
      <input type="hidden" name="postId" value={postId} />
      {anonymous && <AnonymousNote kind="댓글" />}
      <Textarea
        name="body"
        defaultValue={state.values?.body}
        required
        rows={3}
        maxLength={2000}
        aria-label="댓글 내용"
        placeholder="댓글을 입력하세요"
      />
      {state.error && <Note tone="error">{state.error}</Note>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "다는 중…" : "댓글 달기"}
      </Button>
    </form>
  );
}
