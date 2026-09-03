import { ForbiddenError } from "@/core/authz/errors";

/** 다운로드 버튼이 쓰는 내보내기 액션의 공통 응답 상태. */
export type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

export const EXPORT_FAILED = "내보내지 못했습니다.";

export function exportFailure(error: string | null): ExportState {
  return { error, rows: [], filename: "" };
}

/**
 * 내보내기 액션의 오류를 화면용 상태로 옮긴다.
 * - translate가 문구를 돌려주면 그것이 최우선한다(도메인별 매핑).
 * - 권한 거부는 로그를 남기지 않고 권한 문구로 안내한다.
 * - 그 밖의 오류는 서버 로그를 남기고 폴백 문구로 감춘다.
 */
export function exportErrorState(
  error: unknown,
  options: {
    logLabel: string;
    forbiddenMessage: string;
    fallback?: string;
    translate?: (error: unknown) => string | null;
  },
): ExportState {
  const translated = options.translate?.(error) ?? null;
  if (translated !== null) return exportFailure(translated);
  if (error instanceof ForbiddenError) {
    return exportFailure(options.forbiddenMessage);
  }
  console.error(options.logLabel, error);
  return exportFailure(options.fallback ?? EXPORT_FAILED);
}
