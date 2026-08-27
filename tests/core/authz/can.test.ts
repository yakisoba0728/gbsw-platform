import { describe, expect, it } from "vitest";
import { can, RULES, type Action } from "@/core/authz/can";
import { ROLES, type Role } from "@/core/authz/roles";

/**
 * 액션을 추가할 때 여기에도 기대값을 추가한다.
 * 표에 없는 액션이 생기면 아래 "모든 액션이 표에 있다" 테스트가 깨진다.
 */
const EXPECTED: Record<Action, Role[]> = {
  "user:manage": ["ADMIN"],
  "student:manage": ["ADMIN"],
  "academic-year:manage": ["ADMIN"],
  "invite:create": ["ADMIN"],
  "invite:list": ["ADMIN"],
  "invite:revoke": ["ADMIN"],
  "invite:create:parent": ["ADMIN", "STUDENT"],
  "audit:read": ["ADMIN"],
  "community:manage": ["ADMIN"],
  "community:moderate": ["ADMIN"],
  "merit:rule:manage": ["ADMIN"],
  "merit:rule:read": ["ADMIN", "STUDENT", "PARENT"],
  "merit:threshold:manage": ["ADMIN"],
  "merit:award": ["ADMIN"],
  "merit:cancel": ["ADMIN"],
  "merit:read:any": ["ADMIN"],
  "pass:request": ["ADMIN", "STUDENT"],
  "pass:consent": ["ADMIN", "PARENT"],
  "pass:verify": ["ADMIN", "STUDENT", "PARENT"],
  "pass:approve": ["ADMIN"],
  "pass:issue": ["ADMIN"],
  "pass:cancel": ["ADMIN"],
  "pass:read:any": ["ADMIN"],
};

const ACTIONS = Object.keys(EXPECTED) as Action[];

describe("can()", () => {
  it("모든 액션이 표에 있다 (M13)", () => {
    expect(Object.keys(RULES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("로그인하지 않은 사용자는 어떤 액션도 못 한다", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("ADMIN은 모든 액션을 통과한다", () => {
    for (const action of ACTIONS) {
      expect(can({ role: "ADMIN" }, action)).toBe(true);
    }
  });

  it.each(ACTIONS)("%s 액션의 역할 매트릭스가 기대와 같다", (action) => {
    for (const role of ROLES) {
      expect(can({ role }, action)).toBe(EXPECTED[action].includes(role));
    }
  });

  it("학부모는 초대 관련 권한이 하나도 없다", () => {
    for (const action of ACTIONS.filter((a) => a.startsWith("invite:"))) {
      expect(can({ role: "PARENT" }, action)).toBe(false);
    }
  });

  it("학생은 자기 학부모 코드 생성만 가능하다", () => {
    expect(can({ role: "STUDENT" }, "invite:create:parent")).toBe(true);
    expect(can({ role: "STUDENT" }, "invite:create")).toBe(false);
    expect(can({ role: "STUDENT" }, "invite:list")).toBe(false);
    expect(can({ role: "STUDENT" }, "student:manage")).toBe(false);
    expect(can({ role: "STUDENT" }, "merit:award")).toBe(false);
    expect(can({ role: "STUDENT" }, "merit:read:any")).toBe(false);
  });

  it("알 수 없는 역할은 거부한다", () => {
    for (const action of ACTIONS) {
      expect(can({ role: "SUPER_ADMIN" }, action)).toBe(false);
      expect(can({ role: null }, action)).toBe(false);
      expect(can({}, action)).toBe(false);
    }
  });

  it("판정은 로그인한 전 역할이 할 수 있다", () => {
    for (const role of ROLES) {
      expect(can({ role }, "pass:verify")).toBe(true);
    }
    expect(can(null, "pass:verify")).toBe(false);
  });

  it("학생은 신청만, 학부모는 동의만 할 수 있다", () => {
    expect(can({ role: "STUDENT" }, "pass:request")).toBe(true);
    expect(can({ role: "STUDENT" }, "pass:approve")).toBe(false);
    expect(can({ role: "STUDENT" }, "pass:consent")).toBe(false);
    expect(can({ role: "PARENT" }, "pass:consent")).toBe(true);
    expect(can({ role: "PARENT" }, "pass:request")).toBe(false);
  });
});
