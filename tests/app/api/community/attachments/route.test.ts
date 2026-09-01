import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { MAX_ATTACHMENT_BYTES } from "@/modules/community/community.schema";
import { user } from "../../../../helpers/session";

/**
 * 첨부 라우트 둘의 **문**을 본다 — 바이트가 나가고 들어오기 전에 서는 것들이다.
 * 성공 왕복은 `tests/e2e/attachment.smoke.spec.ts`가 본다.
 *
 * 여기서만 볼 수 있는 것: `requireAuth` 대신 손으로 세운 `gate()`, 본문 상한,
 * 그리고 내려받기가 「권한 없음」과 「없음」을 똑같이 404로 떨어뜨리는 것.
 */

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

/** `gate()`가 막아야 하는 네 가지. 하나라도 새면 그 계정이 파일을 올린다. */
const BLOCKED: [string, SessionUser | null][] = [
  ["로그인하지 않은 요청", null],
  ["임시 비밀번호를 아직 안 바꾼 계정", { ...teacher, mustChangePassword: true }],
  ["비활성 계정", { ...teacher, status: "INACTIVE" }],
  ["명단에서 빠진 계정", { ...teacher, deletedAt: new Date("2026-08-01") }],
];

function uploadRequest(body: Uint8Array): Request {
  // Uint8Array<ArrayBufferLike>는 BodyInit에 안 맞는다 — 뒷받침하는 버퍼를 넘긴다.
  return new Request("http://localhost/api/community/attachments?slug=free", {
    method: "POST",
    body: body.buffer as ArrayBuffer,
    headers: { "content-type": "multipart/form-data; boundary=x" },
  });
}

/**
 * 진짜 multipart 본문. 서비스까지 닿는 경로를 보려면 파싱이 통과해야 해서
 * `uploadRequest`와 따로 둔다 — 그쪽은 파싱 앞에서 막히는 문들을 본다.
 */
function multipartRequest(filename: string, bytes: Uint8Array): Request {
  const form = new FormData();
  // Uint8Array<ArrayBufferLike>는 BlobPart에 안 맞는다 — 뒷받침 버퍼를 넘긴다.
  form.append("file", new File([bytes.buffer as ArrayBuffer], filename));
  return new Request("http://localhost/api/community/attachments?slug=secret", {
    method: "POST",
    body: form,
  });
}

/** 아무 바이트나 조금. 파싱까지 가는 경로는 여기서 보지 않는다. */
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
  it.each(BLOCKED)("%s는 401이고 게시판을 묻지도 않는다", async (_label, actor) => {
    getSessionUser.mockResolvedValue(actor);

    const response = await POST(uploadRequest(smallBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "로그인이 필요합니다." });
    expect(getWritableBySlug).not.toHaveBeenCalled();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  /**
   * 이 경로에는 프레임워크 상한이 없다 — `readCappedBody`가 유일한 방어이고,
   * 그것이 없으면 400MB 본문이 앱 컨테이너(mem_limit 512m)를 죽인다.
   */
  it("상한을 넘는 본문은 413이고 아무것도 저장하지 않는다", async () => {
    // 요청 상한은 파일 상한 + 1MB(multipart 여유)다. 그보다 한 바이트 더.
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
    // 권한 판정이 바이트보다 먼저다 — 순서가 뒤집히면 여기가 true가 된다.
    expect(request.bodyUsed).toBe(false);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  /**
   * 익명 게시판의 사진에서 메타데이터를 못 벗기면 서비스가 던지는 코드다.
   * **사전에 빠지면 학생이 「올리지 못했습니다」만 보고 이유를 모른다** — 다시
   * 눌러도 결과가 같은 실패라 그 한 줄로는 할 수 있는 일이 없다.
   */
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

  /**
   * **세 갈래가 같은 404여야 한다.** 갈리면 첨부 id를 훑어 「존재하는 id」를
   * 알아내는 오라클이 된다.
   */
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

  // 이름은 장식이다 — 찾는 데 쓰는 것은 첫 조각뿐이다.
  it("뒤에 붙은 파일 이름은 읽지 않는다", async () => {
    await GET(new Request("http://localhost"), downloadParams("att-1", "아무거나.pdf"));
    expect(getDownload).toHaveBeenCalledWith(teacher, "att-1");
  });

  it("파일 메타데이터와 캐시 헤더를 붙인다", async () => {
    const response = await GET(new Request("http://localhost"), downloadParams("att-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe("3");
    // 권한이 붙은 자료라 프록시가 들고 있으면 안 된다.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain("inline;");
  });
});
