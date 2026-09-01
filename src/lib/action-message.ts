import { ForbiddenError } from "@/core/authz/errors";

type ErrorConstructor = abstract new (...args: never[]) => Error;
type MessageDictionary = Readonly<Record<string, string> & { FORBIDDEN: string }>;

/** 서비스 오류 코드를 파일별 화면 문구로 옮기는 서버 액션용 변환기. */
export function actionMessage(
  ErrorClass: ErrorConstructor,
  messages: MessageDictionary,
  prefix: string,
): (error: unknown, fallback: string) => string {
  return (error, fallback) => {
    // 권한 거부를 일반 폴백에 섞지 않는다 — 권한이 없어서 막힌 사람에게
    // 일시적 장애처럼 보이는 문구를 주면 계속 다시 누르게 된다.
    if (error instanceof ForbiddenError) return messages.FORBIDDEN;
    if (error instanceof ErrorClass) {
      return messages[error.message] ?? fallback;
    }
    // 예상 못 한 오류는 서버 콘솔에 남긴다. 화면에는 일반 문구만 나가므로
    // 여기서 안 남기면 원인이 어디에도 없다.
    console.error(`${prefix} 예상 못 한 오류`, error);
    return fallback;
  };
}

/** 폼이 보낸 문자열 그대로 읽는다. 되돌려 줄 값이므로 다듬지 않는다. */
export function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/**
 * zod가 낸 첫 문제의 문구. **한글이 아니면 기본 문구로 떨어뜨린다** —
 * discriminatedUnion의 유형 판별 실패 같은 내부 영문 문구가 사용자 화면에
 * 그대로 뜨는 길을 열어 두지 않는다.
 */
export function firstIssue(
  error: { issues: readonly { message: string }[] },
  fallback: string,
): string {
  const message = error.issues[0]?.message;
  return message && /[가-힣]/.test(message) ? message : fallback;
}
