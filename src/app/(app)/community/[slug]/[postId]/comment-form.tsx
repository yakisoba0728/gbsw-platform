"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { EMPTY_POST_STATE } from "../action-state";
import { createCommentAction } from "../actions";
import { AnonymousNote } from "../anonymous-note";

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
