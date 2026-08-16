import { describe, expect, it } from "vitest";
import { hrefWith } from "@/lib/search-params";

describe("hrefWith", () => {
  it("현재 쿼리를 그대로 보존한다", () => {
    // 이 규칙이 이 파일의 존재 이유다 — 반을 고른 채 트랙 탭만 눌러도
    // 그 반이 유지되어야 한다.
    const href = hrefWith(
      "/merit",
      { track: "SCHOOL", grade: "1", classNo: "4" },
      { track: "DORM" },
    );

    const query = new URL(href, "http://x").searchParams;
    expect(query.get("grade")).toBe("1");
    expect(query.get("classNo")).toBe("4");
    expect(query.get("track")).toBe("DORM");
  });

  it("patch가 기존 값을 덮어쓴다", () => {
    expect(hrefWith("/merit", { track: "SCHOOL" }, { track: "DORM" })).toBe(
      "/merit?track=DORM",
    );
  });

  it("patch의 null은 그 키를 지운다", () => {
    // 학생 상세의 트랙 탭: 기숙사는 누적이라 학년도가 의미 없다.
    const href = hrefWith(
      "/merit/students/abc",
      { track: "SCHOOL", year: "2025" },
      { track: "DORM", year: null },
    );

    expect(href).toBe("/merit/students/abc?track=DORM");
  });

  it("params에 없는 키를 null로 지워도 터지지 않는다", () => {
    expect(hrefWith("/merit", { track: "SCHOOL" }, { year: null })).toBe(
      "/merit?track=SCHOOL",
    );
  });

  it("배열 값은 버린다", () => {
    // 같은 키를 여러 번 받는 화면이 없다 — 주소를 손으로 고친 경우뿐이라
    // 기본값으로 떨어뜨린다.
    const href = hrefWith("/merit", { track: ["SCHOOL", "DORM"], grade: "2" }, {});

    expect(href).toBe("/merit?grade=2");
  });

  it("undefined 값은 버린다", () => {
    expect(hrefWith("/merit", { track: undefined, grade: "2" })).toBe("/merit?grade=2");
  });

  it("남는 쿼리가 없으면 물음표를 붙이지 않는다", () => {
    // /merit/stats의 "전교 보기": 반 조건을 지우면 경로만 남아야 한다.
    expect(hrefWith("/merit/stats", { grade: "1", classNo: "4" }, {
      grade: null,
      classNo: null,
    })).toBe("/merit/stats");
  });

  it("patch가 없으면 현재 쿼리만 옮겨 붙인다", () => {
    expect(hrefWith("/admin/logs", { period: "7d", action: "merit:award" })).toBe(
      "/admin/logs?period=7d&action=merit%3Aaward",
    );
  });

  it("페이지 링크처럼 한 키만 바꾸는 경우", () => {
    const href = hrefWith("/admin/logs", { period: "7d", page: "2" }, { page: "3" });

    expect(href).toBe("/admin/logs?period=7d&page=3");
  });
});
