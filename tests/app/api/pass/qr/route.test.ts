import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const getSessionUser = vi.fn<() => Promise<SessionUser | null>>();
const getMyStudentQr = vi.fn();

vi.mock("@/core/auth/session", () => ({ getSessionUser }));
vi.mock("@/modules/pass/request.service", () => ({ getMyStudentQr }));

const { GET } = await import("@/app/api/pass/qr/route");

const student: SessionUser = {
  id: "u-student",
  name: "테스트 학생",
  email: "student@example.invalid",
  role: "STUDENT",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

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
});
