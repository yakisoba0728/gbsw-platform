import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { PassError } from "@/modules/pass/pass.error";
import { user } from "../../../../helpers/session";

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
const getMyStudentQr = vi.fn();

vi.mock("@/core/auth/session", () => ({ getSessionUser }));
vi.mock("@/modules/pass/request.service", () => ({ getMyStudentQr }));

const { GET } = await import("@/app/api/pass/qr/route");

const student = user("STUDENT", "u-student", {
  name: "테스트 학생",
  email: "student@example.invalid",
});

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue(student);
  getMyStudentQr.mockReset().mockResolvedValue({
    qr: { size: 21, d: "M0 0" },
    validUntil: "2026-08-31T00:00:20.000Z",
  });
});

describe("GET /api/pass/qr", () => {
  it("비밀번호 강제 변경 중인 세션에는 학생증 QR을 발급하지 않는다", async () => {
    getSessionUser.mockResolvedValue({ ...student, mustChangePassword: true });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    expect(getMyStudentQr).not.toHaveBeenCalled();
  });

  it("정상 활성 학생 세션은 캐시 없이 QR을 받는다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, must-revalidate");
    expect(getMyStudentQr).toHaveBeenCalledWith(student);
  });

  // 화면은 4xx를 종료 상태로 읽고 재시도를 멈춘다. 재학이 끝난 학생의 열린 탭이
  // 3.3초마다 되묻지 않게 하는 것이 이 응답의 목적이다.
  it("재학 자격이 없으면 사유를 담아 403으로 끝낸다", async () => {
    getMyStudentQr.mockRejectedValue(new PassError("NOT_ENROLLED"));

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "NOT_ENROLLED" });
  });

  it("권한 위반은 그대로 403 FORBIDDEN이다", async () => {
    getMyStudentQr.mockRejectedValue(new ForbiddenError("pass:request"));

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
  });

  it("그 밖의 오류는 삼키지 않는다", async () => {
    getMyStudentQr.mockRejectedValue(new Error("boom"));

    await expect(GET()).rejects.toThrow("boom");
  });
});
