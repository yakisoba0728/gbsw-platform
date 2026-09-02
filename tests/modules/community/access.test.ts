import { describe, expect, it } from "vitest";
import { canRead, canWrite } from "@/modules/community/community.access";

const studentBoard = { readRoles: ["STUDENT"], writeRoles: ["STUDENT"] };
const notice = { readRoles: ["STUDENT", "PARENT"], writeRoles: [] };

describe("canRead", () => {
  it("readRoles에 든 역할은 읽는다", () => {
    expect(canRead({ role: "STUDENT" }, studentBoard)).toBe(true);
    expect(canRead({ role: "PARENT" }, notice)).toBe(true);
  });

  it("readRoles에 없는 역할은 못 읽는다", () => {
    expect(canRead({ role: "PARENT" }, studentBoard)).toBe(false);
  });

  it("교사는 배열과 무관하게 읽는다 — can()이 ADMIN을 통과시키는 것과 같은 규칙", () => {
    expect(canRead({ role: "ADMIN" }, studentBoard)).toBe(true);
    expect(canRead({ role: "ADMIN" }, { readRoles: [], writeRoles: [] })).toBe(true);
  });

  it("로그인하지 않았으면 못 읽는다", () => {
    expect(canRead(null, notice)).toBe(false);
    expect(canRead(undefined, notice)).toBe(false);
    expect(canRead({ role: null }, notice)).toBe(false);
  });
});

describe("canWrite", () => {
  it("writeRoles에 든 역할은 쓴다", () => {
    expect(canWrite({ role: "STUDENT" }, studentBoard)).toBe(true);
  });

  it("읽을 수 있어도 writeRoles에 없으면 못 쓴다", () => {
    expect(canRead({ role: "STUDENT" }, notice)).toBe(true);
    expect(canWrite({ role: "STUDENT" }, notice)).toBe(false);
  });

  it("교사는 배열이 비어 있어도 쓴다", () => {
    expect(canWrite({ role: "ADMIN" }, notice)).toBe(true);
  });

  it("로그인하지 않았으면 못 쓴다", () => {
    expect(canWrite(null, studentBoard)).toBe(false);
  });

  it("모르는 역할 문자열은 통과시키지 않는다", () => {
    expect(canWrite({ role: "SUPERUSER" }, studentBoard)).toBe(false);
    expect(canRead({ role: "SUPERUSER" }, studentBoard)).toBe(false);
  });
});
