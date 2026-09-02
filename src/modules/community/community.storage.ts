import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_ATTACHMENT_BYTES } from "./community.schema";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

const STORAGE_KEY = /^[0-9a-f]{32}$/;

type Allowed = { mime: string; inline: boolean };

const ALLOWED: Record<string, Allowed> = {
  png: { mime: "image/png", inline: true },
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  gif: { mime: "image/gif", inline: true },
  webp: { mime: "image/webp", inline: true },

  pdf: { mime: "application/pdf", inline: true },
  hwp: { mime: "application/x-hwp", inline: false },
  hwpx: { mime: "application/hwp+zip", inline: false },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inline: false,
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inline: false,
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    inline: false,
  },
  txt: { mime: "text/plain", inline: false },
  zip: { mime: "application/zip", inline: false },
};

type UploadVerdict =
  | { ok: true; mimeType: string; inline: boolean }
  | { ok: false; code: "ATTACHMENT_TYPE" | "ATTACHMENT_TOO_LARGE" };

export function classifyUpload(
  filename: string,
  size: number,
): UploadVerdict {
  // 클라이언트 MIME 대신 허용 확장자로 응답 타입과 인라인 여부를 정한다.
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  const allowed = ALLOWED[ext];
  if (!allowed) return { ok: false, code: "ATTACHMENT_TYPE" };

  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: "ATTACHMENT_TOO_LARGE" };
  }

  return { ok: true, mimeType: allowed.mime, inline: allowed.inline };
}

export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

export function storagePath(key: string, at: Date): string {
  if (!STORAGE_KEY.test(key)) {
    throw new Error(`storageKey가 규격에 맞지 않습니다: ${key.slice(0, 8)}…`);
  }
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  // 런타임 업로드 폴더를 빌드의 파일 추적 대상에서 제외한다.
  return path.join(/* turbopackIgnore: true */ UPLOAD_ROOT, year, month, key);
}

export async function writeAttachment(
  key: string,
  at: Date,
  bytes: Buffer,
): Promise<void> {
  const target = storagePath(key, at);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export function readAttachment(key: string, at: Date): Promise<Buffer> {
  return readFile(/* turbopackIgnore: true */ storagePath(key, at));
}

export async function deleteAttachment(key: string, at: Date): Promise<void> {
  await rm(storagePath(key, at), { force: true });
}

export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
