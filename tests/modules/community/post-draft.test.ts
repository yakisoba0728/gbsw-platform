import { describe, expect, it } from "vitest";
import {
  parsePostDraftNonce,
  parsePostDraft,
  POST_DRAFT_MAX_AGE_MS,
  postDraftMatchesCompletion,
  postDraftKey,
  serializePostDraft,
} from "@/app/(app)/community/[slug]/post-draft";

const NONCE = "0123456789abcdef0123456789abcdef";

describe("커뮤니티 새 글 초안", () => {
  it("사용자와 게시판이 다르면 저장 키도 다르다", () => {
    expect(postDraftKey("user-a", "notice")).not.toBe(
      postDraftKey("user-b", "notice"),
    );
    expect(postDraftKey("user-a", "notice")).not.toBe(
      postDraftKey("user-a", "free"),
    );
  });

  it("저장한 제목과 본문을 복원한다", () => {
    const raw = serializePostDraft(
      { title: "작성 중 제목", body: "작성 중 본문", nonce: NONCE },
      1_000,
    );

    expect(parsePostDraft(raw, 1_100)).toEqual({
      title: "작성 중 제목",
      body: "작성 중 본문",
      nonce: NONCE,
      savedAt: 1_000,
    });
  });

  it("깨졌거나 오래되거나 필드 제한을 넘긴 초안은 복원하지 않는다", () => {
    expect(parsePostDraft("not-json", 1_000)).toBeNull();
    expect(
      parsePostDraft(
        serializePostDraft({ title: "오래됨", body: "", nonce: NONCE }, 1_000),
        1_000 + POST_DRAFT_MAX_AGE_MS + 1,
      ),
    ).toBeNull();
    expect(
      parsePostDraft(
        serializePostDraft(
          { title: "x".repeat(201), body: "", nonce: NONCE },
          1_000,
        ),
        1_100,
      ),
    ).toBeNull();
  });

  it("작성 성공 난수가 같은 초안만 정리 대상으로 인정한다", () => {
    const raw = serializePostDraft(
      { title: "작성 중", body: "본문", nonce: NONCE },
      1_000,
    );

    expect(postDraftMatchesCompletion(raw, `#created=${NONCE}`, 1_100)).toBe(true);
    expect(postDraftMatchesCompletion(raw, "#created", 1_100)).toBe(false);
    expect(
      postDraftMatchesCompletion(
        raw,
        "#created=ffffffffffffffffffffffffffffffff",
        1_100,
      ),
    ).toBe(false);
  });

  it("난수는 정확한 128비트 16진수만 받는다", () => {
    expect(parsePostDraftNonce(NONCE)).toBe(NONCE);
    expect(parsePostDraftNonce("short")).toBeNull();
    expect(parsePostDraftNonce(`${NONCE}00`)).toBeNull();
  });
});
