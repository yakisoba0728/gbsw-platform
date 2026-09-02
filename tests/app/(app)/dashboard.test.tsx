import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  can: vi.fn(),
  listRecentPosts: vi.fn(),
  getChildMerit: vi.fn(),
  getMyMerit: vi.fn(),
  listMyChildren: vi.fn(),
  listRecentAwards: vi.fn(),
  getMeritSummary: vi.fn(),
  listActivePasses: vi.fn(),
  listPendingPasses: vi.fn(),
  getMyChildPassesAwaitingConsent: vi.fn(),
  getMyLivePasses: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/core/auth/session", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/core/authz/can", () => ({ can: mocks.can }));
vi.mock("@/modules/community/post.service", () => ({
  listRecentPosts: mocks.listRecentPosts,
}));
vi.mock("@/modules/merit/award.service", () => ({
  getChildMerit: mocks.getChildMerit,
  getMyMerit: mocks.getMyMerit,
  listMyChildren: mocks.listMyChildren,
  listRecentAwards: mocks.listRecentAwards,
}));
vi.mock("@/modules/merit/stats.service", () => ({
  getMeritSummary: mocks.getMeritSummary,
  SUMMARY_DAYS: 7,
}));
vi.mock("@/modules/pass/decision.service", () => ({
  listActivePasses: mocks.listActivePasses,
  listPendingPasses: mocks.listPendingPasses,
}));
vi.mock("@/modules/pass/request.service", () => ({
  getMyChildPassesAwaitingConsent: mocks.getMyChildPassesAwaitingConsent,
  getMyLivePasses: mocks.getMyLivePasses,
}));

const { default: DashboardPage } = await import("@/app/(app)/page");

const teacher: SessionUser = {
  id: "teacher-1",
  name: "김교사",
  email: "teacher@example.com",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(teacher);
  mocks.can.mockReturnValue(true);
  mocks.listPendingPasses.mockResolvedValue({ entries: [], total: 0 });
  mocks.listActivePasses.mockResolvedValue({
    total: 1,
    entries: [
      {
        id: "pass-1",
        type: "OVERNIGHT",
        status: "ACTIVE",
        endAt: new Date("2026-09-03T09:00:00.000Z"),
        destination: "서울",
        studentProfile: {
          user: { name: "김학생" },
          enrollments: [
            { grade: 1, classNo: 2, number: 3 },
          ],
        },
      },
    ],
  });
  mocks.listRecentAwards.mockResolvedValue({
    entries: [
      {
        id: "award-1",
        studentProfileId: "student-1",
        studentName: "김학생",
        grade: 1,
        classNo: 2,
        number: 3,
        label: "상쇄",
        status: "ACTIVE",
        kind: "OFFSET",
        points: 10,
      },
    ],
  });
  mocks.listRecentPosts.mockResolvedValue([]);
  mocks.getMeritSummary.mockResolvedValue({
    totals: { awardCount: 1, net: 10 },
  });
});

describe("교사 대시보드", () => {
  it("상쇄점 색과 외박 복귀 날짜를 공용 표시 규칙으로 그린다", async () => {
    const stream = await renderToReadableStream(await DashboardPage());
    await stream.allReady;
    const html = (await new Response(stream).text()).replaceAll("<!-- -->", "");

    expect(html).toContain(
      'class="text-sm font-medium tabular-nums text-green">+10</span>',
    );
    expect(html).toContain("9. 3. 오후 6:00까지");
    expect(html).not.toContain("오후 6:00 복귀");
  });
});
