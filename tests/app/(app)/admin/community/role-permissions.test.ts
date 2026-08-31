import { describe, expect, it } from "vitest";
import {
  communityRolePermissions,
  toggleCommunityRolePermission,
} from "@/app/(app)/admin/community/role-permissions";

describe("게시판 역할 권한 선택", () => {
  it("글쓰기를 켜면 같은 역할의 읽기도 함께 켠다", () => {
    const next = toggleCommunityRolePermission(
      { readRoles: [], writeRoles: [] },
      "write",
      "STUDENT",
      true,
    );

    expect(next).toEqual({ readRoles: ["STUDENT"], writeRoles: ["STUDENT"] });
  });

  it("읽기를 끄면 성립할 수 없는 글쓰기 권한도 함께 끈다", () => {
    const next = toggleCommunityRolePermission(
      { readRoles: ["STUDENT", "PARENT"], writeRoles: ["STUDENT", "PARENT"] },
      "read",
      "STUDENT",
      false,
    );

    expect(next).toEqual({ readRoles: ["PARENT"], writeRoles: ["PARENT"] });
  });

  it("글쓰기만 끌 때는 읽기 권한을 그대로 둔다", () => {
    const next = toggleCommunityRolePermission(
      { readRoles: ["STUDENT"], writeRoles: ["STUDENT"] },
      "write",
      "STUDENT",
      false,
    );

    expect(next).toEqual({ readRoles: ["STUDENT"], writeRoles: [] });
  });

  it("서버 값에서는 교사를 포함한 알 수 없는 역할을 선택지에서 제외한다", () => {
    expect(
      communityRolePermissions(
        ["ADMIN", "STUDENT", "UNKNOWN"],
        ["ADMIN", "PARENT"],
      ),
    ).toEqual({ readRoles: ["STUDENT", "PARENT"], writeRoles: ["PARENT"] });
  });
});
