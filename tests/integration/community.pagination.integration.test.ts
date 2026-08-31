import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { prisma } from "@/core/db/client";
import { listPostPage } from "@/modules/community/post.service";

vi.mock("server-only", () => ({}));

const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const userId = `community-page-user-${suffix}`;
const communityId = `community-page-${suffix}`;
const slug = `page-${suffix}`;
const postIds = Array.from(
  { length: 25 },
  (_, index) => `community-page-${suffix}-${String(index).padStart(2, "0")}`,
);

const actor: SessionUser = {
  id: userId,
  name: "페이지 정렬 관리자",
  email: `community-page-${suffix}@example.invalid`,
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

describe("게시판 offset 페이지 정렬", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        phone: `012-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    await prisma.community.create({
      data: {
        id: communityId,
        slug,
        name: "페이지 정렬 게시판",
        readRoles: [],
        writeRoles: [],
      },
    });
    await prisma.communityPost.createMany({
      data: postIds.map((id, index) => ({
        id,
        communityId,
        title: `글 ${index}`,
        body: "같은 시각에 만들어진 글",
        authorUserId: actor.id,
        authorName: actor.name,
        authorRole: "ADMIN",
        createdAt: new Date("2030-01-01T00:00:00.000Z"),
      })),
    });
  });

  afterAll(async () => {
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: actor.id } });
  });

  it("createdAt이 모두 같아도 두 페이지가 id 내림차순으로 끊김 없이 이어진다", async () => {
    const [first, second] = await Promise.all([
      listPostPage(actor, slug, 1),
      listPostPage(actor, slug, 2),
    ]);

    const visibleIds = [...first.posts, ...second.posts].map((post) => post.id);
    expect(visibleIds).toEqual([...postIds].reverse());
    expect(new Set(visibleIds).size).toBe(postIds.length);
  });
});
