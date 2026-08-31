import { expect, test } from "@playwright/test";
import { VISUAL_TARGETS, visualOrigin, type VisualRole } from "./visual.manifest";
import {
  loadVisualFixtureManifest,
  resolveVisualRuntime,
  visualStorageStatePath,
} from "./visual.runtime";

const runtime = resolveVisualRuntime();
const fixture = loadVisualFixtureManifest(runtime);
const checks: readonly { role: VisualRole; path: string; label: string }[] = [
  { role: "teacher", path: `/pass/${fixture.passId}`, label: "출입증 상세" },
  { role: "student", path: `/pass/${fixture.passId}`, label: "학생 출입증 상세" },
  { role: "parent", path: `/pass/${fixture.passId}`, label: "학부모 출입증 상세" },
  {
    role: "teacher",
    path: `/community/${fixture.communitySlug}/${fixture.postId}`,
    label: "공용 게시글 상세",
  },
  {
    role: "teacher",
    path: `/community/${fixture.communitySlug}/${fixture.editablePostIds.teacher}/edit`,
    label: "교사 소유 게시글 수정",
  },
  {
    role: "student",
    path: `/community/${fixture.communitySlug}/${fixture.editablePostIds.student}/edit`,
    label: "학생 소유 게시글 수정",
  },
  {
    role: "parent",
    path: `/community/${fixture.communitySlug}/${fixture.editablePostIds.parent}/edit`,
    label: "학부모 소유 게시글 수정",
  },
  {
    role: "admin",
    path: `/admin/users/${fixture.studentUserId}`,
    label: "계정 상세",
  },
  {
    role: "admin",
    path: `/admin/community/${fixture.communityId}`,
    label: "커뮤니티 설정 상세",
  },
  {
    role: "teacher",
    path: `/students/${fixture.studentProfileId}?tab=profile`,
    label: "학생 상세",
  },
];

for (const target of VISUAL_TARGETS) {
  test(`${target} 동적 fixture 경로`, async ({ browser }) => {
    for (const check of checks) {
      const origin = visualOrigin(target, check.role, runtime.ports);
      const context = await browser.newContext({
        storageState: visualStorageStatePath(runtime, target, check.role),
      });
      try {
        const response = await context.request.get(new URL(check.path, origin).href, {
          maxRedirects: 0,
        });
        expect(response.status(), `${target} ${check.label}: ${check.path}`).toBe(200);
      } finally {
        await context.close();
      }
    }
  });
}
