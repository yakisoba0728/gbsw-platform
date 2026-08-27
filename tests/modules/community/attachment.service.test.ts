import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const countPending = vi.fn();
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

const upload = {
  slug: "free",
  filename: "사진.png",
  mimeType: "image/png",
  bytes: Buffer.from("PNG"),
};

beforeEach(() => {
  vi.clearAllMocks();
  getWritableBySlug.mockResolvedValue(board);
  getReadableBySlug.mockResolvedValue(board);
  countPending.mockResolvedValue(0);
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
    expect(result).toMatchObject({ id: "a1", filename: "사진.png", size: 3 });
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

  it("5MB를 넘으면 거부한다", async () => {
    const big = {
      ...upload,
      filename: "큰.pdf",
      bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
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
      { id: "old1", storageKey: "a".repeat(32), createdAt },
    ]);

    await service.uploadAttachment(student, upload);

    expect(listStalePending).toHaveBeenCalledWith("s-1", expect.any(Date));
    expect(deleteAttachments).toHaveBeenCalledWith(["old1"]);
    expect(deleteAttachment).toHaveBeenCalledWith("a".repeat(32), createdAt);
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
        metadata: expect.objectContaining({ filename: "사진.png", size: 3 }),
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
    expect(deleteAttachments).toHaveBeenCalledWith(["a1"]);
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
      filename: "보고서.pdf",
      mimeType: "application/pdf",
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
