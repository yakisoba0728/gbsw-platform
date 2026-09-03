import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
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

/*
 * 첨부는 파일당 20MB다. 통째로 버퍼에 올리면 동시 내려받기 수만큼 그 크기가
 * 힙에 쌓이므로, 존재 확인과 크기만 먼저 읽고 바이트는 흘려보낸다.
 * 없는 파일은 여기서 ENOENT로 터져 라우트가 404로 가린다.
 */
export async function attachmentSize(key: string, at: Date): Promise<number> {
  const info = await stat(/* turbopackIgnore: true */ storagePath(key, at));
  return info.size;
}

export type ByteRange = { start: number; end: number };

export type RangeVerdict =
  | { kind: "full" }
  | { kind: "partial"; range: ByteRange }
  | { kind: "unsatisfiable" };

/*
 * Range를 읽는 순수 함수다. 알아듣지 못하는 형태는 전부 전체 응답으로 떨어뜨린다 —
 * Range는 서버가 무시해도 되는 요청이라, 애매한 값에 206을 붙이는 것보다 안전하다.
 * 시작이 파일 끝을 넘는 것만 416으로 되돌려준다.
 */
export function parseRangeHeader(
  header: string | null | undefined,
  size: number,
): RangeVerdict {
  if (!header) return { kind: "full" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "full" };

  const [, rawStart, rawEnd] = match;
  const last = size - 1;

  // bytes=-N — 끝에서 N바이트.
  if (rawStart === "") {
    if (rawEnd === "") return { kind: "full" };
    const suffix = Number(rawEnd);
    if (suffix === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", range: { start: Math.max(0, size - suffix), end: last } };
  }

  const start = Number(rawStart);
  if (start > last) return { kind: "unsatisfiable" };

  const end = rawEnd === "" ? last : Math.min(Number(rawEnd), last);
  if (end < start) return { kind: "full" };

  return { kind: "partial", range: { start, end } };
}

/* 바이트를 흘려보낸다. 범위를 주면 그 조각만 읽는다. */
export function openAttachment(
  key: string,
  at: Date,
  range?: ByteRange,
): ReadableStream<Uint8Array> {
  const stream = createReadStream(
    /* turbopackIgnore: true */ storagePath(key, at),
    range ? { start: range.start, end: range.end } : undefined,
  );
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

export async function deleteAttachment(key: string, at: Date): Promise<void> {
  await rm(storagePath(key, at), { force: true });
}

export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
