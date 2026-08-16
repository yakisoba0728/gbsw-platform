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
  /**
   * 명단에서 빠져 이미 소프트 삭제된 계정인가. optional — repo가 항상 채워 주지만,
   * 값이 없는 옛 테스트 픽스처는 "삭제 안 됨"으로 취급한다(허위 음성이 안전한 방향).
   * byCode 매칭에는 그대로 쓰여 되살아날 수 있게 하되, missingFromFile·totalStudents
   * 에서는 뺀다 — 이미 지운 사람을 매번 다시 삭제 확인시키지 않기 위해서다.
   */
  deleted?: boolean;
};

export type PlannedRow = RosterRow & {
  studentProfileId: string | null;
  /** 학생코드로 이어진 DB 쪽 이름. 매칭이 코드로만 되고 화면은 파일의 이름을
   * 보여주므로, 실제로 무엇에 이어졌는지 사람이 눈으로 다시 확인할 수 있게 둔다.
   * 코드가 없거나(신규) DB에 없는 코드면 null이다. */
  beforeName: string | null;
};

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
  /**
   * 명단 파일에 없는 학생 = **삭제 대상**. 파일이 전교생 완성본(배정 없는 학생도 빈
   * 줄로 나간다)이므로, 재학·졸업·자퇴 등 학적과 무관하게 명단에 없으면 전부 여기
   * 온다. 확정하면 계정째 지워진다 — applyRosterPlan이 미리보기가 준 삭제 대상
   * id 집합과 다시 대조하고(I-2), 대량 삭제면 건수 확인도 강제한다(I-3).
   */
  missingFromFile: ExistingStudent[];
  /** 하나라도 있으면 확정 버튼을 막는다. 절반만 반영되는 게 제일 나쁘다. */
  hasBlockingError: boolean;
  /**
   * 지금 재학 중인 학생 수. 대량 삭제 임계값(bulkDeleteThreshold)의 분모다 —
   * 화면과 서비스가 같은 값을 봐야 같은 임계를 계산하므로, 서버가 다시 세운
   * plan에 실어 함께 돌려준다.
   *
   * **existing 전체가 아니다.** 졸업생·소프트 삭제된 학생은 빠진다 — 이유는
   * 아래 planRoster()의 계산부 주석에 적었다.
   */
  totalStudents: number;
};

/** 대량 삭제 확인(건수 직접 입력)을 요구하기 시작하는 절대 하한. */
export const BULK_DELETE_MIN_COUNT = 10;
/** 대량 삭제 확인을 요구하기 시작하는 비율 — 전체 학생의 10%. */
export const BULK_DELETE_PERCENT = 0.1;

/**
 * 삭제 건수가 이 값을 **넘으면**(`>`, 같으면 아니다) 체크박스만으로 부족하다 —
 * 화면은 건수 직접 입력을 요구하고, 서비스는 같은 값을 다시 계산해 대조한다
 * (I-3). "10명 또는 전체 학생의 10% 중 큰 쪽" — 소규모 학교에서 10%가 10명
 * 미만이어도 최소 10명은 지키고, 대규모 학교에서는 절대 수 10명이 너무 낮아
 * 정상적인 학기말 정리마다 걸리는 것을 막는다.
 *
 * 정수로 반올림하지 않는다 — 삭제 건수는 항상 정수이므로 `deleteCount > threshold`
 * 비교에는 반올림 방향을 고민할 필요가 없고, 반올림을 넣으면 그 방향(올림/버림)이
 * 화면과 서비스 사이에서 어긋날 여지만 생긴다.
 */
export function bulkDeleteThreshold(totalStudents: number): number {
  return Math.max(BULK_DELETE_MIN_COUNT, totalStudents * BULK_DELETE_PERCENT);
}

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
    // 대량 삭제 임계(bulkDeleteThreshold)의 분모 — **지금 재학 중인 학생만** 센다.
    //
    // existing은 학생을 studentCode로 이어붙이기 위해 학교가 지금까지 만든 모든
    // StudentProfile을 들고 있다(roster.repo.ts의 listExisting 주석 참고). 그
    // 전체를 분모로 쓰면 졸업생이 해마다 쌓이는 만큼 임계가 함께 올라간다 —
    // 개교 4년 차에 재학 300·졸업 300이면 임계가 30이 아니라 60이 되어, 한 반이
    // 통째로 빠진 잘못된 파일도 안전장치를 그냥 지나간다. 소프트 삭제된 학생을
    // 빼는 것만으로는 부족했다(그건 같은 부풀림의 한 갈래일 뿐이다).
    //
    // 학년도가 막 넘어가 아무도 배정을 못 받은 시점에는 이 값이 0이 되고 임계는
    // 절대 하한 10명으로 떨어진다 — 확인을 더 자주 요구하는 쪽이라 안전하다.
    totalStudents: existing.filter((s) => !s.deleted && s.status === "ENROLLED").length,
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
      // 이름+생년월일이 missingFromFile 학생과 겹치는지는 matchedIds가 다 모인 뒤에야
      // 판단할 수 있다 — 아래 루프 뒤에서 다시 훑어 needsAttention으로 옮긴다.
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
        reason: "명단에 없는 학생코드입니다. 오타이거나 다른 학교 파일일 수 있습니다.",
      });
      continue;
    }

    matchedIds.add(before.studentProfileId);
    const planned: PlannedRow = {
      ...r,
      studentProfileId: before.studentProfileId,
      beforeName: before.name,
    };

    // 이름 대조를 없앤 대가다 — 엑셀에서 한 열만 밀리면 학생코드만 어긋난 파일이
    // 되는데, 코드만 보고 이으면 오류도 확인도 없이 두 학생의 자리가 서로
    // 바뀐다. 코드는 맞는데 이름·생년월일이 등록된 값과 다르면 사람이 봐야 한다.
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

  // 명단에 없는 학생은 학적과 무관하게 전부 삭제 대상이다. 예전엔 status === "ENROLLED"
  // 인 학생만 걸러 "그 학년도 배정이 사라진다"는 경고로만 썼지만, 파일이 이제 전교생
  // 완성본(배정 없는 학생도 빈 줄로 나간다)이라 명단에 없다는 것 자체가 "지웠다"는
  // 뜻이다. 필터를 남겨두면 졸업생 줄을 지웠을 때 아무 일도 안 일어나 "지우면 삭제"
  // 규칙이 깨진다.
  // 이미 삭제된 학생은 아직도 파일에 없더라도 다시 missingFromFile에 넣지 않는다 —
  // 이미 지운 사람을 매번 "삭제하시겠습니까"로 재확인시키는 건 소음일 뿐이다.
  plan.missingFromFile = existing.filter(
    (s) => !matchedIds.has(s.studentProfileId) && !s.deleted,
  );

  // 신규 줄인데 이름+생년월일이 "명단에 없는 학생"과 일치하면 학생코드 칸만 지워진
  // 것으로 의심한다. 지금까지는 신규 쪽과 missingFromFile 쪽을 따로 보여줘서 둘을
  // 이어 읽지 않으면 "코드가 지워졌다"로 읽히지 않았다 — 여기서 명시적으로 연결한다.
  // 자동으로 이어붙이지는 않는다(studentProfileId는 여전히 null) — 잘못 이으면 남의
  // 학생코드가 그대로 붙어버리는, 이 기능이 막으려는 바로 그 사고가 난다.
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
