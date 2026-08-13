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
  /** 학생을 알아보는 유일한 기준. src/lib/student-code.ts가 만든다. */
  studentCode: string;
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

export function planRoster(
  rows: RosterRow[],
  existing: ExistingStudent[],
): RosterPlan {
  // DB 유일 제약(StudentProfile.studentCode) 덕에 studentCode당 기존 학생은 많아야 하나다.
  const byCode = new Map<string, ExistingStudent>();
  for (const s of existing) {
    byCode.set(s.studentCode, s);
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

  // 파일 안에서 같은 학생코드가 두 번 나오거나 한 반에 번호가 겹치는지 먼저 본다.
  // DB 유일 제약에 닿기 전에 사람이 읽을 수 있는 오류로 돌려주기 위해서다.
  const seenCode = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const dupErrors = new Map<number, string[]>();

  for (const r of rows) {
    if (r.errors.length > 0) continue;

    // 빈 학생코드는 전부 "신규"라는 뜻이라 서로 겹쳐도 다른 사람이다 — 여기서 빼야 한다.
    if (r.studentCode) {
      const prevCode = seenCode.get(r.studentCode);
      if (prevCode !== undefined) {
        dupErrors.set(r.line, [`${prevCode}행과 같은 학생코드입니다.`]);
      } else seenCode.set(r.studentCode, r.line);
    }

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

    if (!r.studentCode) {
      // 빈 학생코드 = 신규. 예전 서식(학생코드 열이 아예 없음)에서는 전 줄이 여기로 온다.
      plan.newStudents.push({ ...r, studentProfileId: null });
      continue;
    }

    const before = byCode.get(r.studentCode);
    if (!before) {
      // 잘못 이으면 남의 상벌점이 붙는다. 자동으로 정하지 않는다.
      plan.needsAttention.push({
        ...r,
        studentProfileId: null,
        reason: "명단에 없는 학생코드입니다. 오타이거나 다른 학교 파일일 수 있습니다.",
      });
      continue;
    }

    matchedIds.add(before.studentProfileId);
    const planned: PlannedRow = { ...r, studentProfileId: before.studentProfileId };

    if (r.status === null) {
      // 학적·학년·반·번호가 넷 다 빈 줄이다 (normalizeRows가 오류로 잡지 않는다).
      if (before.status === null) {
        // 원래도 이 학년도 배정이 없었다 — 무변경. 어느 분류에도 넣지 않는다.
        // 배정 없는 학생을 내려받아 그대로 올렸을 때 이 경로를 타야 왕복이 0건이 된다.
        continue;
      }
      // 원래는 배정이 있었는데 파일에서 비었다 — 사람이 학적란을 지운 흔적이다.
      // 자동으로 배정을 지우지 않는다: 확정 저장 경로(applyRosterPlan)는 이 줄을
      // assignments에 넣지 않고, 그렇다고 missingFromFile도 아니라서 "그대로 둔
      // 학생"으로 다시 채워 넣힐 뻔한다 — needsAttention으로 막아 사람이 졸업·자퇴
      // 같은 실제 학적을 입력하거나 파일을 원래대로 되돌리게 한다.
      plan.needsAttention.push({
        ...planned,
        reason:
          "학적이 비어 있어 확정하면 이 학생의 이번 학년도 배정이 삭제됩니다. " +
          "졸업·자퇴 등 학적을 입력했는지, 실수로 지운 건 아닌지 확인하세요.",
      });
      continue;
    }

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
