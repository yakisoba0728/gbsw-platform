import { z } from "zod";
import { ROLES } from "@/core/authz/roles";

/**
 * 서버 액션·라우트 핸들러 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다 — 숫자·불리언 변환도 여기서 한다.
 */

/**
 * 첨부 상한. 라우트 핸들러가 직접 잰다 — bodySizeLimit은 라우트에 안 걸린다.
 *
 * **이 값을 올리면 세 곳이 함께 움직인다.** 앞단 프록시의 본문 상한
 * (`docs/deploy.md`의 nginx `client_max_body_size`·Caddy `request_body`)과
 * 앱 컨테이너의 `mem_limit`이다 — 업로드 한 건이 파일 크기의 서너 배를 잠깐
 * 메모리에 들고 있기 때문이다(받은 바이트 → multipart 파싱 → Buffer 복사).
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_POST = 5;
/**
 * 한 사람이 글에 붙이지 못한 채 들고 있을 수 있는 첨부 수. 고아 정리가
 * "그 사람이 다음에 올릴 때"만 도는지라, 이 상한이 없으면 50분 동안 500개를
 * 올리고 그만두는 계정에게는 정리가 영영 안 돈다.
 */
export const MAX_PENDING_ATTACHMENTS = 10;

/** 글 목록 한 쪽 크기. 감사로그(50)보다 작다 — 글이 세로로 길다. */
export const POSTS_PER_PAGE = 20;

/**
 * 선택 입력 문자열. 빈 문자열은 null로 — 안 그러면 "선택 안 함"과 "빈 값"이 갈린다.
 * 길이 초과는 오류로 낸다: 조용히 잘라내면 내용만 사라지는 실패가 된다.
 * (merit.schema.ts의 같은 이름 헬퍼와 같은 규약이다.)
 */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

/** 체크박스. 안 켜면 FormData에 아예 없어서 null이 온다. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** "3" → 3. 빈 값은 0. */
const sortOrder = z
  .preprocess((v) => (v == null || v === "" ? "0" : v), z.string().trim())
  .pipe(
    z
      .string()
      .regex(/^-?\d+$/, "순서는 정수여야 합니다.")
      .transform(Number)
      .refine((n) => n >= -999 && n <= 999, "순서는 -999~999 사이여야 합니다."),
  );

/**
 * 주소에 쓰는 이름. 소문자 영숫자와 하이픈만 받는다 — 대문자·공백·한글이 들어오면
 * 주소가 인코딩돼 사람이 못 읽고, 대소문자만 다른 게시판 둘이 생길 수 있다.
 */
const slugSchema = z
  .string()
  .trim()
  .min(2, "주소는 2자 이상이어야 합니다.")
  .max(32, "주소는 32자를 넘을 수 없습니다.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "주소는 소문자 영문·숫자·하이픈만 쓸 수 있습니다.");

const nameSchema = z
  .string()
  .trim()
  .min(1, "게시판 이름을 입력해 주세요.")
  .max(50, "게시판 이름은 50자를 넘을 수 없습니다.");

/**
 * 역할 목록. **ADMIN은 못 넣는다** — 교사는 늘 통과하므로 배열에 자리가 없고,
 * 넣을 수 있게 두면 "ADMIN을 뺐으니 교사는 못 본다"는 오해가 생긴다.
 */
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "ADMIN");

const roleList = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.enum(ASSIGNABLE_ROLES)).max(ASSIGNABLE_ROLES.length),
);

/** 권한 두 칸. 못 읽는 곳에 쓰게 두면 자기가 쓴 글을 자기가 못 본다. */
const permissionShape = {
  readRoles: roleList,
  writeRoles: roleList,
};

function refineWriteSubsetRead<T extends { readRoles: string[]; writeRoles: string[] }>(
  schema: z.ZodType<T>,
) {
  return schema.refine(
    (v) => v.writeRoles.every((role) => v.readRoles.includes(role)),
    {
      message: "읽을 수 없는 역할에 글쓰기를 줄 수 없습니다.",
      path: ["writeRoles"],
    },
  );
}

export const createCommunitySchema = refineWriteSubsetRead(
  z.object({
    slug: slugSchema,
    name: nameSchema,
    description: optionalText(200),
    ...permissionShape,
    anonymous: checkbox,
    allowAttachments: checkbox,
    sortOrder,
  }),
);

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

/**
 * 수정은 slug를 받지 않는다 — 스키마에 없으므로 조작된 요청이 보내도 zod가 버린다.
 * 주소가 바뀌면 그동안 붙은 링크가 전부 죽는다.
 */
export const updateCommunitySchema = refineWriteSubsetRead(
  z.object({
    communityId: z.string().trim().min(1),
    updatedAt: z.iso
      .datetime("다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 저장해 주세요.")
      .transform((value) => new Date(value)),
    name: nameSchema,
    description: optionalText(200),
    ...permissionShape,
    anonymous: checkbox,
    allowAttachments: checkbox,
    sortOrder,
  }),
);

export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;

export const deleteCommunitySchema = z.object({
  communityId: z.string().trim().min(1),
  updatedAt: z.iso
    .datetime("다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 시도해 주세요.")
    .transform((value) => new Date(value)),
  reason: optionalText(200),
});

export type DeleteCommunityInput = z.infer<typeof deleteCommunitySchema>;

// ── 글 ────────────────────────────────────────────────────────

const postTitle = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(200, "제목은 200자를 넘을 수 없습니다.");

/**
 * 본문. **trim하지 않는다** — 줄바꿈만 살리는 평문이라 앞뒤 빈 줄도 글쓴이가
 * 넣은 모양이다. 대신 공백만 있는 본문은 거부한다.
 */
const postBody = z
  .string()
  .min(1, "내용을 입력해 주세요.")
  .max(20000, "내용은 20000자를 넘을 수 없습니다.")
  .refine((v) => v.trim().length > 0, "내용을 입력해 주세요.");

/** 폼이 hidden으로 싣는 첨부 id들. 없으면 빈 배열. */
const attachmentIds = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z
    .array(z.string().trim().min(1))
    .max(
      MAX_ATTACHMENTS_PER_POST,
      `첨부는 ${MAX_ATTACHMENTS_PER_POST}개까지 넣을 수 있습니다.`,
    ),
);

export const createPostSchema = z.object({
  slug: slugSchema,
  title: postTitle,
  body: postBody,
  attachmentIds,
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  postId: z.string().trim().min(1),
  updatedAt: z.iso
    .datetime("다른 곳에서 글이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.")
    .transform((value) => new Date(value)),
  title: postTitle,
  body: postBody,
  attachmentIds,
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const deletePostSchema = z.object({
  postId: z.string().trim().min(1),
  reason: optionalText(200),
});

export type DeletePostInput = z.infer<typeof deletePostSchema>;

/** `?page=`. 이상한 값은 조용히 1로 — 목록이 오류 화면이 되면 안 된다. */
export function parsePage(value: unknown): number {
  const n = Number(typeof value === "string" ? value : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

// ── 댓글 ──────────────────────────────────────────────────────

/** 본문. 글과 같은 이유로 trim하지 않고 공백만 있는 것을 거부한다. */
const commentBody = z
  .string()
  .min(1, "댓글을 입력해 주세요.")
  .max(2000, "댓글은 2000자를 넘을 수 없습니다.")
  .refine((v) => v.trim().length > 0, "댓글을 입력해 주세요.");

export const createCommentSchema = z.object({
  postId: z.string().trim().min(1),
  body: commentBody,
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const deleteCommentSchema = z.object({
  commentId: z.string().trim().min(1),
  reason: optionalText(200),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;
