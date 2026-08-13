import { z } from "zod";

/** 학교가 실제로 존재할 수 있는 범위. 오타로 20226을 넣는 걸 막는다. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/**
 * 학년도 폼 액션(현재로 지정 / 새로 만들기) 공통 입력.
 *
 * `actions.ts`가 `Number(formData.get("year"))`를 검증 없이 서비스로 넘기던 것을
 * 여기로 옮긴다 — "zod 검증은 경계에서 한 번만"이 이 저장소 규약이다.
 */
export const yearFormSchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});
