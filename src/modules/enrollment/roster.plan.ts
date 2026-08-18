import type { RosterRow } from "./roster.parse";

/** 명단 행과 현재 상태를 맞대어 무엇이 바뀔지 가른다. DB를 모르는 순수 함수다. */

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
  /** 이번 반영 전, 계정이 로그인 가능한 상태였는가. */
  accountActive: boolean;
  /**
   * 이미 명단에서 빠진(소프트 삭제된) 계정인가. 코드 매칭에는 그대로 쓰여
   * 되살아날 수 있게 하되, missingFromFile에서는 뺀다. 값이 없으면 삭제 안 됨이다.
   */
  deleted?: boolean;
};

export type PlannedRow = RosterRow & {
  studentProfileId: string | null;
  /** 학생코드로 이어진 DB 쪽 이름. 무엇에 이어졌는지 눈으로 확인하는 값이다. */
  beforeName: string | null;
};

export type RosterPlan = {
  newStudents: PlannedRow[];
  reassign: PlannedRow[];
  statusChange: PlannedRow[];
  /**
   * 그 학년도의 첫 배정. 학적이 "바뀐" 것이 아니라 처음 생기는 것이라 따로 센다 —
   * 학년도가 막 넘어간 시점엔 전교생이 여기로 온다.
   */
  newAssignment: PlannedRow[];
  needsAttention: (PlannedRow & { reason: string })[];
  errorRows: RosterRow[];
  /**
   * 명단 파일에 없는 학생 = 삭제 대상. 파일이 전교생 완성본이라 학적과 무관하게
   * 명단에 없으면 전부 여기 온다.
   */
  missingFromFile: ExistingStudent[];
  /** 하나라도 있으면 확정 버튼을 막는다. 절반만 반영되는 게 제일 나쁘다. */
  hasBlockingError: boolean;
};

export function planRoster(
  rows: RosterRow[],
  existing: ExistingStudent[],
): RosterPlan {
  // studentCode는 유일 제약이 걸려 있어 코드당 기존 학생은 많아야 하나다.
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

  // 파일 안의 중복을 먼저 본다. DB 유일 제약에 닿기 전에 읽을 수 있는 오류로 돌려준다.
  const seenCode = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const dupErrors = new Map<number, string[]>();

  for (const r of rows) {
    if (r.errors.length > 0) continue;

    // 빈 학생코드는 전부 "신규"라 서로 겹쳐도 다른 사람이다.
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
      // 빈 학생코드 = 신규. 코드가 지워진 기존 학생인지는 아래 루프 뒤에 다시 본다.
      plan.newStudents.push({ ...r, studentProfileId: null, beforeName: null });
      continue;
    }

    const before = byCode.get(r.studentCode);
    if (!before) {
      // 잘못 이으면 남의 상벌점이 붙는다. 자동으로 정하지 않는다.
      plan.needsAttention.push({
        ...r,
        studentProfileId: null,
        beforeName: null,
        reason: "명단에 없는 학생코드입니다.",
      });
      continue;
    }

    matchedIds.add(before.studentProfileId);
    const planned: PlannedRow = {
      ...r,
      studentProfileId: before.studentProfileId,
      beforeName: before.name,
    };

    // 열이 한 칸 밀린 파일은 코드만 어긋난다. 코드는 맞는데 이름·생년월일이
    // 다르면 사람이 봐야 한다.
    if (r.name !== before.name || r.birthDate !== before.birthDate) {
      plan.needsAttention.push({
        ...planned,
        reason:
          `파일의 이름/생년월일이 등록된 학생과 다릅니다. ` +
          `(등록된 값: ${before.name} · ${before.birthDate})`,
      });
      continue;
    }

    if (r.status === null) {
      // 학적·학년·반·번호가 넷 다 빈 줄이다.
      if (before.status === null) {
        // 원래도 이 학년도 배정이 없었다. 왕복이 0건이 되도록 어디에도 넣지 않는다.
        continue;
      }
      // 배정이 있었는데 파일에서 비었다 — 사람이 학적란을 지운 흔적이다.
      plan.needsAttention.push({
        ...planned,
        reason:
          "학적이 비어 있어 확정하면 이 학생의 이번 학년도 배정이 삭제됩니다. " +
          "졸업·자퇴 등 학적을 입력했는지, 실수로 지운 건 아닌지 확인해 주세요.",
      });
      continue;
    }

    if (before.status === null) {
      // 그 학년도 배정이 아예 없었다 — 학적 변동이 아니라 처음 생기는 배정이다.
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

  // 명단에 없는 학생은 학적과 무관하게 전부 삭제 대상이다. 이미 삭제된 학생은
  // 매번 다시 확인시키지 않으려고 뺀다.
  plan.missingFromFile = existing.filter(
    (s) => !matchedIds.has(s.studentProfileId) && !s.deleted,
  );

  // 신규 줄의 이름·생년월일이 삭제 대상과 겹치면 학생코드 칸만 지워진 것으로 본다.
  // 자동으로 잇지는 않는다 — 잘못 이으면 남의 코드가 붙는다.
  const stillNew: PlannedRow[] = [];
  for (const r of plan.newStudents) {
    const match = plan.missingFromFile.find(
      (s) => s.name === r.name && s.birthDate === r.birthDate,
    );
    if (match) {
      plan.needsAttention.push({
        ...r,
        beforeName: match.name,
        reason: `학생코드가 지워진 것 같습니다. (일치하는 기존 학생의 코드: ${match.studentCode})`,
      });
    } else {
      stillNew.push(r);
    }
  }
  plan.newStudents = stillNew;

  plan.hasBlockingError =
    plan.errorRows.length > 0 || plan.needsAttention.length > 0;

  return plan;
}
