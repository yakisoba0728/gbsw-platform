/**
 * 상벌점 오류. 코드를 message에 담고, 화면 문구는 액션의 MESSAGES 사전이 옮긴다.
 * 서비스가 여럿이라 한 곳에 둔다 — 한쪽에 두면 다른 쪽이 그 서비스를 import한다.
 */
export class MeritError extends Error {}
