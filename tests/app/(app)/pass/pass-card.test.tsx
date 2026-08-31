import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PassCard } from "@/app/(app)/pass/pass-card";

describe("PassCard", () => {
  it("카드 전체 링크 이름에 유형·기간·처리 단계·학생을 모두 담는다", () => {
    const html = renderToStaticMarkup(
      <PassCard
        pass={
          {
            id: "p-1",
            type: "OVERNIGHT",
            status: "REQUESTED",
            startAt: new Date("2026-08-26T09:00:00.000Z"),
            endAt: new Date("2026-08-27T00:00:00.000Z"),
            destination: "본가",
            reason: "가족 행사",
            decisionNote: null,
            consentByProxy: false,
            consentedByName: null,
            studentProfile: {
              user: { name: "김학생" },
              enrollments: [],
            },
          } as never
        }
      />,
    );

    expect(html).toContain("aria-label=");
    expect(html).toContain("외박 · 26. 8. 26. 오후 6:00 ~ 26. 8. 27. 오전 9:00");
    expect(html).toContain("보호자 확인 대기 · 김학생님 상세");
  });

  it("일반 승인 메모를 반려 사유라고 부르지 않는다", () => {
    const html = renderToStaticMarkup(
      <PassCard
        pass={
          {
            id: "p-2",
            type: "OUTING",
            status: "APPROVED",
            startAt: new Date("2026-08-26T05:00:00.000Z"),
            endAt: new Date("2026-08-26T09:00:00.000Z"),
            destination: "치과",
            reason: "검진",
            decisionNote: "예약 확인",
            consentByProxy: false,
            consentedByName: null,
            studentProfile: {
              user: { name: "김학생" },
              enrollments: [],
            },
          } as never
        }
      />,
    );

    expect(html).toContain("승인 메모: 예약 확인");
    expect(html).not.toContain("반려 사유: 예약 확인");
  });
});
