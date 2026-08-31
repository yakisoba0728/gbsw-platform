"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { MAX_ATTACHMENTS_PER_POST } from "@/modules/community/community.schema";
import { EMPTY_POST_STATE } from "./action-state";
import { createPostAction, updatePostAction } from "./actions";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import {
  createPostDraftNonce,
  parsePostDraft,
  postDraftNonceAfterSubmission,
  serializePostDraft,
} from "./post-draft";

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
  draftKey,
  post,
}: {
  slug: string;
  boardName: string;
  anonymous: boolean;
  allowAttachments: boolean;
  /** 새 글에만 준다. 사용자·게시판별 sessionStorage 키. */
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
  const pendingDraft = useRef<{
    title: string;
    body: string;
    nonce: string;
  } | null>(null);
  const [restored, setRestored] = useState(false);

  // React 19가 액션이 끝난 폼을 리셋하므로, 실패가 실어 온 제출값을
  // defaultValue로 내려 두면 리셋이 그 값으로 되돌아간다.
  const v = state.values;

  const setDraftNonce = useCallback((nonce: string): string => {
    draftNonceRef.current = nonce;
    if (draftNonceInputRef.current) draftNonceInputRef.current.value = nonce;
    return nonce;
  }, []);

  const ensureDraftNonce = useCallback((): string => {
    return draftNonceRef.current ?? setDraftNonce(createPostDraftNonce());
  }, [setDraftNonce]);

  // 마지막 키 입력 뒤 250ms 안에 화면을 떠나도 그 한 벌은 동기적으로 남긴다.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const values = pendingDraft.current;
      if (editing || !draftKey || !values) return;
      try {
        if (!values.title && !values.body) {
          window.sessionStorage.removeItem(draftKey);
        } else {
          window.sessionStorage.setItem(draftKey, serializePostDraft(values));
        }
      } catch {
        // 저장소를 막은 브라우저에서는 초안 없이 화면만 정상 종료한다.
      }
    },
    [draftKey, editing],
  );

  useEffect(() => {
    // 수정 화면에는 이미 서버의 최신 본문과 낙관적 잠금 시각이 있다. 새 글 초안을
    // 섞으면 충돌 원인을 감추므로 이 기능은 새 글에서만 켠다.
    if (editing || !draftKey || !formRef.current) return;

    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(draftKey);
    } catch {
      return;
    }
    if (!raw) {
      ensureDraftNonce();
      return;
    }

    const draft = parsePostDraft(raw);
    if (!draft) {
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        // 읽은 뒤 저장소 정책이 바뀌어도 글쓰기 자체는 계속한다.
      }
      ensureDraftNonce();
      return;
    }

    setDraftNonce(draft.nonce);

    const title = formRef.current.elements.namedItem("title");
    const body = formRef.current.elements.namedItem("body");
    if (!(title instanceof HTMLInputElement) || !(body instanceof HTMLTextAreaElement)) {
      return;
    }

    // 서버 액션 실패가 돌려준 값이 있으면 그것이 더 최신이다.
    if (state.values) return;
    title.value = draft.title;
    body.value = draft.body;

    // 외부 저장소를 읽은 결과를 다음 마이크로태스크에서 알린다. effect 본문에서
    // 동기 setState를 호출해 연쇄 렌더를 만드는 패턴은 피한다.
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
      submittedDraftNonceRef.current = null;
    }

    const values = {
      title: title.value,
      body: body.value,
      nonce,
    };
    pendingDraft.current = values;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        if (!values.title && !values.body) {
          window.sessionStorage.removeItem(draftKey);
        } else {
          window.sessionStorage.setItem(draftKey, serializePostDraft(values));
        }
      } catch {
        // 사생활 보호 모드 등에서 저장소가 막혀도 글쓰기는 그대로 동작해야 한다.
      } finally {
        pendingDraft.current = null;
      }
    }, 250);
  }

  return (
    <SectionCard variant="panel" title={editing ? "글 수정" : `${boardName}에 글쓰기`}>
      {anonymous && (
        <Note tone="warn" className="mb-4">
          이 게시판의 글은 작성자가 화면에 보이지 않습니다. 다만 학교는 감사 기록으로
          작성자를 확인할 수 있습니다.
        </Note>
      )}

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
