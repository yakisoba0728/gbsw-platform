"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { revokeInviteAction, type RevokeState } from "./actions";

const INITIAL: RevokeState = { error: null };

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState(
    revokeInviteAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? "폐기 중…" : "폐기"}
      </Button>
      {state.error && (
        <span role="alert" className="ml-2 text-[11.5px] text-rose">
          {state.error}
        </span>
      )}
    </form>
  );
}
