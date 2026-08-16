/**
 * 상벌점 오류. **코드**를 message에 담고, 화면 문구는 액션의 MESSAGES 사전이
 * 옮긴다 (CLAUDE.md의 오류 규약 중 새 모듈이 따르는 쪽).
 *
 * 서비스가 rule/award 둘로 나뉘어 있고 액션도 여러 개라 한 곳에 둔다 —
 * 한쪽 서비스에 두면 다른 쪽이 반대쪽 서비스를 import해야 한다.
 *
 * 코드 목록은 설계서(2026-08-14-merit-design.md)의 "오류 규약" 표에 있다.
 */
export class MeritError extends Error {}
