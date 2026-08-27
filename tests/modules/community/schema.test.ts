import { describe, expect, it } from "vitest";
import {
  createCommunitySchema,
  updateCommunitySchema,
} from "@/modules/community/community.schema";

const base = {
  slug: "notice",
  name: "공지사항",
  description: "",
  readRoles: ["STUDENT", "PARENT"],
  writeRoles: [],
  anonymous: "",
  allowAttachments: "on",
  sortOrder: "0",
};

describe("createCommunitySchema", () => {
  it("정상 입력을 통과시킨다", () => {
    const parsed = createCommunitySchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.slug).toBe("notice");
    // 빈 설명은 null로 떨어진다 — "선택 안 함"과 "빈 값"이 갈리지 않게.
    expect(parsed.data.description).toBeNull();
    expect(parsed.data.anonymous).toBe(false);
    expect(parsed.data.allowAttachments).toBe(true);
    expect(parsed.data.sortOrder).toBe(0);
  });

  it("writeRoles가 readRoles에 없으면 거부한다", () => {
    const parsed = createCommunitySchema.safeParse({
      ...base,
      readRoles: ["STUDENT"],
      writeRoles: ["PARENT"],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toContain("읽을 수 없는 역할");
  });

  it("readRoles가 비어도 통과한다 — 교사 전용 게시판이다", () => {
    const parsed = createCommunitySchema.safeParse({
      ...base,
      readRoles: [],
      writeRoles: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("ADMIN은 역할 목록에 넣을 수 없다 — 늘 통과하므로 자리가 없다", () => {
    const parsed = createCommunitySchema.safeParse({ ...base, readRoles: ["ADMIN"] });
    expect(parsed.success).toBe(false);
  });

  it.each([
    ["대문자", "Notice"],
    ["공백", "my board"],
    ["한글", "공지"],
    ["슬래시", "a/b"],
    ["점", "a.b"],
    ["한 글자", "a"],
  ])("slug에 %s는 거부한다", (_label, slug) => {
    expect(createCommunitySchema.safeParse({ ...base, slug }).success).toBe(false);
  });

  it.each(["notice", "free-board", "class-1", "a2"])("slug %s는 통과한다", (slug) => {
    expect(createCommunitySchema.safeParse({ ...base, slug }).success).toBe(true);
  });

  it("이름이 비면 거부한다", () => {
    expect(createCommunitySchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
});

describe("updateCommunitySchema", () => {
  const input = {
    communityId: "c1",
    updatedAt: "2026-08-28T00:00:00.000Z",
    name: "공지사항",
    description: "",
    readRoles: ["STUDENT"],
    writeRoles: [],
    anonymous: "",
    allowAttachments: "",
    sortOrder: "3",
  };

  it("updatedAt을 Date로 바꾼다", () => {
    const parsed = updateCommunitySchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.updatedAt).toBeInstanceOf(Date);
    expect(parsed.data.sortOrder).toBe(3);
  });

  it("slug는 아예 받지 않는다 — 만든 뒤에는 바꿀 수 없다", () => {
    const parsed = updateCommunitySchema.safeParse({ ...input, slug: "hacked" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("slug");
  });
});
