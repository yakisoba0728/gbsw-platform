/*
 * 서버 액션의 상태 타입과 초기값.
 *
 * `"use server"` 모듈은 **async 함수만** 내보낼 수 있다.
 * 거기서 일반 객체를 export하면 클라이언트에서 undefined로 들어와
 * useActionState의 초기 상태가 비어버린다. 그래서 값은 여기 둔다.
 * (admin/users·admin/invites·admin/students·import·merit와 같은 관례)
 */

export type ParentInviteState = { error: string | null; code: string | null };

export const PARENT_INVITE_INITIAL: ParentInviteState = { error: null, code: null };
