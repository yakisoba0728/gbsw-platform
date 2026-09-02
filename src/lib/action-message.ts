import { ForbiddenError } from "@/core/authz/errors";

type ErrorConstructor = abstract new (...args: never[]) => Error;
type MessageDictionary = Readonly<Record<string, string> & { FORBIDDEN: string }>;

export function actionMessage(
  ErrorClass: ErrorConstructor,
  messages: MessageDictionary,
  prefix: string,
): (error: unknown, fallback: string) => string {
  return (error, fallback) => {
    if (error instanceof ForbiddenError) return messages.FORBIDDEN;
    if (error instanceof ErrorClass) {
      return messages[error.message] ?? fallback;
    }
    console.error(`${prefix} 예상 못 한 오류`, error);
    return fallback;
  };
}

export function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

export function firstIssue(
  error: { issues: readonly { message: string }[] },
  fallback: string,
): string {
  const message = error.issues[0]?.message;
  return message && /[가-힣]/.test(message) ? message : fallback;
}
