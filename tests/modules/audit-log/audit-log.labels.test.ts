import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  auditActionLabel,
  auditActionTone,
  auditTargetLabel,
  formatAuditMetadata,
} from "@/modules/audit-log/audit-log.labels";

const SRC_ROOT = join(process.cwd(), "src");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated") continue; // Prisma 생성물 — 감사로그와 무관
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * 코드에서 실제로 recordAudit(...)에 넘기는 action 문자열을 전부 모은다.
 *
 * recordAudit 호출부는 모두 action이 targetType보다 먼저 온다(현재 컨벤션) —
 * 그 사이 구간만 보면 can()에 쓰는 권한 Action 문자열(예: "invite:list")이
 * 섞여 들어오지 않는다. 삼항연산자로 두 리터럴이 오는 자리
 * (`active ? "user:activate" : "user:deactivate"`)도 정규식이 전부 잡는다.
 */
function findRecordedActions(): Set<string> {
  const actions = new Set<string>();

  for (const file of listSourceFiles(SRC_ROOT)) {
    const content = readFileSync(file, "utf8");
    let index = content.indexOf("recordAudit(");

    while (index !== -1) {
      const tail = content.slice(index);
      const targetTypeAt = tail.indexOf("targetType:");
      const window = targetTypeAt === -1 ? tail.slice(0, 400) : tail.slice(0, targetTypeAt);

      const matches = window.match(/"[a-zA-Z][\w-]*:[\w-]+"/g) ?? [];
      for (const m of matches) actions.add(JSON.parse(m) as string);

      index = content.indexOf("recordAudit(", index + 1);
    }
  }

  return actions;
}

describe("액션 라벨 커버리지", () => {
  it("recordAudit에 실제로 쓰이는 action 문자열이 전부 라벨 맵에 있다", () => {
    const recorded = findRecordedActions();
    // 스캐너 자체가 recordAudit 호출부를 못 찾는 상태로 조용히 통과하면
    // 이 테스트는 의미가 없어진다 — 최소한 지금 아는 호출부 수만큼은 잡혀야 한다.
    expect(recorded.size).toBeGreaterThanOrEqual(13);

    const known = new Set<string>(AUDIT_ACTIONS);
    const missing = [...recorded].filter((a) => !known.has(a));
    expect(missing).toEqual([]);
  });
});

describe("auditActionLabel() / auditActionTone()", () => {
  it("아는 액션은 한글 라벨과 지정된 톤을 돌려준다", () => {
    expect(auditActionLabel("user:delete")).toBe("계정 완전 삭제");
    expect(auditActionTone("user:delete")).toBe("rejected");

    expect(auditActionLabel("invite:create:parent")).toBe("학부모 코드 발급");
    expect(auditActionTone("invite:create:parent")).toBe("approved");
  });

  it("모르는 액션은 원본 문자열 그대로, 톤은 neutral로 떨어진다", () => {
    expect(auditActionLabel("merit:award:create")).toBe("merit:award:create");
    expect(auditActionTone("merit:award:create")).toBe("neutral");
  });
});

describe("auditTargetLabel()", () => {
  it("아는 대상 종류는 한글로 바꾼다", () => {
    expect(auditTargetLabel("User")).toBe("계정");
    expect(auditTargetLabel("Invite")).toBe("초대코드");
    expect(auditTargetLabel("StudentProfile")).toBe("학생");
    expect(auditTargetLabel("AcademicYear")).toBe("학년도");
  });

  it("모르는 대상 종류는 원본 문자열 그대로 보여준다", () => {
    expect(auditTargetLabel("SchoolClass")).toBe("SchoolClass");
  });
});

