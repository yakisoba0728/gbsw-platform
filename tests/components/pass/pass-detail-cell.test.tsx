import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PassDetailCell } from "@/components/pass/pass-detail-cell";

const pass = {
  destination: "치과",
  reason: "정기 검진",
  decisionNote: "예약 확인",
  cancelReason: null,
};

describe("PassDetailCell", () => {
  it("승인된 출입증의 결정 메모를 승인 메모라고 표시한다", () => {
    const html = renderToStaticMarkup(
      <PassDetailCell pass={{ ...pass, status: "APPROVED" }} />,
    );

    expect(html).toContain("승인 메모");
    expect(html).not.toContain("반려 사유");
  });

  it("반려된 출입증의 결정 메모만 반려 사유라고 표시한다", () => {
    const html = renderToStaticMarkup(
      <PassDetailCell pass={{ ...pass, status: "REJECTED" }} />,
    );

    expect(html).toContain("반려 사유");
    expect(html).not.toContain("승인 메모");
  });
});
