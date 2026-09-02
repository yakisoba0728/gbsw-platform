import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { describe, expect, it } from "vitest";
import { ac, adminRoles } from "@/core/auth/permissions";

const ROLE_NAMES = ["ADMIN", "PARENT", "STUDENT"] as const;

type AuthorizeRequest = Parameters<(typeof adminRoles)["ADMIN"]["authorize"]>[0];

const ALL_GRANTS = Object.entries(defaultStatements).flatMap(([resource, actions]) =>
  actions.map((action) => [resource, action] as const),
);

function grants(
  role: (typeof adminRoles)[keyof typeof adminRoles],
  resource: string,
  action: string,
): boolean {
  return role.authorize({ [resource]: [action] } as AuthorizeRequest).success;
}

describe("접근제어 정의", () => {
  it("admin 플러그인의 기본 문장으로 만든다", () => {
    expect(ac.statements).toBe(defaultStatements);
    expect(Object.keys(ac.statements).sort()).toEqual(["session", "user"]);
  });

  it("검사 대상이 비어 있지 않다 — 아래 반복문들이 0번 돌면서 조용히 통과하는 일을 막는다", () => {
    expect(ALL_GRANTS.length).toBeGreaterThan(10);
  });
});

describe("역할 목록", () => {
  it("역할은 ADMIN / STUDENT / PARENT 셋뿐이다", () => {
    expect(Object.keys(adminRoles).sort()).toEqual([...ROLE_NAMES]);
  });

  it("세 역할 모두 user·session 두 자원을 명시한다", () => {
    for (const name of ROLE_NAMES) {
      expect(Object.keys(adminRoles[name].statements).sort()).toEqual(["session", "user"]);
    }
  });
});

describe("STUDENT · PARENT는 계정 관리 API 권한이 하나도 없다", () => {
  const NO_ACCOUNT_POWER = ["STUDENT", "PARENT"] as const;

  it.each(NO_ACCOUNT_POWER)("%s의 허용 목록이 비어 있다", (name) => {
    expect(adminRoles[name].statements).toEqual({ user: [], session: [] });
  });

  it.each(NO_ACCOUNT_POWER)(
    "%s은 defaultStatements의 어떤 동작도 통과하지 못한다 — better-auth가 동작을 추가해도 이 잠금이 따라간다",
    (name) => {
      for (const [resource, action] of ALL_GRANTS) {
        expect(grants(adminRoles[name], resource, action)).toBe(false);
      }
    },
  );

  it.each(NO_ACCOUNT_POWER)("%s은 계정을 정지시키지도, 남의 세션을 지우지도 못한다", (name) => {
    expect(grants(adminRoles[name], "user", "ban")).toBe(false);
    expect(grants(adminRoles[name], "user", "set-role")).toBe(false);
    expect(grants(adminRoles[name], "user", "set-password")).toBe(false);
    expect(grants(adminRoles[name], "user", "impersonate")).toBe(false);
    expect(grants(adminRoles[name], "user", "delete")).toBe(false);
    expect(grants(adminRoles[name], "session", "revoke")).toBe(false);
  });

  it.each(NO_ACCOUNT_POWER)("%s은 여러 동작을 한꺼번에 물어도 통과하지 못한다", (name) => {
    expect(adminRoles[name].authorize({ user: ["list", "get"] }).success).toBe(false);
    expect(adminRoles[name].authorize({ user: ["list"], session: ["list"] }, "OR").success).toBe(
      false,
    );
  });
});

describe("ADMIN은 계정 관리 전권을 갖는다", () => {
  it("ADMIN은 모든 동작을 통과한다", () => {
    for (const [resource, action] of ALL_GRANTS) {
      expect(grants(adminRoles.ADMIN, resource, action)).toBe(true);
    }
  });

  it("허용 목록이 defaultStatements와 정확히 같다", () => {
    expect(adminRoles.ADMIN.statements).toEqual({
      user: [...defaultStatements.user],
      session: [...defaultStatements.session],
    });
  });

  it("정의된 적 없는 자원은 ADMIN도 통과하지 못한다", () => {
    expect(grants(adminRoles.ADMIN, "organization", "delete")).toBe(false);
    expect(grants(adminRoles.ADMIN, "user", "self-destruct")).toBe(false);
  });

  it("기본 admin 역할보다 넓다 — impersonate-admins까지 갖는다", () => {
    const ours = new Set<string>(adminRoles.ADMIN.statements.user);
    const theirs = new Set<string>(adminAc.statements.user);
    const extra = [...ours].filter((action) => !theirs.has(action));

    expect(extra).toEqual(["impersonate-admins"]);
  });
});
