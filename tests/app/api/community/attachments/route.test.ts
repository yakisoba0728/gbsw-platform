import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { MAX_ATTACHMENT_BYTES } from "@/modules/community/community.schema";
import { user } from "../../../../helpers/session";

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
const getWritableBySlug = vi.fn();
const uploadAttachment = vi.fn();
const getDownload = vi.fn();

vi.mock("@/core/auth/session", () => ({ getSessionUser }));
vi.mock("@/modules/community/board.service", () => ({ getWritableBySlug }));
vi.mock("@/modules/community/attachment.service", () => ({
  uploadAttachment,
  getDownload,
}));

const { ForbiddenError } = await import("@/core/authz/errors");
const { CommunityError } = await import("@/modules/community/community.error");
const { POST } = await import("@/app/api/community/attachments/route");
const { GET } = await import(
  "@/app/api/community/attachments/[...attachment]/route"
);

const teacher = user("ADMIN", "u-admin", {
  name: "이정민",
  email: "admin@gbsw.hs.kr",
});

const BLOCKED: [string, SessionUser | null][] = [
  ["로그인하지 않은 요청", null],
  ["임시 비밀번호를 아직 안 바꾼 계정", { ...teacher, mustChangePassword: true }],
  ["비활성 계정", { ...teacher, status: "INACTIVE" }],
  ["명단에서 빠진 계정", { ...teacher, deletedAt: new Date("2026-08-01") }],
];

function uploadRequest(body: Uint8Array): Request {
  return new Request("http://localhost/api/community/attachments?slug=free", {
    method: "POST",
    body: body.buffer as ArrayBuffer,
    headers: { "content-type": "multipart/form-data; boundary=x" },
  });
}

function multipartRequest(filename: string, bytes: Uint8Array, type = ""): Request {
  const form = new FormData();
  form.append("file", new File([bytes.buffer as ArrayBuffer], filename, { type }));
  return new Request("http://localhost/api/community/attachments?slug=secret", {
    method: "POST",
    body: form,
  });
}

function smallBody(): Uint8Array {
  return new Uint8Array([1, 2, 3]);
}

function downloadParams(...attachment: string[]) {
  return { params: Promise.resolve({ attachment }) };
}

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue(teacher);
  getWritableBySlug
    .mockReset()
    .mockResolvedValue({ id: "c1", slug: "free", allowAttachments: true });
  uploadAttachment.mockReset().mockResolvedValue({ id: "att-1" });
  getDownload.mockReset().mockResolvedValue({
    bytes: Buffer.from("PDF"),
    filename: "가정통신문.pdf",
    mimeType: "application/pdf",
    inline: true,
  });
});

describe("POST /api/community/attachments", () => {
  it("브라우저 MIME은 넘기지 않고 파일명과 바이트만 저장에 전달한다", async () => {
    const response = await POST(
      multipartRequest("보고서.pdf", new Uint8Array([1, 2]), "text/html"),
    );

    expect(response.status).toBe(201);
    expect(uploadAttachment).toHaveBeenCalledWith(teacher, {
      slug: "secret",
      filename: "보고서.pdf",
      bytes: Buffer.from([1, 2]),
    });
  });

  it.each(BLOCKED)("%s는 401이고 게시판을 묻지도 않는다", async (_label, actor) => {
    getSessionUser.mockResolvedValue(actor);

    const response = await POST(uploadRequest(smallBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "로그인이 필요합니다." });
    expect(getWritableBySlug).not.toHaveBeenCalled();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("상한을 넘는 본문은 413이고 아무것도 저장하지 않는다", async () => {
    const oversized = new Uint8Array(MAX_ATTACHMENT_BYTES + 1024 * 1024 + 1);

    const response = await POST(uploadRequest(oversized));

    expect(response.status).toBe(413);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("쓰기 권한이 없으면 403이고 본문은 손도 대지 않는다", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));
    const request = uploadRequest(smallBody());

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("메타데이터를 못 벗기면 422이고 사유가 한글로 나간다", async () => {
    uploadAttachment.mockRejectedValue(new CommunityError("ATTACHMENT_METADATA"));

    const response = await POST(multipartRequest("사진.jpg", new Uint8Array([1, 2])));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "익명 게시판에는 위치·기기 정보를 지울 수 있는 사진만 올릴 수 있습니다.",
    });
  });

  it("첨부를 받지 않는 게시판이면 400이고 사유가 한글로 나간다", async () => {
    getWritableBySlug.mockResolvedValue({
      id: "c1",
      slug: "notice",
      allowAttachments: false,
    });

    const response = await POST(uploadRequest(smallBody()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "이 게시판은 첨부를 받지 않습니다.",
    });
    expect(uploadAttachment).not.toHaveBeenCalled();
  });
});

describe("GET /api/community/attachments/[...attachment]", () => {
  it.each(BLOCKED)("%s는 401이고 파일을 찾지도 않는다", async (_label, actor) => {
    getSessionUser.mockResolvedValue(actor);

    const response = await GET(new Request("http://localhost"), downloadParams("att-1"));

    expect(response.status).toBe(401);
    expect(getDownload).not.toHaveBeenCalled();
  });

  it.each([
    ["권한 없음", new ForbiddenError("community:attachment:read")],
    ["없는 첨부", new CommunityError("ATTACHMENT_NOT_FOUND")],
    ["디스크에 파일이 없음", Object.assign(new Error("no such file"), { code: "ENOENT" })],
  ])("%s은 구분되지 않는 404다", async (_label, error) => {
    getDownload.mockRejectedValue(error);

    const response = await GET(new Request("http://localhost"), downloadParams("att-1"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "찾을 수 없습니다." });
  });

  it("id가 없으면 404다", async () => {
    const response = await GET(new Request("http://localhost"), downloadParams());

    expect(response.status).toBe(404);
    expect(getDownload).not.toHaveBeenCalled();
  });

  it("뒤에 붙은 파일 이름은 읽지 않는다", async () => {
    await GET(new Request("http://localhost"), downloadParams("att-1", "아무거나.pdf"));
    expect(getDownload).toHaveBeenCalledWith(teacher, "att-1");
  });

  it("파일 메타데이터와 캐시 헤더를 붙인다", async () => {
    const response = await GET(new Request("http://localhost"), downloadParams("att-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain("inline;");
  });
});
