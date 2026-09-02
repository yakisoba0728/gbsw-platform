import type { VerifyResult } from "@/modules/pass/verify.service";

export type ScanState = {
  result: VerifyResult | null;
  error: string | null;
};

export const EMPTY_SCAN_STATE: ScanState = { result: null, error: null };
