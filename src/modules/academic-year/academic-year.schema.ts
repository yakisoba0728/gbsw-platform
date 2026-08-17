import { z } from "zod";

/** 학교가 실제로 존재할 수 있는 범위. 오타로 20226을 넣는 걸 막는다. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** 학년도 폼(현재로 지정 · 추가) 공통 입력. */
export const yearFormSchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});