describe("formatAuditMetadata()", () => {
  it("metadata가 null이면 null(화면에서는 —)이다", () => {
    expect(formatAuditMetadata("user:update", null)).toBeNull();
  });

  it("객체가 아니거나 배열이면 null이다", () => {
    expect(formatAuditMetadata("user:update", "oops")).toBeNull();
    expect(formatAuditMetadata("user:update", [1, 2])).toBeNull();
  });

  it("빈 객체는 null이다", () => {
    expect(formatAuditMetadata("merit:award:create", {})).toBeNull();
  });

  /**
   * 폐기하면 목록에서 대기 상태가 사라져 「왜 없앴나」를 되짚을 자료가 여기밖에
   * 없다. 갈래가 없으면 기본값으로 떨어져 「reason 잘못 발급」처럼 날것으로 찍혔다.
   */
  it("invite:revoke — 사유를 한글로 그린다", () => {
    expect(
      formatAuditMetadata("invite:revoke", { reason: "잘못된 학생에게 발급함" }),
    ).toBe("사유: 잘못된 학생에게 발급함");
  });

  it("invite:revoke — 사유가 없으면 null이다", () => {
    expect(formatAuditMetadata("invite:revoke", {})).toBeNull();
    expect(formatAuditMetadata("invite:revoke", { reason: "" })).toBeNull();
  });

  it("user:update — 바뀐 필드를 한글 라벨로 이어붙인다", () => {
    expect(
      formatAuditMetadata("user:update", { changed: ["name", "phone"] }),
    ).toBe("이름 · 전화번호 바뀜");
    expect(
      formatAuditMetadata("user:update", { changed: ["birthDate", "grade"] }),
    ).toBe("생년월일 · 학년 바뀜");
  });

  it("user:update — 모르는 필드 키는 원본 그대로 섞어 보여준다", () => {
    expect(formatAuditMetadata("user:update", { changed: ["foo", "name"] })).toBe(
      "foo · 이름 바뀜",
    );
  });

  it("enrollment:update — 학년도와 바뀐 필드를 이어붙이고 batch는 숨긴다", () => {
    const result = formatAuditMetadata("enrollment:update", {
      year: 2027,
      batch: "117c9c3d-134a-42e8-82c2-7fa8ce287404",
      changed: ["grade", "classNo", "number", "status"],
    });
    expect(result).toBe("2027학년도 · 학년 · 반 · 번호 · 학적 바뀜");
    expect(result).not.toContain("117c9c3d");
  });

  it("enrollment:import — 값이 있는 항목만, 0은 뺀다", () => {
    expect(
      formatAuditMetadata("enrollment:import", {
        year: 2026,
        deleted: 11,
        reassign: 0,
        newStudents: 0,
        statusChange: 0,
        invitesIssued: 0,
        newAssignment: 0,
      }),
    ).toBe("2026학년도 · 삭제 11");
  });

  it("enrollment:import — 전부 0이면 학년도만 남는다", () => {
    // 실제 DB에 존재하는 모양: removed는 옛 필드명이라 무시되고, 나머지도 전부 0.
    expect(
      formatAuditMetadata("enrollment:import", {
        year: 2026,
        removed: 0,
        reassign: 0,
        newStudents: 0,
        statusChange: 0,
        invitesIssued: 0,
        newAssignment: 0,
      }),
    ).toBe("2026학년도");
  });

  it("enrollment:import — 여러 항목이 값을 가지면 · 로 이어붙인다", () => {
    expect(
      formatAuditMetadata("enrollment:import", {
        year: 2026,
        removed: 0,
        reassign: 0,
        newStudents: 2,
        statusChange: 0,
        invitesIssued: 1,
        newAssignment: 0,
      }),
    ).toBe("2026학년도 · 신규 2 · 초대발급 1");
  });

  it("academic-year:set-current — 이전 학년도를 보여준다", () => {
    expect(formatAuditMetadata("academic-year:set-current", { from: 2026 })).toBe(
      "2026학년도에서 변경",
    );
  });

  it("academic-year:set-current — from이 null이면(최초 지정) 표시할 게 없다", () => {
    expect(
      formatAuditMetadata("academic-year:set-current", { from: null }),
    ).toBeNull();
  });

  it("invite:create — 역할만 ROLE_LABELS로 보여주고 studentId 등은 숨긴다", () => {
    const result = formatAuditMetadata("invite:create", {
      role: "PARENT",
      studentId: "cmspyammx0003fity58pqfsge",
      issuedByAdmin: true,
    });
    expect(result).toBe("학부모");
    expect(result).not.toContain("cmspy");
  });

  it("invite:create — 학생용 코드는 학생으로 보여준다", () => {
    expect(
      formatAuditMetadata("invite:create", { role: "STUDENT", grade: 1, classNo: 2 }),
    ).toBe("학생");
  });

  it("registration:complete — 역할만 보여주고 inviteId는 숨긴다", () => {
    const result = formatAuditMetadata("registration:complete", {
      role: "STUDENT",
      inviteId: "cmspy9ghv0000fitynzgkrc2l",
    });
    expect(result).toBe("학생");
    expect(result).not.toContain("cmspy9ghv");
  });

  it("metadata가 없는 액션(예: user:delete)은 애초에 null이 온다", () => {
    expect(formatAuditMetadata("user:delete", null)).toBeNull();
  });

  it("모르는 액션은 key value를 나열해서 보여준다 — 화면이 비지는 않는다", () => {
    expect(
      formatAuditMetadata("merit:award:create", { points: 3, reason: "지각" }),
    ).toBe("points 3 · reason 지각");
  });

  it("merit:rule:update — 바뀐 필드와 점수 전/후를 함께 보여준다", () => {
    expect(
      formatAuditMetadata("merit:rule:update", {
        changed: ["label", "points"],
        label: "교내 봉사활동 우수 참여",
        pointsFrom: 5,
        pointsTo: 10,
      }),
    ).toBe("항목명 · 점수 바뀜 · 점수 5→10");
  });

  it("merit:rule:update — 점수가 그대로면 전/후를 붙이지 않는다", () => {
    expect(
      formatAuditMetadata("merit:rule:update", {
        changed: ["category"],
        label: "교내 봉사활동 우수 참여",
        pointsFrom: 5,
        pointsTo: 5,
      }),
    ).toBe("분류 바뀜");
  });

  /**
   * 기준은 덮어쓰기라 옛 값이 DB 어디에도 안 남는다 — 이 줄이 "언제부터
   * 명단이 길어졌나"에 답하는 유일한 흔적이다.
   */
  it("merit:threshold:update — 트랙과 전/후 값을 보여준다", () => {
    expect(
      formatAuditMetadata("merit:threshold:update", {
        track: "SCHOOL",
        warnFrom: 20,
        warnTo: 15,
        dangerFrom: 30,
        dangerTo: 25,
      }),
    ).toBe("교내 · 경고 20→15 · 위험 30→25");
  });

  it("merit:threshold:update — 안 바뀐 쪽은 빼서 바뀐 숫자가 묻히지 않게 한다", () => {
    expect(
      formatAuditMetadata("merit:threshold:update", {
        track: "DORM",
        warnFrom: 20,
        warnTo: 20,
        dangerFrom: 30,
        dangerTo: 25,
      }),
    ).toBe("기숙사 · 위험 30→25");
  });
});
