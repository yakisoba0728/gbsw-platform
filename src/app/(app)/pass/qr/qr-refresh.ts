/*
 * 학생증 갱신의 판정만 모은 순수 조각이다. 화면도 fetch도 시계도 모른다 —
 * 되물어야 하는지, 코드를 지워야 하는지가 전부 여기서 정해진다.
 */

export type Outcome = "ok" | "ended" | "retry";

/* 4xx는 되물어도 답이 같다(재학 종료·세션 만료). 5xx와 네트워크 오류만 재시도한다. */
export function classify(status: number): Outcome {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400 && status < 500) return "ended";
  return "retry";
}

const ENDED_MESSAGE: Record<string, string> = {
  UNAUTHORIZED: "로그인이 풀렸습니다. 다시 로그인하세요.",
  NOT_ENROLLED: "현재 학년도 재학생만 학생증을 쓸 수 있습니다.",
};

const ENDED_FALLBACK = "학생증을 더 쓸 수 없습니다. 화면을 새로 고치세요.";

/* 사유마다 학생이 할 일이 다르다. 모르는 코드는 일반 문구로 떨어진다. */
export function endedMessage(reason: string | null | undefined): string {
  if (typeof reason !== "string") return ENDED_FALLBACK;
  return ENDED_MESSAGE[reason] ?? ENDED_FALLBACK;
}

/*
 * 유효 시간이 지난 코드는 스캔되지 않는다. 연결이 돌아오길 기다리는 동안 화면에
 * 남겨 두면 학생이 정문에서 그것을 내민다.
 */
export function keepWhileOffline(
  validUntil: string | null | undefined,
  now: number,
): boolean {
  if (!validUntil) return false;
  const deadline = new Date(validUntil).getTime();
  return Number.isFinite(deadline) && deadline > now;
}
