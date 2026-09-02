import type { RosterRow } from "./roster.parse";

export type ExistingStudent = {
  studentProfileId: string;
  userId: string;
  studentCode: string;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  hasGraduatedEnrollment: boolean;
  accountActive: boolean;
  removed: boolean;
};

export type PlannedRow = RosterRow & {
  studentProfileId: string | null;
  beforeName: string | null;
};

export type RosterPlan = {
  newStudents: PlannedRow[];
  reassign: PlannedRow[];
  statusChange: PlannedRow[];
  newAssignment: PlannedRow[];
  needsAttention: (PlannedRow & { reason: string })[];
  errorRows: RosterRow[];
  missingFromFile: ExistingStudent[];
  hasBlockingError: boolean;
};

export function planRoster(
  rows: RosterRow[],
  existing: ExistingStudent[],
): RosterPlan {
  // 기존 학생은 학생코드로만 연결한다. 이름·생년월일 일치는 수동 확인 대상이다.
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

  const seenCode = new Map<string, number>();
  const seenSeat = new Map<string, number>();
  const seenNewIdentity = new Map<string, number>();
  const dupErrors = new Map<number, string[]>();

  for (const r of rows) {
    if (r.errors.length > 0) continue;

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

    if (!r.studentCode) {
      const identity = `${r.name}|${r.birthDate}`;
      const prevIdentity = seenNewIdentity.get(identity);
      if (prevIdentity !== undefined) {
        dupErrors.set(r.line, [
          ...(dupErrors.get(r.line) ?? []),
          `${prevIdentity}행과 이름·생년월일이 같습니다.`,
        ]);
      } else seenNewIdentity.set(identity, r.line);
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
      plan.newStudents.push({ ...r, studentProfileId: null, beforeName: null });
      continue;
    }

    const before = byCode.get(r.studentCode);
    if (!before) {
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
      if (before.status === null) {
        continue;
      }
      plan.needsAttention.push({
        ...planned,
        reason:
          "학적이 비어 있습니다. 배정을 지우지 않으려면 학적을 채우세요.",
      });
      continue;
    }

    if (before.removed || before.status === null) {
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
  }

  const missing = existing.filter(
    (s) => !s.removed && !matchedIds.has(s.studentProfileId),
  );
  // 파일이 전체 명단이다. 빠진 학생은 명단에서 제외하되 졸업 기록이 있으면 보존한다.
  plan.missingFromFile = missing.filter((s) => !s.hasGraduatedEnrollment);

  for (const s of missing) {
    if (!s.hasGraduatedEnrollment) continue;
    if (s.status === null || s.status === "GRADUATED") continue;
    plan.needsAttention.push({
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
        "졸업 기록이 있는 학생인데 명단에 줄이 없습니다. " +
        "이 학생의 줄을 파일에 넣어 학적을 정하세요.",
    });
  }

  const stillNew: PlannedRow[] = [];
  for (const r of plan.newStudents) {
    const match = existing.find(
      (s) => s.name === r.name && s.birthDate === r.birthDate,
    );
    if (match) {
      plan.needsAttention.push({
        ...r,
        beforeName: match.name,
        reason: `이름·생년월일이 같은 기존 학생이 있습니다. (학생코드: ${match.studentCode})`,
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
