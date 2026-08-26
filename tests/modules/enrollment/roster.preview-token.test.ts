import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { issuePreviewToken, verifyPreviewToken } = await import(
  "@/modules/enrollment/roster.preview-token"
);

const ROW = {
  line: 2,
  studentCode: "AAAA2345",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED" as const,
  errors: [],
};

describe("preview-token — HMAC 정규형", () => {
  const input = {
    year: 2026,
    rows: [ROW],
    deletionIds: [],
    rosterFingerprint: "roster-v1",
  };

  it("정상 토큰만 통과한다", () => {
    const token = issuePreviewToken(input);

    expect(verifyPreviewToken(token, input)).toBe(true);
  });

  it("base64url 문자가 아닌 MAC은 decode 전에 거부한다", () => {
    const token = issuePreviewToken(input).replace(/.$/u, "!");

    expect(verifyPreviewToken(token, input)).toBe(false);
  });

  it("패딩이 붙은 대체 base64url 표기도 거부한다", () => {
    const token = `${issuePreviewToken(input)}=`;

    expect(verifyPreviewToken(token, input)).toBe(false);
  });
});

describe("preview-token — 정규화", () => {
  const base = {
    year: 2026,
    rows: [ROW],
    deletionIds: ["sp-2", "sp-1"],
    rosterFingerprint: "roster-v1",
  };

  it("삭제 대상 순서가 달라도 같은 봉인이다 — 화면이 고르는 순서에 좌우되지 않는다", () => {
    expect(issuePreviewToken(base)).toBe(
      issuePreviewToken({ ...base, deletionIds: ["sp-1", "sp-2"] }),
    );
  });

  it("한글 자모 표기(NFC/NFD)가 달라도 같은 봉인이다", () => {
    const nfd = { ...ROW, name: ROW.name.normalize("NFD") };

    expect(verifyPreviewToken(issuePreviewToken(base), { ...base, rows: [nfd] })).toBe(
      true,
    );
  });
});
