import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

vi.mock("server-only", () => ({}));

const { attachToPost } = await import("@/modules/community/community.repo");

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const phoneDigits = [...suffix]
  .map((digit) => String(Number.parseInt(digit, 16) % 10))
  .join("");
const userId = `attachment-reattach-user-${suffix}`;
const otherUserId = `attachment-reattach-other-${suffix}`;
const communityId = `attachment-reattach-community-${suffix}`;
const postId = `attachment-reattach-post-${suffix}`;
const otherPostId = `attachment-reattach-other-post-${suffix}`;
const attachedId = `attachment-reattach-attached-${suffix}`;
const pendingId = `attachment-reattach-pending-${suffix}`;
const otherPostAttachmentId = `attachment-reattach-other-post-file-${suffix}`;
const otherUserAttachmentId = `attachment-reattach-other-user-file-${suffix}`;

describe("글 수정 첨부 다시 붙이기", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          name: "첨부 수정 학생",
          email: `attachment-reattach-${suffix}@example.invalid`,
          phone: `010-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4, 8)}`,
          role: "STUDENT",
          status: "ACTIVE",
        },
        {
          id: otherUserId,
          name: "다른 첨부 학생",
          email: `attachment-reattach-other-${suffix}@example.invalid`,
          phone: `011-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4, 8)}`,
          role: "STUDENT",
          status: "ACTIVE",
        },
      ],
    });
    await prisma.community.create({
      data: {
        id: communityId,
        slug: `attachment-reattach-${suffix}`,
        name: "첨부 수정 통합테스트",
        readRoles: ["STUDENT"],
        writeRoles: ["STUDENT"],
        allowAttachments: true,
      },
    });
    await prisma.communityPost.createMany({
      data: [
        {
          id: postId,
          communityId,
          title: "첨부 수정",
          body: "본문",
          authorUserId: userId,
          authorName: "첨부 수정 학생",
          authorRole: "STUDENT",
        },
        {
          id: otherPostId,
          communityId,
          title: "다른 글",
          body: "본문",
          authorUserId: userId,
          authorName: "첨부 수정 학생",
          authorRole: "STUDENT",
        },
      ],
    });
    await prisma.communityAttachment.createMany({
      data: [
        {
          id: attachedId,
          postId,
          uploaderUserId: userId,
          storageKey: `${suffix}attached`,
          filename: "기존.txt",
          mimeType: "text/plain",
          size: 1,
        },
        {
          id: pendingId,
          uploaderUserId: userId,
          storageKey: `${suffix}pending`,
          filename: "새파일.txt",
          mimeType: "text/plain",
          size: 1,
        },
        {
          id: otherPostAttachmentId,
          postId: otherPostId,
          uploaderUserId: userId,
          storageKey: `${suffix}otherpost`,
          filename: "다른글.txt",
          mimeType: "text/plain",
          size: 1,
        },
        {
          id: otherUserAttachmentId,
          uploaderUserId: otherUserId,
          storageKey: `${suffix}otheruser`,
          filename: "남의파일.txt",
          mimeType: "text/plain",
          size: 1,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.communityAttachment.deleteMany({
      where: { uploaderUserId: { in: [userId, otherUserId] } },
    });
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it("같은 postId인 행도 updateMany count에 들어간다", async () => {
    await expect(
      attachToPost([attachedId, pendingId], postId, userId),
    ).resolves.toBe(2);

    const rows = await prisma.communityAttachment.findMany({
      where: { id: { in: [attachedId, pendingId] } },
      select: { id: true, postId: true },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.postId === postId)).toBe(true);
  });

  it("다른 글에 붙은 내 첨부와 남이 올린 첨부는 세거나 옮기지 않는다", async () => {
    await expect(
      attachToPost(
        [otherPostAttachmentId, otherUserAttachmentId],
        postId,
        userId,
      ),
    ).resolves.toBe(0);

    await expect(
      prisma.communityAttachment.findUniqueOrThrow({
        where: { id: otherPostAttachmentId },
        select: { postId: true },
      }),
    ).resolves.toEqual({ postId: otherPostId });
    await expect(
      prisma.communityAttachment.findUniqueOrThrow({
        where: { id: otherUserAttachmentId },
        select: { postId: true },
      }),
    ).resolves.toEqual({ postId: null });
  });
});
