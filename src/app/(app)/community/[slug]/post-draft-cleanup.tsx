"use client";

import { useEffect } from "react";
import {
  postDraftMatchesCompletion,
  postDraftNonceFromHash,
} from "./post-draft";

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

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, [draftKey]);

  return null;
}
