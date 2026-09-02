import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
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

/**
 * 첨부 서비스. **여기가 업로드의 문이다.**
 *
 * 이 경로는 글이 생기기 전에 돌고 서버 액션이 아니다. 그래서 다른 쓰기 경로가
 * 당연히 가지고 있는 문 셋을 스스로 세운다 — 하나라도 빠지면 로그인한 아무나
 * 디스크를 채울 수 있다.
 *
 *   ① 권한     — 그 게시판에 쓸 수 있는가, 첨부를 받는 게시판인가
 *   ② 형식·용량 — `bodySizeLimit`은 라우트 핸들러에 안 걸린다. 재는 곳이 여기뿐이다
 *   ③ 미결 수   — 고아 정리가 "그 사람이 다음에 올릴 때"만 돌기 때문에 필요하다
 *
 * 셋을 **바이트를 쓰기 전에** 통과시킨다.
 *
 * 익명 게시판이면 그 사이에 하나가 더 선다 — 사진의 메타데이터를 벗기는 일이다
 * (`community.exif.ts`). 게시판을 아는 자리가 여기뿐이라 여기서 한다.
 */

/** 고아로 보는 나이. 글쓰기 한 번이 이보다 오래 걸리는 일은 없다. */
const PENDING_TTL_MS = 60 * 60 * 1000;

export type UploadInput = {
  slug: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
};

export type UploadResult = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
};

