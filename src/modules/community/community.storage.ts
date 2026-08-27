import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_ATTACHMENT_BYTES } from "./community.schema";

/**
 * 첨부 파일의 디스크 쪽. **DB를 모른다** — 여기 있는 것은 바이트와 경로뿐이다.
 *
 * 설계의 핵심은 하나다: **올린 사람이 붙인 파일 이름이 디스크에 절대 닿지
 * 않는다.** 경로 탈출(`../../etc/passwd`)과 확장자 위조를 검사로 막는 대신,
 * 그 값이 파일 이름이 될 길 자체를 없앤다. 디스크 이름은 랜덤 32자이고
 * 원래 이름은 DB에만 있다.
 */

/**
 * 볼륨 뿌리. 운영은 도커 볼륨(`/app/uploads`), 로컬은 저장소 안 `.uploads`다.
 * 로컬 기본값을 두는 이유는 개발자가 환경변수를 안 넣어도 첨부가 도는 편이
 * 낫기 때문이다 — `.gitignore`에 들어 있다.
 */
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".uploads");

/** 디스크 이름 규격. 이 정규식이 경로 탈출을 막는 유일한 문이다. */
const STORAGE_KEY = /^[0-9a-f]{32}$/;

type Allowed = { mime: string; inline: boolean };

/**
 * 허용 목록. **확장자가 타입을 정한다** — 브라우저가 보낸 `Content-Type`은
 * 올리는 쪽이 마음대로 적을 수 있어 믿지 않는다.
 *
 * `inline: true`는 브라우저에 그대로 보여 주는 것이고, 그 자리에 스크립트가
 * 돌 수 있는 형식이 있으면 안 된다. **svg는 그래서 목록에 없다** — 같은
 * 출처에서 열리면 그 안의 스크립트가 세션 쿠키에 닿는다. html·js도 없다.
 */
const ALLOWED: Record<string, Allowed> = {
  png: { mime: "image/png", inline: true },
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  gif: { mime: "image/gif", inline: true },
  webp: { mime: "image/webp", inline: true },

  pdf: { mime: "application/pdf", inline: false },
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

export type UploadVerdict =
  | { ok: true; mimeType: string; inline: boolean }
  | { ok: false; code: "ATTACHMENT_TYPE" | "ATTACHMENT_TOO_LARGE" };

/**
 * 받을 수 있는 파일인가. **라우트 핸들러가 바이트를 쓰기 전에 부른다.**
 * `bodySizeLimit`은 라우트 핸들러에 안 걸리므로, 용량을 재는 곳이 여기뿐이다.
 *
 * 두 번째 인자(브라우저가 보낸 타입)는 **일부러 쓰지 않는다.** 시그니처에
 * 남겨 두는 것은 호출부가 그 값을 들고 있다는 사실을 드러내기 위해서다 —
 * 지우면 "왜 안 쓰지"가 아니라 "받은 적이 없다"가 되어 판단이 사라진다.
 */
export function classifyUpload(
  filename: string,
  _browserMimeType: string,
  size: number,
): UploadVerdict {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  const allowed = ALLOWED[ext];
  if (!allowed) return { ok: false, code: "ATTACHMENT_TYPE" };

  // 빈 파일도 거부한다 — 고를 때 잘못 누른 것이지 올리려던 것이 아니다.
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: "ATTACHMENT_TOO_LARGE" };
  }

  return { ok: true, mimeType: allowed.mime, inline: allowed.inline };
}

export function newStorageKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * 디스크 경로. 키가 규격에 안 맞으면 **던진다** — 조용히 정규화하면
 * 언젠가 정규화가 틀리는 날이 온다. 연·월로 나눠 한 디렉터리에 파일이
 * 무한정 쌓이지 않게 한다.
 */
export function storagePath(key: string, at: Date): string {
  if (!STORAGE_KEY.test(key)) {
    throw new Error(`storageKey가 규격에 맞지 않습니다: ${key.slice(0, 8)}…`);
  }
  const year = String(at.getUTCFullYear());
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return path.join(UPLOAD_ROOT, year, month, key);
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
  return readFile(storagePath(key, at));
}

/**
 * 지운다. **없어도 오류를 내지 않는다** — 이 함수를 부르는 자리는 DB 행을
 * 이미 지운 뒤라, 파일이 없다고 거기서 멈추면 되레 정리가 막힌다.
 */
export async function deleteAttachment(key: string, at: Date): Promise<void> {
  await rm(storagePath(key, at), { force: true });
}

/**
 * `Content-Disposition`. 원래 이름이 헤더에 들어가는 유일한 자리다 —
 * 따옴표·줄바꿈이 섞이면 헤더가 쪼개져 응답 전체를 조작할 수 있으므로,
 * ASCII 폴백은 위험한 문자를 지우고 진짜 이름은 RFC 5987로 인코딩해 싣는다.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  // 문자 클래스 안에서 `;`를 이스케이프하지 않는다 — `\;`는 no-useless-escape에 걸린다.
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/[";\r\n]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
