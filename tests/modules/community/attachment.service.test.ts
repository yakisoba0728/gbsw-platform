import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const countPending = vi.fn();
const lockAttachmentUploader = vi.fn();
const listStalePending = vi.fn();
const deleteAttachments = vi.fn();
const createAttachment = vi.fn();
const findAttachmentForDownload = vi.fn();
const getWritableBySlug = vi.fn();
const getReadableBySlug = vi.fn();
const writeAttachment = vi.fn();
const readAttachment = vi.fn();
const deleteAttachment = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "attachment-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  countPending,
  lockAttachmentUploader,
  listStalePending,
  deleteAttachments,
  createAttachment,
  findAttachmentForDownload,
}));
vi.mock("@/modules/community/board.service", () => ({
  getWritableBySlug,
  getReadableBySlug,
}));
vi.mock("@/modules/community/community.storage", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/community/community.storage")
  >("@/modules/community/community.storage");
  // classifyUpload·newStorageKey는 진짜를 쓴다 — 허용 목록이 이 서비스의
  // 문 가운데 하나라 목으로 가리면 검증이 사라진다.
  return { ...actual, writeAttachment, readAttachment, deleteAttachment };
});
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/attachment.service");

function user(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "김민준",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

const board = {
  id: "c1",
  slug: "free",
  name: "자유게시판",
  anonymous: false,
  allowAttachments: true,
  active: true,
  readRoles: ["STUDENT"],
  writeRoles: ["STUDENT"],
};

/**
 * 문(門)들을 시험하는 기본 업로드. **사진이 아니라 문서다** — 이제 모든 이미지가
 * 메타데이터 제거를 지나므로, 여기에 가짜 PNG 바이트를 두면 권한·상한·정리를
 * 보려는 테스트가 전부 ATTACHMENT_METADATA로 죽는다. 사진 경로는 아래
 * 「사진의 메타데이터」 묶음이 진짜 바이트로 따로 본다.
 */
const upload = {
  slug: "free",
  filename: "가정통신문.pdf",
  mimeType: "application/pdf",
  bytes: Buffer.from("%PDF-1.7\n(본문)"),
};

beforeEach(() => {
  vi.clearAllMocks();
  getWritableBySlug.mockResolvedValue(board);
  getReadableBySlug.mockResolvedValue(board);
  countPending.mockResolvedValue(0);
  lockAttachmentUploader.mockResolvedValue(undefined);
  listStalePending.mockResolvedValue([]);
  // 약속을 돌려주게 둔다 — 서비스가 `.catch()`를 붙이는 자리가 있다.
  deleteAttachments.mockResolvedValue(undefined);
  writeAttachment.mockResolvedValue(undefined);
  deleteAttachment.mockResolvedValue(undefined);
  createAttachment.mockResolvedValue({
    id: "a1",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
  });
});

describe("uploadAttachment — 문 ①: 권한", () => {
  it("쓸 수 있는 게시판이면 받는다", async () => {
    const result = await service.uploadAttachment(student, upload);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(writeAttachment).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "a1",
      filename: "가정통신문.pdf",
      size: upload.bytes.length,
    });
  });

  it("**쓸 수 없으면 바이트 하나 쓰기 전에 막는다**", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));

    await expect(service.uploadAttachment(parent, upload)).rejects.toThrow(
      ForbiddenError,
    );
    expect(writeAttachment).not.toHaveBeenCalled();
    expect(createAttachment).not.toHaveBeenCalled();
  });

  it("첨부를 안 받는 게시판이면 거부한다", async () => {
    getWritableBySlug.mockResolvedValue({ ...board, allowAttachments: false });

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_ALLOWED"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });
});

