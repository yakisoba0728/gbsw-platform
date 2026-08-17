"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { REVOKE_INITIAL } from "./action-state";
import { revokeInviteAction } from "./actions";

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState(
    revokeInviteAction,
    REVOKE_INITIAL,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? "폐기 중…" : "폐기"}
      </Button>
      {/* Note가 role="alert"을 붙이는 유일한 장치다. 표 셀 안이라 왼쪽 정렬로 되돌린다. */}
      {state.error && (
        <Note tone="error" className="mt-1.5 text-left">
          {state.error}
        </Note>
      )}
    </form>
  );
}
