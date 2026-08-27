import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan } from "@/core/authz/errors";
import { isPassType, type PassType } from "@/core/authz/pass-type";
import { formatStudentNumber } from "@/lib/student-number";
import * as repo from "./pass.repo";
import { verifyStudentCode } from "./pass.token";

/**
 * 판정. **아무것도 쓰지 않는다** — 브라우저 방문기록 재방문·프리페치가 행을
 * 만들면 안 되고, 스캔 기록을 남기지 않기로 한 설계라 남길 것도 없다.
 *
 * 읽는 코드는 **학생증**이다(출입증 한 건이 아니다). 그래서 판정이 하는 일이
 * 바뀌었다 — 「이 출입증이 유효한가」가 아니라 **「이 학생이 지금 나가도 되는가」**다.
 */

export type Verdict =
  | "VALID"
  | "NOT_YET"
  | "EXPIRED"
  | "NOT_APPROVED"
  /** 승인된 것도, 결재를 기다리는 것도 없다. 정문에서 가장 흔한 답이다. */
  | "NO_PASS"
  /** 형식은 맞는데 서명이 이 창의 것이 아니다 — 화면이 굳었다. */
  | "STALE"
  | "UNKNOWN";

export type VerifiedStudent = {
  studentName: string;
  studentNumber: string | null;
};

export type VerifiedPass = {
  type: PassType;
  startAt: Date;
  endAt: Date;
  /** pass:read:any가 없으면 null이다. */
  destination: string | null;
  reason: string | null;
};

export type VerifyResult = {
  verdict: Verdict;
  /** UNKNOWN이면 null. 그 밖에는 늘 채운다 — 학생증은 먼저 누구인지를 말한다. */
  student: VerifiedStudent | null;
  /** 말할 출입증이 없으면(NO_PASS) null. */
  pass: VerifiedPass | null;
  /** 사유·행선지를 보여도 되는가. */
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

  // 형식조차 아니면 조회하지 않는다.
  if (parsed === "MALFORMED") {
    return { verdict: "UNKNOWN", student: null, pass: null, detailed };
  }

  const year = await repo.displayYear();

  // **STALE에서는 출입증을 싣지 않는다.** 이 갈래는 서명이 맞지 않은 채로
  // 들어온 것이라, 프로필 id만 알면 누구나 도달할 수 있다. 이름·학번까지는
  // 「김민준님, 화면을 새로 고쳐 주세요」를 말하는 데 필요해서 남긴다.
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
  // 서명은 맞는데 학생이 없다 — 명단에서 빠진 뒤의 옛 코드다.
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

/**
 * STALE 갈래에서만 쓴다. `verifyStudentCode`가 MALFORMED를 이미 걸러낸 뒤라
 * 점이 반드시 있고 앞이 비어 있지 않다 — null이 나올 자리가 없다.
 */
function profileIdOf(code: string): string {
  return code.slice(0, code.indexOf("."));
}

type Picked = { verdict: Verdict; pass: repo.PassWithStudent };

/**
 * 여러 건을 들고 있는 학생에게 **무엇을 말할지** 고른다. 순서에 뜻이 있다 —
 * 정문에서 묻는 것은 「지금 나가도 되는가」 하나이므로, 답이 「된다」인 것이
 * 하나라도 있으면 그것을 말한다.
 *
 *   1. 지금 시각을 품은 승인 건 → VALID
 *   2. 아직 시작 전인 승인 건 중 가장 이른 것 → NOT_YET
 *   3. 오늘 끝난 승인 건 → EXPIRED («있었지만 지났다»는 정문에서 할 말이 있다)
 *   4. 결재를 기다리는 건 → NOT_APPROVED
 *
 * **반려·취소는 고르지 않는다.** repo가 아예 안 읽어 온다 — 학생증은 로그인한
 * 누구나 찍을 수 있어서, 「반려됨」을 띄우면 남의 신청 이력이 새는데 정문에서
 * 그 말이 필요한 자리가 없다. 그런 학생은 NO_PASS로 떨어진다.
 */
function pick(passes: repo.PassWithStudent[], now: Date): Picked | null {
  const at = now.getTime();
  const approved = passes.filter((p) => p.status === "APPROVED");

  const current = approved.find(
    (p) => p.startAt.getTime() <= at && p.endAt.getTime() >= at,
  );
  if (current) return { verdict: "VALID", pass: current };

  // repo가 startAt 오름차순으로 준다 — 앞에서 만나는 것이 가장 이른 것이다.
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
          grade: enrollment.schoolClass?.grade ?? null,
          classNo: enrollment.schoolClass?.classNo ?? null,
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
    // DB에 모르는 값이 있으면 캐스트가 조용히 거짓말을 한다 — 외출로 떨어뜨린다.
    type: isPassType(stored.type) ? stored.type : "OUTING",
    startAt: stored.startAt,
    endAt: stored.endAt,
    destination: detailed ? stored.destination : null,
    reason: detailed ? stored.reason : null,
  };
}
