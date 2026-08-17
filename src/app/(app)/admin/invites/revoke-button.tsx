"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { REVOKE_INITIAL } from "./action-state";
import { revokeInviteAction } from "./actions";

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState(
    revokeInviteAction,
    REVOKE_INITIAL,
  );

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? "폐기 중…" : "폐기"}
      </Button>
      {state.error && (
        <span role="alert" className="ml-2 text-xs text-rose">
          {state.error}
        </span>
      )}
    </form>
  );
}
