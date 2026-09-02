import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "@/lib/canonical-json";
import type { RosterRow } from "./roster.parse";

const TOKEN_VERSION = "v1";
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

type PreviewTokenInput = {
  year: number;
  rows: RosterRow[];
  deletionIds: string[];
  rosterFingerprint: string;
};

function previewTokenSecret(): string {
  const explicit = process.env.ROSTER_IMPORT_PREVIEW_SECRET;
  const secret = explicit?.trim() ? explicit : process.env.BETTER_AUTH_SECRET;
  if (secret?.trim()) return secret;
  if (process.env.NODE_ENV === "test") return "test-only-roster-import-preview-secret";
  throw new Error("ROSTER_IMPORT_PREVIEW_SECRET 또는 BETTER_AUTH_SECRET 환경변수가 없습니다.");
}

// 확인한 명단·삭제 대상·DB 상태를 함께 서명해 적용 요청의 바꿔치기를 막는다.
function tokenPayload(input: PreviewTokenInput): string {
  return canonicalJson({
    year: input.year,
    rows: input.rows,
    deletionIds: [...input.deletionIds].sort(),
    rosterFingerprint: input.rosterFingerprint,
  });
}

function digest(input: PreviewTokenInput): Buffer {
  return createHmac("sha256", previewTokenSecret()).update(tokenPayload(input)).digest();
}

export function issuePreviewToken(input: PreviewTokenInput): string {
  return `${TOKEN_VERSION}.${digest(input).toString("base64url")}`;
}

export function verifyPreviewToken(token: string, input: PreviewTokenInput): boolean {
  if (token.length > 256) return false;

  const [version, mac, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !mac || extra !== undefined) return false;
  if (!SHA256_BASE64URL.test(mac)) return false;

  const expected = digest(input);
  const actual = Buffer.from(mac, "base64url");
  if (actual.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(actual, expected);
}