export async function uploadAttachment(
  actor: SessionUser,
  input: UploadInput,
): Promise<UploadResult> {
  // ① 권한. 던지면 여기서 끝난다 — 아래 어느 줄도 안 돈다.
  const community = await board.getWritableBySlug(actor, input.slug);
  if (!community.allowAttachments) throw new CommunityError("ATTACHMENT_NOT_ALLOWED");

  // ② 형식·용량. 용량은 **원본 길이**로 잰다 — 벗기기가 줄여 준 만큼 더 올릴 수
  // 있게 되면, 20MB 상한이 지키려던 것(요청 하나가 쥐는 메모리)이 흔들린다.
  const verdict = classifyUpload(input.filename, input.mimeType, input.bytes.byteLength);
  if (!verdict.ok) throw new CommunityError(verdict.code);

  // ②′ 사진의 촬영 위치·기기·시각을 벗긴다.
  //
  // **게시판을 가리지 않는다.** 익명 게시판만 벗기면 우회로가 남는다 — 첨부는 글보다
  // 먼저 올라가고 새 글의 `attachToPost`는 올린 사람과 `postId: null`만 보므로, 실명
  // 게시판에 올려 벗기기를 건너뛴 id를 익명 게시판 글에 실어 보내면 그만이다. 그 구멍을 막는
  // 값이 아끼는 값보다 크다: 재인코딩이 아니라 세그먼트를 도려내는 방식이라 비용이
  // 버퍼 한 벌 복사뿐이고, 벗길 것이 없으면 원본 참조가 그대로 돌아와 복사도 없다.
  // 실명 게시판이라고 촬영 위치가 붙어 나갈 이유도 없다.
  //
  // **벗기기가 실패하면 업로드를 실패시킨다.** 조용히 원본을 저장하는 길을 두지
  // 않는 이유는, 그 길이 열려 있으면 첨부가 「벗겨졌거나 아닐 수도 있는 것」이 되어
  // 이 검사가 있으나 마나 해지기 때문이다. 못 알아본 사진 하나를 거절하는 쪽이
  // GPS가 박힌 사진 하나를 통과시키는 쪽보다 싸다.
  //
  // **여기서 한 번만 갈아 끼운다.** 아래 어느 줄도 `input.bytes`를 다시 보면 안
  // 된다 — 벗기면 길이가 줄어드는데 size·감사로그·응답이 원본 길이를 쓰면 DB가
  // 말하는 크기와 디스크의 파일이 어긋난다.
  let bytes = input.bytes;
  if (verdict.mimeType.startsWith("image/")) {
    const stripped = stripImageMetadata(bytes);
    if (!stripped.ok) throw new CommunityError(stripped.code);
    bytes = stripped.bytes;
  }

  // ③ 미결 수. 정리를 먼저 돌려 방금 만료된 것이 상한을 차지하지 않게 한다.
  await sweepMyOrphans(actor);

  const storageKey = newStorageKey();

  // DB 먼저, 디스크는 커밋 뒤. **순서를 뒤집으면 파일이 영구히 샌다** —
  // 트랜잭션 안에서 파일을 쓰면 감사 기록이나 커밋이 실패했을 때 행은 사라지고
  // 파일만 남는데, 고아 정리는 CommunityAttachment 행을 훑으므로 그 파일을
  // 영영 못 찾는다.
  //
  // 이 순서가 남기는 것은 "행은 있고 파일이 없는" 짧은 창뿐이고, 그건 내려받기
  // 라우트가 ENOENT → 404로 정직하게 답한다. 5MB 쓰기가 Postgres 커넥션을 쥔
  // 채 돌지 않는 것은 덤이다.
  const { id, createdAt } = await withTransaction(async (tx) => {
    // 같은 사용자의 count+create를 한 줄로 세운다. 상한 검사를 트랜잭션 밖에서
    // 하면 9개에서 들어온 병렬 요청들이 모두 통과해 디스크 한도를 우회한다.
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

  try {
    // **경로 계산이 행의 createdAt을 쓴다.** 읽을 때도 같은 값을 쓰므로 둘이
    // 어긋날 수 없다 — 지금 시각을 다시 재면 자정을 넘기는 순간 못 찾는다.
    await writeAttachment(storageKey, createdAt, bytes);
  } catch (error) {
    // 쓰기가 실패했으면 가리킬 것이 없는 행이다. 최선을 다해 지우고 올린다 —
    // 이 정리가 실패해도 남는 것은 행 하나뿐이라 고아 정리가 나중에 걷어 간다.
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

/**
 * 이 사용자의 고아와, 계정이 완전히 삭제돼 uploaderUserId가 null인 고아를 지운다.
 * 크론 없이 다음 업로드 때마다 수렴한다.
 * **실패해도 삼킨다** — 청소가 본 일을 막으면 안 된다.
 */
async function sweepMyOrphans(actor: SessionUser): Promise<void> {
  try {
    const stale = await repo.listStalePending(
      actor.id,
      new Date(Date.now() - PENDING_TTL_MS),
    );
    if (stale.length === 0) return;

    await withTransaction(async (tx) => {
      await repo.deleteAttachments(
        stale.map((attachment) => attachment.id),
        tx,
      );
      for (const attachment of stale) {
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
    });
    for (const attachment of stale) {
      await deleteAttachment(attachment.storageKey, attachment.createdAt);
    }
  } catch {
    // 청소 실패는 업로드를 막지 않는다.
  }
}

export type Download = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  inline: boolean;
};

/** 글에 붙기 전 첨부의 소유권 거부. 감사 실패가 원래 거부를 바꾸지 않는다. */
async function denyOwnership(
  actor: SessionUser,
  action: string,
  attachmentId: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "CommunityAttachment",
      targetId: attachmentId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

export async function getDownload(
  actor: SessionUser,
  attachmentId: string,
): Promise<Download> {
  const attachment = await repo.findAttachmentForDownload(attachmentId);
  if (!attachment) throw new CommunityError("ATTACHMENT_NOT_FOUND");

  if (attachment.post === null) {
    // 아직 글에 안 붙은 첨부. 글쓰기 화면의 미리보기가 이 길로 온다.
    // **올린 본인만** — 게시판 권한으로는 가릴 수 없는 상태다.
    if (attachment.uploaderUserId === null || attachment.uploaderUserId !== actor.id) {
      await denyOwnership(actor, "community:attachment:read", attachmentId);
    }
  } else {
    // 지워진 글의 첨부는 없는 것으로 친다 — 글이 안 보이는데 첨부만 열리면 안 된다.
    if (attachment.post.deletedAt) throw new CommunityError("ATTACHMENT_NOT_FOUND");
    // 게시판 읽기 권한을 다시 묻는다. 첨부 id만 알면 열리는 길을 만들지 않는다.
    await board.getReadableBySlug(actor, attachment.post.community.slug);
  }

  // 저장할 때 정한 타입을 그대로 믿지 않고 확장자로 다시 판정한다 — 허용
  // 목록이 좁아지면(svg를 실수로 넣었다가 빼면) 이미 올라온 파일도 함께
  // octet-stream 내려받기로 떨어진다. 막는 것이 아니라 인라인으로 안 여는 것이다.
  const verdict = classifyUpload(attachment.filename, attachment.mimeType, attachment.size);
  const inline = verdict.ok && verdict.inline;
  const mimeType = verdict.ok ? verdict.mimeType : "application/octet-stream";

  return {
    bytes: await readAttachment(attachment.storageKey, attachment.createdAt),
    filename: attachment.filename,
    mimeType,
    inline,
  };
}
