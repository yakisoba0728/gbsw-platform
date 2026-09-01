import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadOverview: vi.fn(),
  loadRanking: vi.fn(),
  loadTeachers: vi.fn(),
  loadRules: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/core/auth/session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/app/(app)/merit/stats/views/overview", () => ({
  loadOverview: mocks.loadOverview,
  OverviewHint: () => null,
  OverviewBody: () => null,
  OverviewSkeleton: () => null,
}));
vi.mock("@/app/(app)/merit/stats/views/ranking", () => ({
  loadRanking: mocks.loadRanking,
  RankingHint: () => null,
  RankingBody: () => null,
  RankingSkeleton: () => null,
}));
vi.mock("@/app/(app)/merit/stats/views/teachers", () => ({
  loadTeachers: mocks.loadTeachers,
  TeachersHint: () => null,
  TeachersBody: () => null,
  TeachersSkeleton: () => null,
}));
vi.mock("@/app/(app)/merit/stats/views/rules", () => ({
  loadRules: mocks.loadRules,
  RulesHint: () => null,
  RulesBody: () => null,
  RulesSkeleton: () => null,
}));

const { default: MeritStatsPage } = await import("@/app/(app)/merit/stats/page");

const actor: SessionUser = {
  id: "admin-1",
  name: "관리자",
  email: "admin@example.com",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

type BranchElement = ReactElement<{
  children: ReactElement<{ promise: unknown }>;
}>;

type PageElement = ReactElement<{
  shell: { hint: BranchElement };
  children: BranchElement;
}>;

function boundaries(value: unknown) {
  if (!isValidElement<PageElement["props"]>(value)) {
    throw new Error("통계 페이지가 React element를 반환하지 않았다");
  }

  return {
    hint: value.props.shell.hint,
    body: value.props.children,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(actor);
  mocks.loadOverview.mockReturnValue(Promise.resolve("overview"));
  mocks.loadRanking.mockReturnValue(Promise.resolve("ranking"));
  mocks.loadTeachers.mockReturnValue(Promise.resolve("teachers"));
  mocks.loadRules.mockReturnValue(Promise.resolve("rules"));
});

describe("상벌점 통계 갈래", () => {
  it("갈래가 바뀌면 힌트와 본문 경계를 새로 만들고 같은 조회를 나눠 쓴다", async () => {
    const views = ["overview", "ranking", "teachers", "rules"] as const;
    const hintKeys = new Set<string>();
    const bodyKeys = new Set<string>();

    for (const view of views) {
      const page = await MeritStatsPage({
        searchParams: Promise.resolve({ view }),
      });
      const { hint, body } = boundaries(page);
      const boundaryKey = JSON.stringify({
        view,
        track: "SCHOOL",
        grade: null,
        classNo: null,
      });

      expect(hint.key).toBe(`hint:${boundaryKey}`);
      expect(body.key).toBe(`body:${boundaryKey}`);
      expect(hint.key).not.toBe(body.key);
      expect(hint.props.children.props.promise).toBe(
        body.props.children.props.promise,
      );

      hintKeys.add(String(hint.key));
      bodyKeys.add(String(body.key));
    }

    expect(hintKeys.size).toBe(views.length);
    expect(bodyKeys.size).toBe(views.length);
    expect(mocks.loadOverview).toHaveBeenCalledTimes(1);
    expect(mocks.loadRanking).toHaveBeenCalledTimes(1);
    expect(mocks.loadTeachers).toHaveBeenCalledTimes(1);
    expect(mocks.loadRules).toHaveBeenCalledTimes(1);
  });
});
