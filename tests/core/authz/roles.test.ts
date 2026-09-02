import { describe, expect, it } from "vitest";
import {
  honorificName,
  honorificSuffix,
  isRole,
  ROLE_LABELS,
  ROLES,
} from "@/core/authz/roles";

describe("ROLE_LABELS", () => {
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

  it("님만 붙여 쓰고 나머지는 띄운다", () => {
    expect(honorificName("김민준", "STUDENT")).not.toContain(" ");
    expect(honorificName("이정민", "ADMIN")).toContain(" 선생님");
    expect(honorificName("김보호", "PARENT")).toContain(" 학부모님");
  });

  it.each([null, undefined])("역할을 모르면(%s) 님으로 떨어진다", (role) => {
    expect(honorificName("홍길동", role)).toBe("홍길동님");
  });

  it("모든 역할이 이름을 그대로 품는다", () => {
    for (const role of ROLES) {
      expect(honorificName("김민준", role)).toContain("김민준");
    }
  });
});

describe("honorificSuffix()", () => {
  it.each([
    ["ADMIN", " 선생님"],
    ["PARENT", " 학부모님"],
    ["STUDENT", "님"],
  ] as const)("%s의 호칭은 %s다", (role, suffix) => {
    expect(honorificSuffix(role)).toBe(suffix);
  });

  it("띄어 쓰는 호칭만 앞 공백을 갖는다", () => {
    expect(honorificSuffix("ADMIN").startsWith(" ")).toBe(true);
    expect(honorificSuffix("PARENT").startsWith(" ")).toBe(true);
    expect(honorificSuffix("STUDENT").startsWith(" ")).toBe(false);
  });

  it("honorificName은 이 함수를 그대로 이어 붙인 것이다", () => {
    for (const role of [...ROLES, null, undefined]) {
      expect(honorificName("김민준", role)).toBe(`김민준${honorificSuffix(role)}`);
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
