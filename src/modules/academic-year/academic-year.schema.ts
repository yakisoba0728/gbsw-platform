import { z } from "zod";

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export const yearFormSchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});
