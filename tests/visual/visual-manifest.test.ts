import { describe, expect, it } from "vitest";
import {
  assertUniqueVisualRoutes,
  buildVisualRedirectContracts,
  buildVisualRoutes,
  VISUAL_ROLES,
  visualHost,
  type VisualFixtureManifest,
} from "./visual.manifest";

const FIXTURES: VisualFixtureManifest = {
  studentProfileId: "student-profile",
  studentUserId: "student-user",
  passId: "pass-approved",
  communityId: "community-id",
  communitySlug: "school-news",
  postId: "post-detail",
  editablePostIds: {
    teacher: "post-teacher",
    student: "post-student",
    parent: "post-parent",
  },
};

describe("visual manifest", () => {
  it("역할과 버전을 hostname에서 함께 격리한다", () => {
    expect(visualHost("baseline", "teacher")).toBe("teacher.main.localhost");
    expect(visualHost("redesign", "parent")).toBe("parent.redesign.localhost");
  });

  it("네 역할, 인증 화면, 동적 상세를 한 canonical 목록에 둔다", () => {
    const routes = buildVisualRoutes(FIXTURES);
    assertUniqueVisualRoutes(routes);
    expect(new Set(routes.map((route) => route.role))).toEqual(new Set(VISUAL_ROLES));
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "login", session: "anonymous" }),
        expect.objectContaining({ id: "register", session: "anonymous" }),
        expect.objectContaining({ id: "change-password" }),
        expect.objectContaining({ path: "/pass/pass-approved" }),
        expect.objectContaining({ path: "/community/school-news/post-parent/edit" }),
      ]),
    );
  });

  it("이전 주소를 캡처 목록 대신 redirect 계약으로 남긴다", () => {
    expect(buildVisualRedirectContracts(FIXTURES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "/admin/invites", permanent: false }),
        expect.objectContaining({
          from: "/merit/students/student-profile?track=SCHOOL",
          permanent: true,
        }),
      ]),
    );
  });

  it("동적 ID가 경로를 탈출하지 못하게 한다", () => {
    expect(() =>
      buildVisualRoutes({ ...FIXTURES, passId: "../../admin" }),
    ).toThrow(/안전한 URL segment/);
  });
});
