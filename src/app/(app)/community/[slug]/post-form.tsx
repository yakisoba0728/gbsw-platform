"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { MAX_ATTACHMENTS_PER_POST } from "@/modules/community/community.schema";
import { EMPTY_POST_STATE } from "./action-state";
import { createPostAction, updatePostAction } from "./actions";
import { AnonymousNote } from "./anonymous-note";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import {
  createPostDraftNonce,
  parsePostDraft,
  postDraftForRestore,
  postDraftIsNewerThanSubmission,
  postDraftNonceAfterSubmission,
  serializePostDraft,
  type PostDraft,
} from "./post-draft";

type DraftValues = Pick<PostDraft, "title" | "body" | "nonce">;

function storeDraft(key: string, values: DraftValues) {
  try {
    if (!values.title && !values.body) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, serializePostDraft(values));
  } catch {
    // 저장소가 막혀도 글쓰기는 계속한다.
  }
}

type EditingPost = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  attachments: PickedAttachment[];
};

export function PostForm({
  slug,
  boardName,
  anonymous,
  allowAttachments,
  draftKey,
  post,
}: {
  slug: string;
  boardName: string;
  anonymous: boolean;
  allowAttachments: boolean;
  draftKey?: string;
  post?: EditingPost;
}) {
  const editing = post !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updatePostAction : createPostAction,
    EMPTY_POST_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const draftNonceInputRef = useRef<HTMLInputElement>(null);
  const draftNonceRef = useRef<string | null>(null);
  const submittedDraftNonceRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<DraftValues | null>(null);
  const [restored, setRestored] = useState(false);

  const v = state.values;

  const setDraftNonce = useCallback((nonce: string): string => {
    draftNonceRef.current = nonce;
    if (draftNonceInputRef.current) draftNonceInputRef.current.value = nonce;
    return nonce;
  }, []);

  const ensureDraftNonce = useCallback((): string => {
    return draftNonceRef.current ?? setDraftNonce(createPostDraftNonce());
  }, [setDraftNonce]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const values = pendingDraft.current;
      if (editing || !draftKey || !values) return;
      storeDraft(draftKey, values);
    },
    [draftKey, editing],
  );

  useEffect(() => {
    if (editing || !draftKey || !formRef.current) return;

    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(draftKey);
    } catch {
      // 저장소를 읽을 수 없어도 같은 화면에 남아 있는 메모리 초안은 복원한다.
    }
    const storedDraft = raw ? parsePostDraft(raw) : null;
    if (raw && !storedDraft) {
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        // 읽은 뒤 저장소 정책이 바뀌어도 글쓰기 자체는 계속한다.
      }
    }

    const draft = postDraftForRestore(storedDraft, pendingDraft.current);
    if (!draft) {
      ensureDraftNonce();
      return;
    }

    setDraftNonce(draft.nonce);

    const title = formRef.current.elements.namedItem("title");
    const body = formRef.current.elements.namedItem("body");
    if (!(title instanceof HTMLInputElement) || !(body instanceof HTMLTextAreaElement)) {
      return;
    }

    if (
      state.values &&
      !postDraftIsNewerThanSubmission(
        draft.nonce,
        submittedDraftNonceRef.current,
      )
    ) {
      return;
    }
    title.value = draft.title;
    body.value = draft.body;

    let cancelled = false;
    const hasContent = draft.title.length > 0 || draft.body.length > 0;
    if (hasContent) {
      queueMicrotask(() => {
        if (!cancelled) setRestored(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [draftKey, editing, ensureDraftNonce, setDraftNonce, state.values]);

  function saveDraft(form: HTMLFormElement) {
    if (editing || !draftKey) return;
    const title = form.elements.namedItem("title");
    const body = form.elements.namedItem("body");
    if (!(title instanceof HTMLInputElement) || !(body instanceof HTMLTextAreaElement)) {
      return;
    }

    const currentNonce = ensureDraftNonce();
    const nonce = postDraftNonceAfterSubmission(
      currentNonce,
      submittedDraftNonceRef.current,
    );
    if (nonce !== currentNonce) {
      setDraftNonce(nonce);
    }

    const values = {
      title: title.value,
      body: body.value,
      nonce,
    };
    pendingDraft.current = values;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => storeDraft(draftKey, values), 250);
  }

  return (
    <SectionCard variant="panel" title={editing ? "글 수정" : `${boardName}에 글쓰기`}>
      {anonymous && <AnonymousNote kind="글" className="mb-4" />}

      {restored && (
        <Note tone="success" className="mb-4" role="status">
          저장하지 않은 제목과 내용을 복원했습니다.
          {allowAttachments && " 첨부파일은 다시 선택해 주세요."}
        </Note>
      )}

      <form
        ref={formRef}
        action={formAction}
        onInput={(event) => saveDraft(event.currentTarget)}
        onSubmit={() => {
          if (!editing) submittedDraftNonceRef.current = ensureDraftNonce();
        }}
        className="space-y-3"
      >
        {editing ? (
          <>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="updatedAt" value={post.updatedAt} />
          </>
        ) : (
          <>
            <input type="hidden" name="slug" value={slug} />
            <input ref={draftNonceInputRef} type="hidden" name="draftNonce" />
          </>
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
