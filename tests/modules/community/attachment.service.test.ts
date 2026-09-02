import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

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
const {
  recordAudit,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("attachment-service-test");

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
  return { ...actual, writeAttachment, readAttachment, deleteAttachment };
});
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/attachment.service");

const student = user("STUDENT", "s-1", { name: "김민준" });
const parent = user("PARENT", "p-1", { name: "김민준" });

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

const upload = {
  slug: "free",
  filename: "가정통신문.pdf",
  bytes: Buffer.from("%PDF-1.7\n(본문)"),
};

beforeEach(() => {
  vi.clearAllMocks();
  getWritableBySlug.mockResolvedValue(board);
  getReadableBySlug.mockResolvedValue(board);
  countPending.mockResolvedValue(0);
  lockAttachmentUploader.mockResolvedValue(undefined);
  listStalePending.mockResolvedValue([]);
  deleteAttachments.mockResolvedValue(undefined);
  writeAttachment.mockResolvedValue(undefined);
  deleteAttachment.mockResolvedValue(undefined);
  createAttachment.mockResolvedValue({
    id: "a1",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
  });
});

describe("uploadAttachment — 권한", () => {
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

  it("쓸 수 없으면 바이트 하나 쓰기 전에 막는다", async () => {
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

describe("uploadAttachment — 형식과 용량", () => {
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

  it("확장자가 저장 타입을 정한다", async () => {
    const result = await service.uploadAttachment(student, {
      ...upload,
      filename: "보고서.pdf",
    });
    expect(result.mimeType).toBe("application/pdf");
  });
});

describe("uploadAttachment — 익명 게시판의 메타데이터 벗기기", () => {
  const EXIF = Buffer.from("Exif\0\0II*\0GPSLatitude=36.11", "utf8");

  function jpegWithExif(): Buffer {
    const app1 = Buffer.alloc(4);
    app1.writeUInt8(0xff, 0);
    app1.writeUInt8(0xe1, 1);
    app1.writeUInt16BE(EXIF.length + 2, 2);
    return Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app1,
      EXIF,
      Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01]),
      Buffer.from([0xaa, 0xbb]),
      Buffer.from([0xff, 0xd9]),
    ]);
  }

  const STRIPPED = Buffer.from([
    0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0xaa, 0xbb, 0xff, 0xd9,
  ]);

  const anonymous = { ...board, slug: "secret", anonymous: true };
  const photo = { ...upload, filename: "사진.jpg" };

  it("벗긴 바이트를 저장한다", async () => {
    getWritableBySlug.mockResolvedValue(anonymous);

    await service.uploadAttachment(student, { ...photo, bytes: jpegWithExif() });

    const written = writeAttachment.mock.calls[0][2] as Buffer;
    expect(written.equals(STRIPPED)).toBe(true);
    expect(written.includes(Buffer.from("GPS"))).toBe(false);
    expect(written.includes(Buffer.from([0xaa, 0xbb]))).toBe(true);
  });

  it("줄어든 길이가 size·감사로그·응답에 함께 간다", async () => {

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

  it("실명 게시판도 벗긴다 — 익명만 벗기면 실명에 올려 그 id를 익명 글에 실으면 그만이다", async () => {
    await service.uploadAttachment(student, { ...photo, bytes: jpegWithExif() });

    const written = writeAttachment.mock.calls[0][2] as Buffer;
    expect(written.equals(STRIPPED)).toBe(true);
  });

  it("벗길 것이 없는 사진은 복사조차 하지 않는다 — 모든 사진을 태우는 값이 여기서 나온다", async () => {
    const bytes = Buffer.from(STRIPPED);

    await service.uploadAttachment(student, { ...photo, bytes });

    expect(writeAttachment.mock.calls[0][2]).toBe(bytes);
  });

  it("못 알아본 사진은 거부한다 — 조용히 원본을 저장하지 않는다", async () => {
    await expect(
      service.uploadAttachment(student, {
        ...photo,
        filename: "사진.png",
        bytes: Buffer.from("PNG가 아닌 바이트"),
      }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_METADATA"));

    expect(createAttachment).not.toHaveBeenCalled();
    expect(writeAttachment).not.toHaveBeenCalled();
  });

  it("문서는 벗기지 않는다 — 사진이 아닌 것을 사진으로 읽지 않는다", async () => {
    const bytes = Buffer.from("%PDF-1.7\n(가정통신문)");

    await service.uploadAttachment(student, {
      ...upload,
      filename: "가정통신문.pdf",
      bytes,
    });

    expect(writeAttachment.mock.calls[0][2]).toBe(bytes);
  });
});

describe("uploadAttachment — 미결 첨부 수", () => {
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
  it("내 고아와 주인이 사라진 고아를 구분해 지운다 — DB·디스크·감사로그", async () => {
    const createdAt = new Date("2026-08-27T00:00:00.000Z");
    listStalePending.mockResolvedValue([
      {
        id: "old1",
        storageKey: "a".repeat(32),
        filename: "내-옛파일.pdf",
        uploaderUserId: "s-1",
        createdAt,
      },
      {
        id: "old2",
        storageKey: "b".repeat(32),
        filename: "주인-없는-옛파일.pdf",
        uploaderUserId: null,
        createdAt,
      },
    ]);

    await service.uploadAttachment(student, upload);

    expect(listStalePending).toHaveBeenCalledWith("s-1", expect.any(Date));
    expect(deleteAttachments).toHaveBeenCalledWith(["old1", "old2"], txClient);
    expect(deleteAttachment).toHaveBeenCalledWith("a".repeat(32), createdAt);
    expect(deleteAttachment).toHaveBeenCalledWith("b".repeat(32), createdAt);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:delete",
        targetId: "old1",
        metadata: expect.objectContaining({
          filename: "내-옛파일.pdf",
          cleanup: true,
          orphaned: false,
        }),
      }),
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:delete",
        targetId: "old2",
        metadata: expect.objectContaining({
          filename: "주인-없는-옛파일.pdf",
          cleanup: true,
          orphaned: true,
        }),
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
  it("파일은 커밋 뒤에 쓴다 — 트랜잭션 안에서 쓰면 롤백 때 파일이 영구히 샌다", async () => {
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

  it("아직 글에 안 붙은 첨부는 올린 본인만 본다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      postId: null,
      post: null,
      uploaderUserId: "s-1",
    });

    await expect(service.getDownload(student, "a1")).resolves.toBeDefined();
    await expect(
      service.getDownload(user("STUDENT", "s-9", { name: "김민준" }), "a1"),
    ).rejects.toThrow(ForbiddenError);
  });

  it.each([
    ["다른 사용자가 올린", "s-1"],
    ["올린 계정이 사라진", null],
  ])("%s 미결 첨부 접근을 거부하고 대상을 기록한다", async (_label, uploaderUserId) => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      postId: null,
      post: null,
      uploaderUserId,
    });
    const intruder = user("STUDENT", "s-9", { name: "김민준" });

    await expect(service.getDownload(intruder, "a1")).rejects.toThrow(
      ForbiddenError,
    );

    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "s-9",
      actorName: "김민준",
      action: "authz:denied",
      targetType: "CommunityAttachment",
      targetId: "a1",
      metadata: { action: "community:attachment:read" },
    });
    expect(readAttachment).not.toHaveBeenCalled();
  });

  it("감사 기록이 실패해도 소유권 거부는 ForbiddenError로 남는다", async () => {
    findAttachmentForDownload.mockResolvedValue({
      ...attachment,
      postId: null,
      post: null,
      uploaderUserId: null,
    });
    recordAudit.mockRejectedValue(new Error("audit down"));

    await expect(
      service.getDownload(user("STUDENT", "s-9"), "a1"),
    ).rejects.toThrow(new ForbiddenError("community:attachment:read"));
    expect(readAttachment).not.toHaveBeenCalled();
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
