import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

vi.mock("server-only", () => ({}));

const { attachToPost, deleteStalePending, lockStalePending } = await import(
  "@/modules/community/community.repo"
);

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const phoneDigits = [...suffix]
  .map((digit) => String(Number.parseInt(digit, 16) % 10))
  .join("");
const userId = `attachment-race-user-${suffix}`;
const communityId = `attachment-race-community-${suffix}`;
const postId = `attachment-race-post-${suffix}`;

/* 청소 대상이 되려면 cutoff보다 오래된 미연결 첨부여야 한다. */
const OLD = new Date("2026-01-01T00:00:00.000Z");
const CUTOFF = new Date("2026-06-01T00:00:00.000Z");

/* 잠금이 실제로 걸리는지 보려면 두 트랜잭션이 겹쳐 있어야 한다. */
const TX_TIMEOUT_MS = 20_000;
const HOLD_MS = 300;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function freshPending(id: string): Promise<void> {
  await prisma.communityAttachment.create({
    data: {
      id,
      uploaderUserId: userId,
      storageKey: `${suffix}${id.slice(-8)}`,
      filename: "미결.txt",
      mimeType: "text/plain",
      size: 1,
      createdAt: OLD,
    },
  });
}

describe("첨부 청소와 글 연결의 실제 경쟁", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        name: "첨부 경쟁 학생",
        email: `attachment-race-${suffix}@example.invalid`,
        phone: `010-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4, 8)}`,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    await prisma.community.create({
      data: {
        id: communityId,
        slug: `attachment-race-${suffix}`,
        name: "첨부 경쟁 통합테스트",
        readRoles: ["STUDENT"],
        writeRoles: ["STUDENT"],
        allowAttachments: true,
      },
    });
    await prisma.communityPost.create({
      data: {
        id: postId,
        communityId,
        title: "첨부 경쟁",
        body: "본문",
        authorUserId: userId,
        authorName: "첨부 경쟁 학생",
        authorRole: "STUDENT",
      },
    });
  });

  afterEach(async () => {
    await prisma.communityAttachment.deleteMany({ where: { uploaderUserId: userId } });
  });

  afterAll(async () => {
    await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  // 이것이 원래 결함이다. 예전에는 목록을 트랜잭션 밖에서 읽어, 그사이 글에 붙은
  // 첨부도 과거 id 목록만으로 지워졌다.
  it("연결이 먼저 커밋되면 청소는 그 첨부를 잠금 단계에서 제외한다", async () => {
    const id = `attachment-race-attached-${suffix}`;
    await freshPending(id);

    const attachDone = deferred();
    const release = deferred();

    const attaching = prisma.$transaction(
      async (tx) => {
        const count = await attachToPost([id], postId, userId, tx);
        attachDone.resolve();
        // 커밋을 붙들어 청소가 이 행의 잠금을 기다리게 한다.
        await release.promise;
        return count;
      },
      { timeout: TX_TIMEOUT_MS },
    );

    await attachDone.promise;

    const sweeping = prisma.$transaction(
      async (tx) => {
        const locked = await lockStalePending(userId, CUTOFF, tx);
        const removed = locked.length
          ? await deleteStalePending(
              locked.map((row) => row.id),
              CUTOFF,
              tx,
            )
          : [];
        return { locked, removed };
      },
      { timeout: TX_TIMEOUT_MS },
    );

    const timer = setTimeout(release.resolve, HOLD_MS);
    const [{ locked, removed }, attachedCount] = await Promise.all([
      sweeping,
      attaching,
    ]);
    clearTimeout(timer);

    expect(attachedCount).toBe(1);
    // FOR UPDATE가 커밋을 기다린 뒤 WHERE를 다시 본다 — postId가 채워져 빠진다.
    expect(locked).toEqual([]);
    expect(removed).toEqual([]);

    await expect(
      prisma.communityAttachment.findUniqueOrThrow({
        where: { id },
        select: { postId: true },
      }),
    ).resolves.toEqual({ postId });
  });

  it("청소가 먼저 커밋되면 연결은 0건이 되어 글 저장이 되돌려진다", async () => {
    const id = `attachment-race-swept-${suffix}`;
    await freshPending(id);

    const sweepDone = deferred();
    const release = deferred();

    const sweeping = prisma.$transaction(
      async (tx) => {
        const locked = await lockStalePending(userId, CUTOFF, tx);
        const removed = await deleteStalePending(
          locked.map((row) => row.id),
          CUTOFF,
          tx,
        );
        sweepDone.resolve();
        await release.promise;
        return removed;
      },
      { timeout: TX_TIMEOUT_MS },
    );

    await sweepDone.promise;

    const attaching = prisma.$transaction(
      (tx) => attachToPost([id], postId, userId, tx),
      { timeout: TX_TIMEOUT_MS },
    );

    const timer = setTimeout(release.resolve, HOLD_MS);
    const [removed, attachedCount] = await Promise.all([sweeping, attaching]);
    clearTimeout(timer);

    expect(removed).toEqual([id]);
    // 서비스는 요청 건수와 다르면 ATTACHMENT_NOT_FOUND로 글 저장을 되돌린다.
    expect(attachedCount).toBe(0);

    await expect(
      prisma.communityAttachment.findUnique({ where: { id } }),
    ).resolves.toBeNull();
  });

  // 잠금이 있으므로 여기까지 오지 않지만, id 목록만 믿지 않는다는 것이 이 조건의 값이다.
  it("이미 글에 붙은 id를 넘겨도 삭제 조건이 다시 걸러낸다", async () => {
    const id = `attachment-race-guard-${suffix}`;
    await freshPending(id);
    await prisma.communityAttachment.update({ where: { id }, data: { postId } });

    await expect(
      prisma.$transaction((tx) => deleteStalePending([id], CUTOFF, tx)),
    ).resolves.toEqual([]);

    await expect(
      prisma.communityAttachment.findUnique({ where: { id }, select: { id: true } }),
    ).resolves.toEqual({ id });
  });

  it("cutoff보다 새 첨부는 넘겨도 지워지지 않는다", async () => {
    const id = `attachment-race-recent-${suffix}`;
    await freshPending(id);
    await prisma.communityAttachment.update({
      where: { id },
      data: { createdAt: new Date("2026-08-01T00:00:00.000Z") },
    });

    await expect(
      prisma.$transaction((tx) => deleteStalePending([id], CUTOFF, tx)),
    ).resolves.toEqual([]);
    await expect(
      prisma.communityAttachment.findUnique({ where: { id }, select: { id: true } }),
    ).resolves.toEqual({ id });
  });
});
