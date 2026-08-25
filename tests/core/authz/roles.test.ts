import { describe, expect, it } from "vitest";
import { honorificName, isRole, ROLE_LABELS, ROLES } from "@/core/authz/roles";

describe("ROLE_LABELS", () => {
  // 코드 상수는 ADMIN이지만 학교에서 그 자리는 교사다. 「관리자」로 되돌아가면
  // 사이드바 섹션·초대 발급 탭·계정 목록 필터가 화면마다 다른 말을 쓰게 된다.
  it("ADMIN을 교사로 부른다", () => {
    expect(ROLE_LABELS.ADMIN).toBe("교사");
  });

  it("세 역할 모두 라벨이 있다", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe("honorificName()", () => {
  it.each([
    ["ADMIN", "이정민", "이정민 선생님"],
    ["PARENT", "김보호", "김보호 학부모님"],
    ["STUDENT", "김민준", "김민준님"],
  ] as const)("%s는 %s를 %s로 부른다", (role, name, expected) => {
    expect(honorificName(name, role)).toBe(expected);
  });

  // 「님」은 의존명사라 이름에 붙여 쓰고, 「선생님」·「학부모님」은 단어라 띄운다.
  it("님만 붙여 쓰고 나머지는 띄운다", () => {
    expect(honorificName("김민준", "STUDENT")).not.toContain(" ");
    expect(honorificName("이정민", "ADMIN")).toContain(" 선생님");
    expect(honorificName("김보호", "PARENT")).toContain(" 학부모님");
  });

  // 계정이 지워진 감사로그는 역할을 못 읽는다. 이름 스냅샷은 남아 있으므로
  // 호칭만 중립으로 떨어뜨린다 — 여기서 던지면 로그 화면 전체가 깨진다.
  it.each([null, undefined])("역할을 모르면(%s) 님으로 떨어진다", (role) => {
    expect(honorificName("홍길동", role)).toBe("홍길동님");
  });

  it("모든 역할이 이름을 그대로 품는다", () => {
    for (const role of ROLES) {
      expect(honorificName("김민준", role)).toContain("김민준");
    }
  });
});

describe("isRole()", () => {
  it("세 역할만 통과시킨다", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    for (const bad of ["TEACHER", "admin", "", null, undefined, 1, {}]) {
      expect(isRole(bad)).toBe(false);
    }
  });
});
