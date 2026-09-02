import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan } from "@/core/authz/errors";
import { isPassType, type PassType } from "@/core/authz/pass-type";
import { formatStudentNumber } from "@/lib/student-number";
import * as repo from "./pass.repo";
import { verifyStudentCode } from "./pass.token";

export type Verdict =
  | "VALID"
  | "NOT_YET"
  | "EXPIRED"
  | "NOT_APPROVED"
  | "NO_PASS"
  | "STALE"
  | "UNKNOWN";

type VerifiedStudent = {
  studentName: string;
  studentNumber: string | null;
};

type VerifiedPass = {
  type: PassType;
  startAt: Date;
  endAt: Date;
  destination: string | null;
  reason: string | null;
};

export type VerifyResult = {
  verdict: Verdict;
  student: VerifiedStudent | null;
  pass: VerifiedPass | null;
  detailed: boolean;
};

export async function verifyStudentQr(
  actor: SessionUser,
  code: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  await assertCan(actor, "pass:verify");

  const detailed = can(actor, "pass:read:any");
  const parsed = verifyStudentCode(code, now);

  if (parsed === "MALFORMED") {
    return { verdict: "UNKNOWN", student: null, pass: null, detailed };
  }

  const year = await repo.displayYear();

  // 서명이 맞지 않는 STALE 응답에는 출입증 정보를 싣지 않는다.
  if (parsed === "STALE") {
    const stale = await repo.findStudentForCard(profileIdOf(code), year);
    return {
      verdict: stale ? "STALE" : "UNKNOWN",
      student: stale ? toVerifiedStudent(stale) : null,
      pass: null,
      detailed: false,
    };
  }

  const profile = await repo.findStudentForCard(parsed.studentProfileId, year);
  if (!profile) {
    return { verdict: "UNKNOWN", student: null, pass: null, detailed };
  }

  const student = toVerifiedStudent(profile);
  const passes = await repo.listForVerify(parsed.studentProfileId, now, year);
  const picked = pick(passes, now);

  if (!picked) return { verdict: "NO_PASS", student, pass: null, detailed };

  return {
    verdict: picked.verdict,
    student,
    pass: toVerifiedPass(picked.pass, detailed),
    detailed,
  };
}

function profileIdOf(code: string): string {
  return code.slice(0, code.indexOf("."));
}

type Picked = { verdict: Verdict; pass: repo.PassWithStudent };

function pick(passes: repo.PassWithStudent[], now: Date): Picked | null {
  const at = now.getTime();
  const approved = passes.filter((p) => p.status === "APPROVED");

  const current = approved.find(
    (p) => p.startAt.getTime() <= at && p.endAt.getTime() > at,
  );
  if (current) return { verdict: "VALID", pass: current };

  const upcoming = approved.find((p) => p.startAt.getTime() > at);
  if (upcoming) return { verdict: "NOT_YET", pass: upcoming };

  const ended = approved[approved.length - 1];
  if (ended) return { verdict: "EXPIRED", pass: ended };

  const pending = passes[0];
  return pending ? { verdict: "NOT_APPROVED", pass: pending } : null;
}

function toVerifiedStudent(profile: repo.PassWithStudent["studentProfile"]) {
  const enrollment = profile.enrollments[0];
  return {
    studentName: profile.user.name,
    studentNumber: enrollment
      ? formatStudentNumber({
          grade: enrollment.grade,
          classNo: enrollment.classNo,
          number: enrollment.number,
        })
      : null,
  };
}

function toVerifiedPass(
  stored: repo.PassWithStudent,
  detailed: boolean,
): VerifiedPass {
  return {
    type: isPassType(stored.type) ? stored.type : "OUTING",
    startAt: stored.startAt,
    endAt: stored.endAt,
    destination: detailed ? stored.destination : null,
    reason: detailed ? stored.reason : null,
  };
}
