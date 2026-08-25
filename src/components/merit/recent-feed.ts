import { formatDateInput, formatKstDay } from "@/lib/datetime";

/**
 * 최근 부여 목록을 날짜 → 부여 한 번(일괄이면 여러 명) 순으로 접는다.
 *
 * 화면에서 떼어 둔 이유는 테스트가 node 환경이라서다 — 접는 규칙이 컴포넌트
 * 안에 있으면 검증할 방법이 없다 (`rule-filter.ts`와 같은 이유).
 */

/** 목록 한 줄. repo가 주는 것 중 접는 데 쓰는 것만 요구한다. */
export type RecentAwardEntry = {
  id: string;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  status: string;
  awardedByName: string;
  occurredOn: Date;
  createdAt: Date;
  studentProfileId: string;
  studentName: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/** 한 번의 부여. 여러 명에게 준 것이면 `entries`가 여럿이다. */
export type AwardBatch<T extends RecentAwardEntry> = {
  /** 화면 key. 같은 페이지 안에서 유일하다. */
  key: string;
  createdAt: Date;
  occurredOn: Date;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  awardedByName: string;
  entries: T[];
};

export type AwardDay<T extends RecentAwardEntry> = {
  /** KST YYYY-MM-DD. */
  key: string;
  /** 「오늘」·「어제」·「8월 25일 (화)」. */
  label: string;
  /**
   * 그 날의 아무 시각. 라벨이 「오늘」일 때 실제 날짜를 함께 적으려면 필요하다 —
   * 「오늘」만 있으면 나중에 화면을 캡처해 붙여 놓은 사람이 언제인지 모른다.
   */
  date: Date;
  batches: AwardBatch<T>[];
};

/** 하루가 몇 밀리초인가. 「어제」를 구할 때만 쓴다. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 한 번의 부여를 가리키는 열쇠.
 *
 * `batchId` 열은 없다. 대신 입력 시각으로 가른다 — `merit.repo.createAwards`가
 * 한 번의 부여에 한 시각을 찍어 넣으므로, 같은 부여의 행은 밀리초까지 같은
 * `createdAt`을 갖는다. **그 규약이 깨지면 이 화면이 조용히 흩어진다** — 반
 * 전체에 한 번 준 것이 스무 개의 부여로 보이고, 오류는 나지 않는다.
 *
 * **상태(status)는 열쇠에 넣지 않는다.** 다섯 명 중 한 명만 취소해도 그것은
 * 여전히 한 번의 부여다 — 상태로 가르면 같은 부여가 둘로 쪼개져 보인다.
 */
function batchKey(entry: RecentAwardEntry): string {
  return [
    entry.createdAt.getTime(),
    entry.kind,
    entry.points,
    entry.label,
    entry.awardedByName,
  ].join(" ");
}

/** 명단 순서. 학급 없는 학생은 뒤로 — 목록에서 사라지는 것보다 낫다. */
function byRoster(a: RecentAwardEntry, b: RecentAwardEntry): number {
  const grade = (a.grade ?? Number.MAX_SAFE_INTEGER) - (b.grade ?? Number.MAX_SAFE_INTEGER);
  if (grade !== 0) return grade;

  const classNo =
    (a.classNo ?? Number.MAX_SAFE_INTEGER) - (b.classNo ?? Number.MAX_SAFE_INTEGER);
  if (classNo !== 0) return classNo;

  const number =
    (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER);
  if (number !== 0) return number;

  return a.studentName.localeCompare(b.studentName, "ko");
}

/**
 * 날짜별 · 부여별로 접는다.
 *
 * **이어 붙은 줄만 묶는다.** 목록은 이미 입력 최신순으로 정렬돼 있으므로 같은
 * 부여는 반드시 붙어 있다. 전체를 훑어 사전으로 모으면 쪽이 나뉜 부여가 억지로
 * 합쳐지는데, 그러면 화면의 「5명」이 이 쪽에 다섯 줄이 있다는 뜻이 아니게 된다.
 * 쪽 경계에 걸친 부여는 양쪽에 나뉘어 보인다 — 그것이 사실이다.
 */
export function groupRecentAwards<T extends RecentAwardEntry>(
  entries: T[],
  now: Date,
): AwardDay<T>[] {
  const today = formatDateInput(now);
  const yesterday = formatDateInput(new Date(now.getTime() - DAY_MS));

  const days: AwardDay<T>[] = [];

  for (const entry of entries) {
    const dayKey = formatDateInput(entry.createdAt);
    let day = days.at(-1);
    if (!day || day.key !== dayKey) {
      day = {
        key: dayKey,
        label:
          dayKey === today
            ? "오늘"
            : dayKey === yesterday
              ? "어제"
              : formatKstDay(entry.createdAt),
        date: entry.createdAt,
        batches: [],
      };
      days.push(day);
    }

    const key = batchKey(entry);
    const batch = day.batches.at(-1);
    if (batch && batch.key === key) {
      batch.entries.push(entry);
      continue;
    }

    day.batches.push({
      key,
      createdAt: entry.createdAt,
      occurredOn: entry.occurredOn,
      kind: entry.kind,
      label: entry.label,
      points: entry.points,
      note: entry.note,
      awardedByName: entry.awardedByName,
      entries: [entry],
    });
  }

  // 한 번의 부여 안에서는 명단 순으로 세운다. 쪽을 나눈 뒤라 이 정렬이
  // 쪽 경계를 흔들지 않는다.
  for (const day of days) {
    for (const batch of day.batches) batch.entries.sort(byRoster);
  }

  return days;
}
