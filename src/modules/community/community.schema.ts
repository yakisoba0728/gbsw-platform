import { z } from "zod";
import { ROLES } from "@/core/authz/roles";
import { optionalText } from "@/lib/zod-fields";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_POST = 5;
export const MAX_PENDING_ATTACHMENTS = 10;

export const POSTS_PER_PAGE = 20;

// 도배 방지: 같은 사용자가 한 윈도 안에 올릴 수 있는 글·댓글 수.
export const FLOOD_WINDOW_MS = 10 * 60 * 1000;
export const MAX_POSTS_PER_WINDOW = 3;
export const MAX_COMMENTS_PER_WINDOW = 10;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const sortOrder = z
  .preprocess((v) => (v == null || v === "" ? "0" : v), z.string().trim())
  .pipe(
    z
      .string()
      .regex(/^-?\d+$/, "순서는 정수여야 합니다.")
      .transform(Number)
      .refine((n) => n >= -999 && n <= 999, "순서는 -999~999 사이여야 합니다."),
  );

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

const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== "ADMIN");

const roleList = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.enum(ASSIGNABLE_ROLES)).max(ASSIGNABLE_ROLES.length),
);

const communityFields = {
  name: nameSchema,
  description: optionalText(200),
  readRoles: roleList,
  writeRoles: roleList,
  anonymous: checkbox,
  allowAttachments: checkbox,
  sortOrder,
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
    ...communityFields,
  }),
);

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

export const updateCommunitySchema = refineWriteSubsetRead(
  z.object({
    communityId: z.string().trim().min(1),
    updatedAt: z.iso
      .datetime("다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 저장해 주세요.")
      .transform((value) => new Date(value)),
    ...communityFields,
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

const postTitle = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(200, "제목은 200자를 넘을 수 없습니다.");

// 글·댓글 본문의 앞뒤 공백은 작성자가 입력한 서식으로 보존한다.
const postBody = z
  .string()
  .min(1, "내용을 입력해 주세요.")
  .max(20000, "내용은 20000자를 넘을 수 없습니다.")
  .refine((v) => v.trim().length > 0, "내용을 입력해 주세요.");

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

export function parsePage(value: unknown): number {
  const n = Number(typeof value === "string" ? value : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

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
