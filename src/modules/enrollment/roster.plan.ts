import type { RosterRow } from "./roster.parse";

/**
 * 명단 행과 현재 상태를 맞대어 무엇이 바뀔지 가른다.
 *
 * 순수 함수다 — DB를 모른다. 이 기능에서 규칙이 가장 자주 바뀔 곳이라
 * 저장 경로와 떼어 두어야 마음 놓고 고칠 수 있다.
 */

export type ExistingStudent = {
  studentProfileId: string;
  userId: string;
  name: string;
  /** YYYY-MM-DD */
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  /** 이번 반영 전, 계정이 로그인 가능한 상태였는가 (I4 감사로그의 "이전" 값). */
  accountActive: boolean;
};

export type PlannedRow = RosterRow & { studentProfileId: string | null };

export type RosterPlan = {
  newStudents: PlannedRow[];
  reassign: PlannedRow[];
  statusChange: PlannedRow[];
  /**
   * 그 학년도의 첫 배정 (I7). `before.status`가 null이라는 뜻이라 "학적이 바뀐 것"이
   * 아니라 "처음 생기는 것"이다 — 학년도가 막 넘어간 시점엔 전교생이 여기로 온다.
   * statusChange와 섞으면 미리보기가 신학년 첫 반영에서 무의미해진다 (전원이
   * 학적변동으로만 보이고 정작 재배정은 0건으로 나옴).
   */
  newAssignment: PlannedRow[];
  needsAttention: (PlannedRow & { reason: string })[];
  errorRows: RosterRow[];
  missingFromFile: ExistingStudent[];
  /** 하나라도 있으면 확정 버튼을 막는다. 절반만 반영되는 게 제일 나쁘다. */
  hasBlockingError: boolean;
};

const key = (name: string, birthDate: string) => `${name}|${birthDate}`;

export function planRoster(
  rows: RosterRow[],
  existing: ExistingStudent[],
): RosterPlan {
  const byKey = new Map<string, ExistingStudent[]>();
  for (const s of existing) {
    const k = key(s.name, s.birthDate);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }

  const plan: RosterPlan = {
    newStudents: [],
    reassign: [],
    statusChange: [],
    newAssignment: [],
    needsAttention: [],
    errorRows: [],
    missingFromFile: [],
    hasBlockingError: false,
  };

  // 파일 안에서 같은 학생이 두 번 나오거나 한 반에 번호가 겹치는지 먼저 본다.
  // DB 유일 제약에 닿기 전에 사람이 읽을 수 있는 오류로 돌려주기 위해서다.
  const seenPerson = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const dupErrors = new Map<number, string[]>();

  for (const r of rows) {
    if (r.errors.length > 0) continue;

    const pk = key(r.name, r.birthDate);
    const prevPerson = seenPerson.get(pk);
    if (prevPerson !== undefined) {
      dupErrors.set(r.line, [`${prevPerson}행과 같은 학생입니다.`]);
    } else seenPerson.set(pk, r.line);

    if (r.status === "ENROLLED") {
      const sk = `${r.grade}-${r.classNo}-${r.number}`;
      const prevSeat = seenSeat.get(sk);
      if (prevSeat !== undefined) {
        dupErrors.set(r.line, [
          ...(dupErrors.get(r.line) ?? []),
          `${prevSeat}행과 학년·반·번호가 같습니다.`,
        ]);
      } else seenSeat.set(sk, r.line);
    }
  }

  const matchedIds = new Set<string>();

  for (const r of rows) {
    const extra = dupErrors.get(r.line) ?? [];
    if (r.errors.length > 0 || extra.length > 0) {
      plan.errorRows.push({ ...r, errors: [...r.errors, ...extra] });
      continue;
    }

    const candidates = byKey.get(key(r.name, r.birthDate)) ?? [];

    if (candidates.length > 1) {
      // 잘못 이으면 남의 상벌점이 붙는다. 자동으로 정하지 않는다.
      plan.needsAttention.push({
        ...r,
        studentProfileId: null,
        reason: "이름과 생년월일이 같은 학생이 여럿입니다. 직접 지정해야 합니다.",
      });
      continue;
    }

    if (candidates.length === 0) {
      plan.newStudents.push({ ...r, studentProfileId: null });
      continue;
    }

    const before = candidates[0]!;
    matchedIds.add(before.studentProfileId);
    const planned: PlannedRow = { ...r, studentProfileId: before.studentProfileId };

    if (before.status === null) {
      // 그 학년도 배정이 아예 없었다 (I7) — 학적 "변동"이 아니라 처음 생기는 배정이다.
      plan.newAssignment.push(planned);
    } else if (before.status !== r.status) {
      plan.statusChange.push(planned);
    } else if (
      before.grade !== r.grade ||
      before.classNo !== r.classNo ||
      before.number !== r.number
    ) {
      plan.reassign.push(planned);
    }
    // 셋 다 같으면 아무 분류에도 넣지 않는다 — 바뀔 게 없다.
  }

  // 명단에 없는 재학생. 졸업인지 전출인지 파일만으로는 모르므로 추측하지 않고 보여준다.
  plan.missingFromFile = existing.filter(
    (s) => s.status === "ENROLLED" && !matchedIds.has(s.studentProfileId),
  );

  plan.hasBlockingError =
    plan.errorRows.length > 0 || plan.needsAttention.length > 0;

  return plan;
}
