import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "@/lib/canonical-json";
import type { RosterRow } from "./roster.parse";

/**
 * 「미리보기에서 본 그 내용만 반영한다」를 지키는 봉인.
 *
 * 확정 반영은 클라이언트가 돌려보낸 행을 다시 분류하고 학년도·명단 지문·삭제
 * 대상까지 다시 검사하지만, **넘어온 행 자체가 미리보기 때 보여준 그 행인지는
 * 그 검사들로 덮이지 않는다** — 지문은 DB 쪽 명단이 안 변했는지를 볼 뿐이다.
 * 그 마지막 한 칸을 이 HMAC이 맡는다.
 *
 * 그래서 서비스 계층에 둔다. 서버 액션에 두면 진입점을 옮기거나 같은 서비스를
 * 부르는 두 번째 진입점이 생길 때 이 보증만 조용히 사라지고, 서비스만 읽어서는
 * 빠진 줄을 알 수 없다.
 */

const TOKEN_VERSION = "v1";
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

type PreviewTokenInput = {
  year: number;
  rows: RosterRow[];
  deletionIds: string[];
  rosterFingerprint: string;
};

function previewTokenSecret(): string {
  const secret =
    process.env.ROSTER_IMPORT_PREVIEW_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (secret?.trim()) return secret;
  if (process.env.NODE_ENV === "test") return "test-only-roster-import-preview-secret";
  throw new Error("ROSTER_IMPORT_PREVIEW_SECRET 또는 BETTER_AUTH_SECRET 환경변수가 없습니다.");
}

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
