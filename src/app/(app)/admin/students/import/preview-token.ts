import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { RosterRow } from "@/modules/enrollment/roster.parse";

const TOKEN_VERSION = "v1";
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

type PreviewTokenInput = {
  year: number;
  rows: RosterRow[];
  deletionIds: string[];
  rosterFingerprint: string;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(null);
}

function previewTokenSecret(): string {
  const secret =
    process.env.ROSTER_IMPORT_PREVIEW_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (secret?.trim()) return secret;
  if (process.env.NODE_ENV === "test") return "test-only-roster-import-preview-secret";
  throw new Error("ROSTER_IMPORT_PREVIEW_SECRET 또는 BETTER_AUTH_SECRET 환경변수가 없습니다.");
}

function tokenPayload(input: PreviewTokenInput): string {
  return canonicalize({
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