describe("uploadAttachment — 문 ②: 형식과 용량", () => {
  it("svg는 거부하고 디스크를 안 건드린다", async () => {
    await expect(
      service.uploadAttachment(student, { ...upload, filename: "icon.svg" }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_TYPE"));
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("20MB를 넘으면 거부한다", async () => {
    const big = {
      ...upload,
      filename: "큰.pdf",
      bytes: Buffer.alloc(20 * 1024 * 1024 + 1),
    };
    await expect(service.uploadAttachment(student, big)).rejects.toThrow(
      new CommunityError("ATTACHMENT_TOO_LARGE"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("브라우저가 보낸 타입이 아니라 확장자가 저장 타입을 정한다", async () => {
    const result = await service.uploadAttachment(student, {
      ...upload,
      filename: "보고서.pdf",
      mimeType: "text/html",
    });
    expect(result.mimeType).toBe("application/pdf");
  });
});

describe("uploadAttachment — 익명 게시판의 메타데이터 벗기기", () => {
  /**
   * 바이트 규격 자체는 `exif.test.ts`가 본다. 여기서 볼 것은 하나다 —
   * **게시판이 익명인가로 갈리는가, 그리고 갈린 결과가 size·감사로그·응답까지
   * 따라가는가.** 벗긴 뒤에도 원본 길이를 적으면 DB가 말하는 크기와 디스크의
   * 파일이 어긋난다.
   */
  const EXIF = Buffer.from("Exif\0\0II*\0GPSLatitude=36.11", "utf8");

  /** EXIF 하나가 든 최소 JPEG. 벗기면 SOI·SOS·화소·EOI만 남는다. */
  function jpegWithExif(): Buffer {
    const app1 = Buffer.alloc(4);
    app1.writeUInt8(0xff, 0);
    app1.writeUInt8(0xe1, 1);
    app1.writeUInt16BE(EXIF.length + 2, 2);
    return Buffer.concat([
      Buffer.from([0xff, 0xd8]), // SOI
      app1,
      EXIF,
      Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01]), // SOS 머리
      Buffer.from([0xaa, 0xbb]), // 화소
      Buffer.from([0xff, 0xd9]), // EOI
    ]);
  }

  const STRIPPED = Buffer.from([
    0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0xaa, 0xbb, 0xff, 0xd9,
  ]);

  const anonymous = { ...board, slug: "secret", anonymous: true };
  const photo = { ...upload, filename: "사진.jpg", mimeType: "image/jpeg" };

  it("**벗긴 바이트를 저장한다**", async () => {
    getWritableBySlug.mockResolvedValue(anonymous);

    await service.uploadAttachment(student, { ...photo, bytes: jpegWithExif() });

    const written = writeAttachment.mock.calls[0][2] as Buffer;
    expect(written.equals(STRIPPED)).toBe(true);
    // 화소는 그대로고 촬영 위치만 사라졌다.
    expect(written.includes(Buffer.from("GPS"))).toBe(false);
    expect(written.includes(Buffer.from([0xaa, 0xbb]))).toBe(true);
  });

  it("**줄어든 길이가 size·감사로그·응답에 함께 간다**", async () => {

    const result = await service.uploadAttachment(student, {
      ...photo,
      bytes: jpegWithExif(),
    });

    expect(result.size).toBe(STRIPPED.length);
    expect(createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ size: STRIPPED.length }),
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ size: STRIPPED.length }),
      }),
      txClient,
    );
  });

  it("**실명 게시판도 벗긴다** — 익명만 벗기면 실명에 올려 그 id를 익명 글에 실으면 그만이다", async () => {
    // 첨부는 글보다 먼저 올라가고 attachToPost는 올린 사람과 postId: null만 본다.
    // 게시판으로 가르면 그 사이가 우회로가 된다.
    await service.uploadAttachment(student, { ...photo, bytes: jpegWithExif() });

    const written = writeAttachment.mock.calls[0][2] as Buffer;
    expect(written.equals(STRIPPED)).toBe(true);
  });

  it("벗길 것이 없는 사진은 복사조차 하지 않는다 — 모든 사진을 태우는 값이 여기서 나온다", async () => {
    const bytes = Buffer.from(STRIPPED);

    await service.uploadAttachment(student, { ...photo, bytes });

    // 같은 내용이 아니라 **같은 버퍼**여야 한다.
    expect(writeAttachment.mock.calls[0][2]).toBe(bytes);
  });

  it("**못 알아본 사진은 거부한다** — 조용히 원본을 저장하지 않는다", async () => {
    await expect(
      service.uploadAttachment(student, {
        ...photo,
        filename: "사진.png",
        bytes: Buffer.from("PNG가 아닌 바이트"),
      }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_METADATA"));

    // 행도 파일도 남기지 않는다 — 벗기기는 DB보다 앞이다.
    expect(createAttachment).not.toHaveBeenCalled();
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("문서는 벗기지 않는다 — 사진이 아닌 것을 사진으로 읽지 않는다", async () => {
    const bytes = Buffer.from("%PDF-1.7\n(가정통신문)");

    await service.uploadAttachment(student, {
      ...upload,
      filename: "가정통신문.pdf",
      mimeType: "application/pdf",
      bytes,
    });

    expect(writeAttachment.mock.calls[0][2]).toBe(bytes);
  });
});

describe("uploadAttachment — 문 ③: 미결 첨부 수", () => {
  it("10개를 넘으면 거부한다", async () => {
    countPending.mockResolvedValue(10);
    await expect(service.uploadAttachment(student, upload)).rejects.toThrow(
      new CommunityError("ATTACHMENT_PENDING_LIMIT"),
    );
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("9개면 통과한다", async () => {
    countPending.mockResolvedValue(9);
    await expect(service.uploadAttachment(student, upload)).resolves.toBeDefined();
  });
});

describe("uploadAttachment — 고아 정리", () => {
  it("올릴 때마다 내 오래된 고아를 지운다 — DB와 디스크 둘 다", async () => {
    const createdAt = new Date("2026-08-27T00:00:00.000Z");
    listStalePending.mockResolvedValue([
      { id: "old1", storageKey: "a".repeat(32), filename: "옛파일.pdf", createdAt },
    ]);

    await service.uploadAttachment(student, upload);

    expect(listStalePending).toHaveBeenCalledWith("s-1", expect.any(Date));
    expect(deleteAttachments).toHaveBeenCalledWith(["old1"], txClient);
    expect(deleteAttachment).toHaveBeenCalledWith("a".repeat(32), createdAt);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:delete",
        targetId: "old1",
        metadata: expect.objectContaining({ filename: "옛파일.pdf" }),
      }),
      txClient,
    );
  });

  it("정리가 실패해도 업로드는 성공한다 — 청소가 본 일을 막지 않는다", async () => {
    listStalePending.mockRejectedValue(new Error("db down"));
    await expect(service.uploadAttachment(student, upload)).resolves.toBeDefined();
  });
});

describe("uploadAttachment — 감사로그", () => {
  it("파일 이름·크기를 남긴다", async () => {
    await service.uploadAttachment(student, upload);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:create",
        targetId: "a1",
        metadata: expect.objectContaining({
          filename: "가정통신문.pdf",
          size: upload.bytes.length,
        }),
      }),
      txClient,
    );
  });
});

