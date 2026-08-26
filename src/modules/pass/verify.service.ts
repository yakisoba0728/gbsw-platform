import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan } from "@/core/authz/errors";
import { isPassType, type PassType } from "@/core/authz/pass-type";
import { formatStudentNumber } from "@/lib/student-number";
import * as repo from "./pass.repo";
import { verifyToken } from "./pass.token";

/**
 * 판정. **아무것도 쓰지 않는다** — 브라우저 방문기록 재방문·프리페치가 행을
 * 만들면 안 되고, 스캔 기록을 남기지 않기로 한 설계라 남길 것도 없다.
 */

export type Verdict =
  | "VALID"
  | "NOT_YET"
  | "EXPIRED"
  | "NOT_APPROVED"
  | "REJECTED"
  | "CANCELLED"
  /** 형식은 맞는데 서명이 이 창의 것이 아니다 — 화면이 굳었다. */
  | "STALE"
  | "UNKNOWN";

export type VerifiedPass = {
  studentName: string;
  studentNumber: string | null;
  type: PassType;
  startAt: Date;
  endAt: Date;
  /** pass:read:any가 없으면 null이다. */
  destination: string | null;
  reason: string | null;
};

export type VerifyResult = {
  verdict: Verdict;
  /** UNKNOWN이면 null. STALE에서는 채운다 — 「누구의 화면이 굳었는지」를 말해야 한다. */
  pass: VerifiedPass | null;
  /** 사유·행선지를 보여도 되는가. */
  detailed: boolean;
};

export async function verifyPassToken(
  actor: SessionUser,
  token: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  await assertCan(actor, "pass:verify");

  const detailed = can(actor, "pass:read:any");
  const parsed = verifyToken(token, now);

  // 형식조차 아니면 조회하지 않는다.
  if (parsed === "MALFORMED") return { verdict: "UNKNOWN", pass: null, detailed };

  const passId = parsed === "STALE" ? passIdOf(token) : parsed.passId;
  const stored = await repo.findPassForVerify(passId, await repo.displayYear());

  if (!stored) return { verdict: "UNKNOWN", pass: null, detailed };

  // **STALE에서는 사유·행선지를 싣지 않는다.** 이 갈래는 서명이 맞지 않은 채로
  // 들어온 것이라, passId만 알면 누구나 도달할 수 있다. 이름·유형·기간까지는
  // 「김민준 학생, 화면을 새로 고쳐 주세요」를 말하는 데 필요해서 남기고,
  // 그보다 안쪽은 서명이 맞았을 때만 연다.
  if (parsed === "STALE") {
    return { verdict: "STALE", pass: toVerifiedPass(stored, false), detailed: false };
  }

  return {
    verdict: verdictFor(stored, now),
    pass: toVerifiedPass(stored, detailed),
    detailed,
  };
}

/**
 * STALE 갈래에서만 쓴다. `verifyToken`이 MALFORMED를 이미 걸러낸 뒤라
 * 점이 반드시 있고 앞이 비어 있지 않다 — null이 나올 자리가 없다.
 */
function passIdOf(token: string): string {
  return token.slice(0, token.indexOf("."));
}

function verdictFor(
  pass: { status: string; startAt: Date; endAt: Date },
  now: Date,
): Verdict {
  if (pass.status === "CANCELLED") return "CANCELLED";
  if (pass.status === "REJECTED") return "REJECTED";
  if (pass.status !== "APPROVED") return "NOT_APPROVED";
  if (now.getTime() < pass.startAt.getTime()) return "NOT_YET";
  if (now.getTime() > pass.endAt.getTime()) return "EXPIRED";
  return "VALID";
}

function toVerifiedPass(
  stored: repo.PassWithStudent,
  detailed: boolean,
): VerifiedPass {
  const enrollment = stored.studentProfile.enrollments[0];

  return {
    studentName: stored.studentProfile.user.name,
    studentNumber: enrollment
      ? formatStudentNumber({
          grade: enrollment.schoolClass?.grade ?? null,
          classNo: enrollment.schoolClass?.classNo ?? null,
          number: enrollment.number,
        })
      : null,
    // DB에 모르는 값이 있으면 캐스트가 조용히 거짓말을 한다 — 외출로 떨어뜨린다.
    type: isPassType(stored.type) ? stored.type : "OUTING",
    startAt: stored.startAt,
    endAt: stored.endAt,
    destination: detailed ? stored.destination : null,
    reason: detailed ? stored.reason : null,
  };
}
