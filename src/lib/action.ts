import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { requireAuth, type SessionUser } from "@/core/auth/session";
import { actionMessage, firstIssue } from "@/lib/action-message";

type ErrorConstructor = abstract new (...args: never[]) => Error;
type MessageDictionary = Readonly<Record<string, string> & { FORBIDDEN: string }>;

/** useActionState에 그대로 연결하는 서버 액션 함수 형태. */
export type FormAction<TState> = (
  prevState: TState,
  formData: FormData,
) => Promise<TState>;

/**
 * 스키마에 넣기 전의 입력 가공(JSON 파싱 등)이 깨졌을 때,
 * 서버 스택 대신 사용자에게 보여줄 문구를 담아 던진다.
 */
export class ActionInputError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = "ActionInputError";
  }
}

export type RequireAuthOptions = {
  allowMustChangePassword?: boolean;
};

export type FormActionConfig<TState, TData> = {
  /** 검증 스키마. TData는 스키마 출력(z.infer)과 같아야 한다. */
  schema: ZodType<TData>;
  /** FormData를 스키마 입력으로 바꾼다. 깨진 입력은 ActionInputError로 던진다. */
  input: (formData: FormData) => unknown;
  /**
   * 서비스 호출과 성공 응답 상태. 도메인 오류는 messages 사전·failureMessage로
   * 옮겨지고, redirect는 run 안에서(revalidate 뒤에) 호출한다.
   */
  run: (actor: SessionUser, data: TData, formData: FormData) => Promise<TState>;
  /** 파싱 실패·서비스 실패 시 돌려줄 useActionState 상태를 만든다. */
  failState: (error: string, formData: FormData) => TState;
  /** 도메인 오류 사전과 폴백 문구 결정에 쓰는 오류 클래스. */
  errorClass: ErrorConstructor;
  messages: MessageDictionary;
  logPrefix: string;
  /** 파싱 실패 시 issue 문구가 한국어가 아니면 대신 쓰는 문구. */
  invalidInputMessage: string;
  /** 예상 못 한 오류(도메인 오류가 아닌 경우) 폴백 문구. */
  failureMessage: string;
  /** 사전에 특별히 옮길 오류(AcademicYearError 등). 문구를 돌려주면 그걸 쓴다. */
  onError?: (error: unknown) => string | null;
  requireAuthOptions?: RequireAuthOptions;
};

/**
 * requireAuth → FormData 가공·파싱 → 실패 응답 → try/catch → 성공 응답을
 * 한 번에 처리하는 액션을 만든다. 상태 타입만 지정하면 나머지는 설정에서 추론된다.
 *
 *   export const createAction = defineFormAction<MyState>({ ... });
 */
export function defineFormAction<TState>(): <TData>(
  config: FormActionConfig<TState, TData>,
) => FormAction<TState> {
  return <TData>(
    config: FormActionConfig<TState, TData>,
  ): FormAction<TState> => {
    const messageFor = actionMessage(
      config.errorClass,
      config.messages,
      config.logPrefix,
    );

    return async (_prevState: TState, formData: FormData): Promise<TState> => {
      const actor = await requireAuth(config.requireAuthOptions);

      let input: unknown;
      try {
        input = config.input(formData);
      } catch (error) {
        if (error instanceof ActionInputError) {
          return config.failState(error.userMessage, formData);
        }
        throw error;
      }

      const parsed = config.schema.safeParse(input);
      if (!parsed.success) {
        return config.failState(
          firstIssue(parsed.error, config.invalidInputMessage),
          formData,
        );
      }

      try {
        return await config.run(actor, parsed.data, formData);
      } catch (error) {
        // redirect·notFound와 동적 API 관련 Next 내부 예외를 실패 상태로 삼키지 않는다.
        unstable_rethrow(error);
        const handled = config.onError?.(error) ?? null;
        return config.failState(
          handled ?? messageFor(error, config.failureMessage),
          formData,
        );
      }
    };
  };
}