describe("uploadAttachment — DB와 디스크의 순서", () => {
  it("**파일은 커밋 뒤에 쓴다** — 트랜잭션 안에서 쓰면 롤백 때 파일이 영구히 샌다", async () => {
    const order: string[] = [];
    createAttachment.mockImplementation(async () => {
      order.push("row");
      return { id: "a1", createdAt: new Date("2026-08-28T00:00:00.000Z") };
    });
    writeAttachment.mockImplementation(async () => {
      order.push("file");
    });

    await service.uploadAttachment(student, upload);

    expect(order).toEqual(["row", "file"]);
  });

  it("디스크 쓰기가 실패하면 행을 지우고 올린다 — 가리킬 것이 없는 행을 안 남긴다", async () => {
    writeAttachment.mockRejectedValue(new Error("ENOSPC"));

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow("ENOSPC");
    expect(deleteAttachments).toHaveBeenCalledWith(["a1"], txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:delete",
        targetId: "a1",
        metadata: expect.objectContaining({ filename: "가정통신문.pdf" }),
      }),
      txClient,
    );
  });

  it("그 정리마저 실패해도 원래 오류를 올린다", async () => {
    writeAttachment.mockRejectedValue(new Error("ENOSPC"));
    deleteAttachments.mockRejectedValue(new Error("db down"));

    await expect(service.uploadAttachment(student, upload)).rejects.toThrow("ENOSPC");
  });
});

describe("getDownload", () => {
  const attachment = {
    id: "a1",
    postId: "p1" as string | null,
    uploaderUserId: "s-1" as string | null,
    storageKey: "b".repeat(32),
    filename: "사진.png",
    mimeType: "image/png",
    size: 3,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    post: { id: "p1", deletedAt: null as Date | null, community: board },
  };

  beforeEach(() => {
    findAttachmentForDownload.mockResolvedValue(attachment);
    readAttachment.mockResolvedValue(Buffer.from("PNG"));
  });

  it("읽기 권한이 있으면 준다 — 이미지는 inline", async () => {
    const result = await service.getDownload(student, "a1");

    expect(getReadableBySlug).toHaveBeenCalledWith(student, "free");
    expect(result).toMatchObject({
      filename: "사진.png",
      mimeType: "image/png",
      inline: true,
    });
  });

  it("읽기 권한이 없으면 거부하고 파일을 안 읽는다", async () => {
    getReadableBySlug.mockRejectedValue(new ForbiddenError("community:read"));

    await expect(service.getDownload(parent, "a1")).rejects.toThrow(ForbiddenError);
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it("지워진 글의 첨부는 막는다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      post: { ...attachment.post, deletedAt: new Date() },
    });
    await expect(service.getDownload(student, "a1")).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_FOUND"),
    );
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it("**아직 글에 안 붙은 첨부는 올린 본인만 본다**", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      postId: null,
      post: null,
      uploaderUserId: "s-1",
    });

    await expect(service.getDownload(student, "a1")).resolves.toBeDefined();
    await expect(service.getDownload(user("STUDENT", "s-9"), "a1")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("없는 첨부면 ATTACHMENT_NOT_FOUND", async () => {
    findAttachmentForDownload.mockResolvedValue(null);
    await expect(service.getDownload(student, "a1")).rejects.toThrow(
      new CommunityError("ATTACHMENT_NOT_FOUND"),
    );
  });

  it("문서는 inline이 아니다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      filename: "가정통신문.hwp",
      mimeType: "application/x-hwp",
    });
    expect((await service.getDownload(student, "a1")).inline).toBe(false);
  });

  it("허용 목록에서 빠진 형식은 octet-stream으로 떨어진다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      filename: "icon.svg",
      mimeType: "image/svg+xml",
    });
    const result = await service.getDownload(student, "a1");
    expect(result.mimeType).toBe("application/octet-stream");
    expect(result.inline).toBe(false);
  });
});
