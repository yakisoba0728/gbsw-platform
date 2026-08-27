/**
 * 커뮤니티 오류. 코드를 message에 담고, 화면 문구는 액션의 MESSAGES 사전이 옮긴다
 * (MeritError·PassError와 같은 규약). 서비스가 넷이라 한 곳에 둔다 — 한쪽에 두면
 * 다른 셋이 그 서비스를 import한다.
 *
 * 권한 거부는 여기 없다. ForbiddenError다.
 */
export class CommunityError extends Error {}
