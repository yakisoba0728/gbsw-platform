import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const mocks = vi.hoisted(() => ({
  listPendingPasses: vi.fn(),
  listActivePasses: vi.fn(),
  listStudentsForIssue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/pass/decision.service", () => ({
  listPendingPasses: mocks.listPendingPasses,
  listActivePasses: mocks.listActivePasses,
  listStudentsForIssue: mocks.listStudentsForIssue,
}));
// 결재·부여·취소는 서버 액션을 쓰는 클라이언트 조각이라 이 시험의 관심 밖이다.
vi.mock("@/app/(app)/pass/decision-panel", () => ({ DecisionPanel: () => null }));
vi.mock("@/app/(app)/pass/issue-form", () => ({ IssueForm: () => null }));
vi.mock("@/app/(app)/pass/cancel-button", () => ({ CancelButton: () => null }));

const { AdminView } = await import("@/app/(app)/pass/admin-view");

const admin: SessionUser = {
  id: "u-admin",
  name: "김교사",
  email: "admin@gbsw.hs.kr",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

function passRow(id: string) {
  return {
    id,
    type: "OUTING",
    status: "REQUESTED",
    startAt: new Date("2026-09-02T01:00:00.000Z"),
    endAt: new Date("2026-09-02T09:00:00.000Z"),
    destination: "병원",
    reason: "진료",
    decisionNote: null,
    consentByProxy: false,
    consentedByName: null,
    consentedAt: null,
    studentProfile: {
      user: { name: "김학생" },
      enrollments: [{ grade: 1, classNo: 2, number: 3 }],
    },
  };
}

function page(ids: string[], total: number, nextCursor: string | null) {
  return { entries: ids.map(passRow), total, nextCursor };
}

async function render(node: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return (await new Response(stream).text()).replaceAll("<!-- -->", "");
}

async function view(props: {
  pendingCursors?: string[];
  activeCursors?: string[];
}): Promise<string> {
  return render(
    await AdminView({
      actor: admin,
      approved: false,
      pendingCursors: props.pendingCursors ?? [],
      activeCursors: props.activeCursors ?? [],
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStudentsForIssue.mockResolvedValue([]);
  mocks.listPendingPasses.mockResolvedValue(page(["p1"], 1, null));
  mocks.listActivePasses.mockResolvedValue(page(["a1"], 1, null));
});

describe("교사 출입증 현황의 커서 페이지", () => {
  it("한 페이지에 다 들어가면 이동 줄이 없다", async () => {
    const html = await view({});

    expect(html).not.toContain("결재 대기 페이지");
    expect(html).not.toContain("지금 나가 있는 학생 페이지");
    expect(html).toContain("1건");
    expect(html).toContain("1명");
  });

  it("다음 링크는 자기 목록의 커서만 늘리고 다른 목록의 자리는 그대로 둔다", async () => {
    mocks.listPendingPasses.mockResolvedValue(page(["p1"], 120, "p50"));
    mocks.listActivePasses.mockResolvedValue(page(["a1"], 300, "a50"));

    const html = await view({ activeCursors: ["a10", "a20"] });

    expect(html).toContain('href="/pass?activeCursor=a10.a20&amp;pendingCursor=p50"');
    expect(html).toContain('href="/pass?activeCursor=a10.a20.a50"');
  });

  it("커서는 서비스에 목록별로 따로 넘어간다", async () => {
    await view({ pendingCursors: ["p10", "p20"], activeCursors: ["a10"] });

    expect(mocks.listPendingPasses).toHaveBeenCalledWith(
      admin,
      expect.any(Date),
      "p20",
    );
    expect(mocks.listActivePasses).toHaveBeenCalledWith(
      admin,
      expect.any(Date),
      "a10",
    );
  });

  it("이전은 자취를 하나 버리고, 첫 페이지로 돌아가면 파라미터가 사라진다", async () => {
    mocks.listPendingPasses.mockResolvedValue(page(["p51"], 120, "p100"));

    const html = await view({ pendingCursors: ["p50"] });

    // 자취가 하나뿐이면 「이전」은 파라미터 없는 첫 페이지다.
    expect(html).toContain('href="/pass"');
    expect(html).toContain('href="/pass?pendingCursor=p50.p100"');
  });

  it("두 번째 페이지의 이전은 앞 커서로 되돌아간다", async () => {
    mocks.listPendingPasses.mockResolvedValue(page(["p101"], 120, null));

    const html = await view({ pendingCursors: ["p50", "p100"] });

    expect(html).toContain('href="/pass?pendingCursor=p50"');
    expect(html).toContain("결재 대기 페이지");
  });

  it("보고 있는 범위와 전체 건수를 함께 보여 준다", async () => {
    mocks.listPendingPasses.mockResolvedValue(
      page(
        Array.from({ length: 50 }, (_, index) => `p${index + 51}`),
        327,
        "p100",
      ),
    );

    const html = await view({ pendingCursors: ["p50"] });

    expect(html).toContain("51~100번째 / 전체 327건");
  });

  it("지나간 커서가 가리키는 페이지가 비면 처음으로 돌아갈 길을 준다", async () => {
    mocks.listPendingPasses.mockResolvedValue(page([], 12, null));

    const html = await view({ pendingCursors: ["p50"], activeCursors: ["a10"] });

    expect(html).toContain("이 페이지에 남은 항목이 없습니다.");
    expect(html).toContain("처음으로");
    expect(html).toContain('href="/pass?activeCursor=a10"');
  });

  it("첫 페이지가 비면 지금까지의 빈 문구 그대로다", async () => {
    mocks.listPendingPasses.mockResolvedValue(page([], 0, null));
    mocks.listActivePasses.mockResolvedValue(page([], 0, null));

    const html = await view({});

    expect(html).toContain("결재할 신청이 없습니다.");
    expect(html).toContain("지금 나가 있는 학생이 없습니다.");
    expect(html).not.toContain("처음으로");
  });
});
