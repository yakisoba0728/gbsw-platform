import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * UPLOAD_ROOT는 모듈을 읽을 때 정해지므로 import보다 먼저 세운다. 이 파일만
 * 진짜 디스크를 쓴다 — Range의 끝 경계가 HTTP와 같은지는 실제 파일로만 확인된다.
 */
const root = await mkdtemp(path.join(tmpdir(), "gbsw-attachment-"));
process.env.UPLOAD_DIR = root;

const { attachmentSize, openAttachment, writeAttachment } = await import(
  "@/modules/community/community.storage"
);

const KEY = "a".repeat(32);
const AT = new Date("2026-09-04T00:00:00.000Z");
const BYTES = Buffer.from("0123456789");

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("첨부 스트림", () => {
  beforeAll(async () => {
    await writeAttachment(KEY, AT, BYTES);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("크기는 디스크에서 읽는다", async () => {
    await expect(attachmentSize(KEY, AT)).resolves.toBe(BYTES.byteLength);
  });

  it("범위가 없으면 전부 흘려보낸다", async () => {
    await expect(readAll(openAttachment(KEY, AT))).resolves.toBe("0123456789");
  });

  /*
   * HTTP Range의 끝은 포함이고 createReadStream의 end도 포함이다. 둘이 어긋나면
   * Content-Range가 알린 길이와 실제로 보낸 바이트 수가 한 바이트 달라진다.
   */
  it("범위의 끝 바이트를 포함해서 보낸다", async () => {
    await expect(
      readAll(openAttachment(KEY, AT, { start: 2, end: 4 })),
    ).resolves.toBe("234");
  });

  it("마지막 바이트까지의 범위도 잘리지 않는다", async () => {
    await expect(
      readAll(openAttachment(KEY, AT, { start: 7, end: 9 })),
    ).resolves.toBe("789");
  });

  it("한 바이트 범위도 한 바이트다", async () => {
    await expect(
      readAll(openAttachment(KEY, AT, { start: 0, end: 0 })),
    ).resolves.toBe("0");
  });

  it("없는 파일의 크기는 ENOENT다 — 라우트가 404로 가린다", async () => {
    await expect(attachmentSize("b".repeat(32), AT)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
