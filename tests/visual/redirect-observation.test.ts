import { describe, expect, it } from "vitest";
import { parseNextStreamedRedirect } from "./redirect-observation";

describe("Next streamed redirect observation", () => {
  it("temporary redirect meta를 307 계약으로 읽고 URL entity를 푼다", () => {
    expect(
      parseNextStreamedRedirect(
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/merit/stats?track=SCHOOL&amp;view=ranking">',
      ),
    ).toEqual({
      contractStatus: 307,
      location: "/merit/stats?track=SCHOOL&view=ranking",
      mechanism: "next-stream-meta",
    });
  });

  it("permanent redirect meta를 308 계약으로 읽는다", () => {
    expect(
      parseNextStreamedRedirect(
        '<meta content="0;url=/students/fixture?tab=merit" id="__next-page-redirect" http-equiv="refresh">',
      ),
    ).toEqual({
      contractStatus: 308,
      location: "/students/fixture?tab=merit",
      mechanism: "next-stream-meta",
    });
  });

  it("일반 meta는 redirect 계약으로 보지 않는다", () => {
    expect(
      parseNextStreamedRedirect(
        '<meta name="viewport" content="width=device-width">',
      ),
    ).toBeNull();
  });
});
