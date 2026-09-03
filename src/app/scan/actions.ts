"use server";

import { defineFormAction } from "@/lib/action";
import { ForbiddenError } from "@/core/authz/errors";
import { verifyCodeSchema } from "@/modules/pass/pass.schema";
import { verifyStudentQr } from "@/modules/pass/verify.service";
import type { ScanState } from "./scan-state";

export const scanAction = defineFormAction<ScanState>()({
  schema: verifyCodeSchema,
  input: (formData) => ({ code: formData.get("code") }),
  failState: (error) => ({ result: null, error }),
  run: async (actor, data) => ({
    result: await verifyStudentQr(actor, data.code),
    error: null,
  }),
  // 스캐너는 권한 문제만 안내하고 나머지 오류는 그대로 전파한다(기존 계약).
  onError: (error) => {
    if (error instanceof ForbiddenError) {
      return "이 계정으로는 확인할 수 없습니다.";
    }
    throw error;
  },
  errorClass: ForbiddenError,
  messages: { FORBIDDEN: "이 계정으로는 확인할 수 없습니다." },
  logPrefix: "[scan]",
  invalidInputMessage: "코드를 읽지 못했습니다.",
  failureMessage: "코드를 읽지 못했습니다.",
});
