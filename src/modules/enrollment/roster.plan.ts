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
  /**
   * 어느 학년도든 졸업 기록이 있는가. true면 명단 누락만으로 물리 삭제하지 않는다 —
   * roster.repo의 삭제 가드(`enrollments: { none: { status: "GRADUATED" } }`)와 같은
   * 기준이다. 연도를 가리지 않으므로 `status`(이번 학년도 배정)와 함께 봐야 한다.
   */
  hasGraduatedEnrollment: boolean;
  /** 이번 반영 전, 계정이 로그인 가능한 상태였는가. */
  accountActive: boolean;
  /** 예전 deletedAt 표시. 새 명단 삭제 경로는 이 값을 만들지 않는다. */
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

  // 명단에 없는 학생은 삭제 대상이다. 단, 졸업생은 이미 떠난 학생의 보존 기록이라
  // 완성본 파일에서 빠졌다는 이유만으로 계정·상벌점까지 물리 삭제하면 안 된다.
  // 면제 기준을 repo의 삭제 가드(`enrollments: { none: { status: "GRADUATED" } }`)와
  // 똑같이 잡는다 — 어긋나면 "지운다고 세어 화면에 보이고 감사로그까지 남긴 뒤
  // 실제로는 안 지우는" 상태가 된다.
  const missing = existing.filter((s) => !matchedIds.has(s.studentProfileId));
  plan.missingFromFile = missing.filter((s) => !s.hasGraduatedEnrollment);

  // 졸업 기록이 있는데 이번 학년도 배정이 졸업이 아닌 학생(재입학·오등록)은 면제만
  // 하고 두면 어느 분류에도 안 들어가 미리보기에서 통째로 사라진다. 그래 놓고 서비스는
  // 그 배정을 untouched로 실어 그대로 다시 넣는다 — 교사가 줄을 지운 사실이 화면에도
  // 기록에도 남지 않는다. 자동으로 정할 수 없는 상태라 확인 필요로 올려 확정을 막는다.
  // (이번 학년도 배정이 없거나 졸업인 학생은 그대로 면제한다 — 지난 학년도 졸업생의
  // 보존 기록이고, 확정하면 서비스가 그 배정을 있는 그대로 다시 쓴다.)
  for (const s of missing) {
    if (!s.hasGraduatedEnrollment) continue;
    if (s.status === null || s.status === "GRADUATED") continue;
    plan.needsAttention.push({
      // 파일에 대응하는 줄이 없다. 서비스의 untouched와 같은 표시를 쓴다.
      line: 0,
      studentCode: s.studentCode,
      name: s.name,
      birthDate: s.birthDate,
      grade: s.grade,
      classNo: s.classNo,
      number: s.number,
      status: s.status as RosterRow["status"],
      errors: [],
      studentProfileId: s.studentProfileId,
      beforeName: s.name,
      reason:
        "졸업 기록이 있는 학생인데 이번 학년도 학적이 졸업이 아니고 명단에도 줄이 " +
        "없습니다. 이 학생의 줄을 파일에 넣어 학적을 정해 주세요.",
    });
  }

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
