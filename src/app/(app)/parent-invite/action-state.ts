/** `"use server"` 모듈은 async 함수만 내보낼 수 있어 초기값을 여기 둔다. */

export type ParentInviteState = { error: string | null; code: string | null };

export const PARENT_INVITE_INITIAL: ParentInviteState = { error: null, code: null };
