import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { CommunityError } from "./community.error";
import { stripImageMetadata } from "./community.exif";
import * as repo from "./community.repo";
import { MAX_PENDING_ATTACHMENTS } from "./community.schema";
import {
  classifyUpload,
  deleteAttachment,
  newStorageKey,
  readAttachment,
  writeAttachment,
} from "./community.storage";

const PENDING_TTL_MS = 60 * 60 * 1000;

type UploadInput = {
  slug: string;
  filename: string;
  bytes: Buffer;
};

type UploadResult = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
};

export async function uploadAttachment(
  actor: SessionUser,
  input: UploadInput,
): Promise<UploadResult> {
  const community = await board.getWritableBySlug(actor, input.slug);
  if (!community.allowAttachments) throw new CommunityError("ATTACHMENT_NOT_ALLOWED");

  const verdict = classifyUpload(input.filename, input.bytes.byteLength);
  if (!verdict.ok) throw new CommunityError(verdict.code);

  // 실명 게시판에 올린 첨부도 익명 글로 이동할 수 있으므로 모두 처리한다.
  let bytes = input.bytes;
  if (verdict.mimeType.startsWith("image/")) {
    const stripped = stripImageMetadata(bytes);
    if (!stripped.ok) throw new CommunityError(stripped.code);
    bytes = stripped.bytes;
  }

  await sweepMyOrphans(actor);

  const storageKey = newStorageKey();

  const { id, createdAt } = await withTransaction(async (tx) => {
    // 같은 계정의 동시 업로드가 미결 첨부 상한을 넘지 않게 직렬화한다.
    await repo.lockAttachmentUploader(actor.id, tx);
    if ((await repo.countPending(actor.id, tx)) >= MAX_PENDING_ATTACHMENTS) {
      throw new CommunityError("ATTACHMENT_PENDING_LIMIT");
    }

    const created = await repo.createAttachment(
      {
        uploaderUserId: actor.id,
        storageKey,
        filename: input.filename,
        mimeType: verdict.mimeType,
        size: bytes.byteLength,
      },
      tx,
    );

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:attachment:create",
        targetType: "CommunityAttachment",
        targetId: created.id,
        metadata: {
          slug: community.slug,
          filename: input.filename,
          size: bytes.byteLength,
          mimeType: verdict.mimeType,
        },
      },
      tx,
    );

    return created;
  });

  // 롤백으로 파일만 남지 않도록 행을 커밋한 뒤 기록된 날짜 경로에 쓴다.
  try {
    await writeAttachment(storageKey, createdAt, bytes);
  } catch (error) {
    await withTransaction(async (tx) => {
      await repo.deleteAttachments([id], tx);
      await recordAudit(
        {
          actorUserId: actor.id,
          actorName: actor.name,
          action: "community:attachment:delete",
          targetType: "CommunityAttachment",
          targetId: id,
          metadata: {
            slug: community.slug,
            filename: input.filename,
            writeFailed: true,
          },
        },
        tx,
      );
    }).catch(() => {});
    throw error;
  }

  return {
    id,
    filename: input.filename,
    size: bytes.byteLength,
    mimeType: verdict.mimeType,
  };
}

async function sweepMyOrphans(actor: SessionUser): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PENDING_TTL_MS);

    // 조회와 삭제가 같은 트랜잭션 안에서 같은 조건을 본다 — 밖에서 목록을 만들면
    // 그사이 글에 붙은 첨부의 파일까지 지운다.
    const swept = await withTransaction(async (tx) => {
      const stale = await repo.lockStalePending(actor.id, cutoff, tx);
      if (stale.length === 0) return [];

      const deleted = new Set(
        await repo.deleteStalePending(
          stale.map((attachment) => attachment.id),
          cutoff,
          tx,
        ),
      );
      const removed = stale.filter((attachment) => deleted.has(attachment.id));

      for (const attachment of removed) {
        await recordAudit(
          {
            actorUserId: actor.id,
            actorName: actor.name,
            action: "community:attachment:delete",
            targetType: "CommunityAttachment",
            targetId: attachment.id,
            metadata: {
              filename: attachment.filename,
              cleanup: true,
              orphaned: attachment.uploaderUserId !== actor.id,
            },
          },
          tx,
        );
      }

      return removed;
    });

    // 롤백돼도 파일은 돌아오지 않으므로 커밋 뒤에, 실제로 지워진 행만 지운다.
    for (const attachment of swept) {
      await deleteAttachment(attachment.storageKey, attachment.createdAt);
    }
  } catch {
    // 청소 실패는 업로드를 막지 않는다.
  }
}

type Download = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  inline: boolean;
};

export async function getDownload(
  actor: SessionUser,
  attachmentId: string,
): Promise<Download> {
  const attachment = await repo.findAttachmentForDownload(attachmentId);
  if (!attachment) throw new CommunityError("ATTACHMENT_NOT_FOUND");

  if (attachment.post === null) {
    if (attachment.uploaderUserId === null || attachment.uploaderUserId !== actor.id) {
      await denyAccess(actor, "community:attachment:read", {
        targetType: "CommunityAttachment",
        targetId: attachmentId,
        actorName: actor.name,
      });
    }
  } else {
    if (attachment.post.deletedAt) throw new CommunityError("ATTACHMENT_NOT_FOUND");
    await board.getReadableBySlug(actor, attachment.post.community.slug);
  }

  const verdict = classifyUpload(attachment.filename, attachment.size);
  const inline = verdict.ok && verdict.inline;
  const mimeType = verdict.ok ? verdict.mimeType : "application/octet-stream";

  return {
    bytes: await readAttachment(attachment.storageKey, attachment.createdAt),
    filename: attachment.filename,
    mimeType,
    inline,
  };
}
