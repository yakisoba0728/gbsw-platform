/**
 * 인증 오류. 로그인 이전 화면이라 한글 문구를 message에 담는다 (CLAUDE.md 오류 규약).
 * 서비스가 아니라 여기 두는 이유는 스키마도 이걸 던져 순환 참조가 되기 때문이다.
 */
export class VerificationError extends Error {}
