/**
 * 인증(이메일·휴대폰 확인) 오류.
 *
 * 로그인 이전 화면이므로 **한글 문구 자체**를 message에 담는다 — CLAUDE.md의
 * 오류 규약 두 갈래 중 가입·부트스트랩 쪽이다. 액션이 그대로 화면에 보여준다.
 *
 * 서비스가 아니라 별도 파일에 둔다 (merit.error.ts와 같은 이유) —
 * verification.schema.ts도 이 클래스를 던져야 하는데, 서비스가 이미 스키마를
 * import하고 있어서 서비스에 두면 순환 참조가 된다. 서비스는 기존 import
 * 경로를 지키려고 이 클래스를 다시 내보낸다.
 */
export class VerificationError extends Error {}
