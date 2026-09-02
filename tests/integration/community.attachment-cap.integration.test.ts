import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import { user } from "../helpers/session";

vi.mock("server-only", () => ({}));

const previousUploadDir = process.env.UPLOAD_DIR;
const uploadDir = await mkdtemp(path.join(tmpdir(), "gbsw-attachment-cap-"));
process.env.UPLOAD_DIR = uploadDir;

const { CommunityError } = await import("@/modules/community/community.error");
const { uploadAttachment } = await import(
  "@/modules/community/attachment.service"
);

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = `attachment-cap-user-${suffix}`;
const communitySlug = `attachment-cap-${suffix}`;

const actor = user("STUDENT", userId, {
  name: "첨부 상한 학생",
  email: `attachment-cap-${suffix}@example.invalid`,
});

describe("미결 첨부 계정당 상한 경쟁", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: actor.name,
        email: actor.email,
        phone: "010-8112-0001",
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    await prisma.community.create({
      data: {
        slug: communitySlug,
        name: "첨부 상한 통합테스트",
        readRoles: ["STUDENT"],
        writeRoles: ["STUDENT"],
        allowAttachments: true,
      },
    });

    await prisma.communityAttachment.createMany({
      data: Array.from({ length: 9 }, (_, index) => ({
        uploaderUserId: userId,
        storageKey: `${suffix}${index.toString(16).padStart(20, "0")}`,
        filename: `기존-${index}.txt`,
        mimeType: "text/plain",
        size: 1,
      })),
    });
  });

  afterAll(async () => {
    await prisma.communityAttachment.deleteMany({ where: { uploaderUserId: userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.community.deleteMany({ where: { slug: communitySlug } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await rm(uploadDir, { recursive: true, force: true });

    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
  });

  it("9개에서 병렬 업로드해도 하나만 성공해 최종 10개다", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        uploadAttachment(actor, {
          slug: communitySlug,
          filename: `병렬-${index}.txt`,
          bytes: Buffer.from("x"),
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(7);
    expect(
      rejected.every(
        ({ reason }) =>
          reason instanceof CommunityError &&
          reason.message === "ATTACHMENT_PENDING_LIMIT",
      ),
    ).toBe(true);

    await expect(
      prisma.communityAttachment.count({
        where: { uploaderUserId: userId, postId: null },
      }),
    ).resolves.toBe(10);
  });
});
