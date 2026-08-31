"use client";

import { useEffect } from "react";
import {
  postDraftMatchesCompletion,
  postDraftNonceFromHash,
} from "./post-draft";

/** 새 글 작성 성공 redirect의 난수와 일치하는 해당 사용자의 초안만 지운다. */
export function PostDraftCleanup({ draftKey }: { draftKey: string }) {
  useEffect(() => {
    if (!postDraftNonceFromHash(window.location.hash)) return;

    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (raw && postDraftMatchesCompletion(raw, window.location.hash)) {
        window.sessionStorage.removeItem(draftKey);
      }
    } catch {
      // 저장소를 막은 브라우저에서는 애초에 초안도 없으므로 할 일이 없다.
    }

    // 성공 표식은 새로고침·공유할 주소가 아니다. 새 요청 없이 주소에서만 걷는다.
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, [draftKey]);

  return null;
}
