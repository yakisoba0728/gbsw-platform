/**
 * 트랜잭션이 충돌했는가를 보는 판정 두 개.
 *
 * 묻는 것이 다르다. 하나로 합치지 않는 이유가 여기 있다.
 *
 * - `isSerializationConflict` — **다시 열면 되는가.** 서비스가 트랜잭션째 재시도하거나
 *   「새로고침 후 다시 저장」으로 옮길 근거를 찾는다.
 * - `isTransactionFatal` — **삼키면 안 되는가.** 트랜잭션이 이미 죽었으면 오류를 눌러
 *   담아 봐야 바로 뒤 문장이 다시 죽고 원래 코드만 사라진다.
 *
 * 코드를 어느 쪽에 넣을지도 그래서 갈린다.
 *
 * | 코드 | 재시도 | 삼키지 않음 | 근거 |
 * |---|---|---|---|
 * | `P2034` | ○ | ○ | Prisma가 "쓰기 충돌 또는 교착"으로 분류한 것. 다시 열면 된다. |
 * | `TransactionWriteConflict` | ○ | ○ | 어댑터가 SQLSTATE 대신 종류만 줄 때의 같은 사건. |
 * | `40001` 직렬화 실패 | ○ | ○ | 재시도하면 풀린다. 동시에 그 트랜잭션은 이미 죽었다. |
 * | `40P01` 교착 | ✗ | ○ | Prisma가 P2034로 싸 주므로 재시도 갈래는 이미 잡는다. 날 코드로 올라오는 경로까지 재시도에 넣으면 지금 동작이 바뀐다. |
 * | `25P02` 중단된 트랜잭션 | ✗ | ○ | **원인이 아니라 여진이다.** 진짜 실패는 앞 문장에서 났고 이건 그 뒤에 남은 상태일 뿐이라, 재시도 근거로 삼으면 원인을 가린다. |
 */

/**
 * 트랜잭션을 되살릴 수 없게 만드는 Postgres 상태.
 * 40001 직렬화 충돌 · 40P01 교착 · 25P02 이미 중단된 트랜잭션.
 */
const FATAL_SQL_STATES = new Set(["40001", "40P01", "25P02"]);

/**
 * 다시 열면 되는 직렬화 충돌인가.
 *
 * `roster.service.applyRosterPlan`·`admin-user.service.updateUser`가 이걸 보고
 * ROSTER_CHANGED·YEAR_CHANGED·USER_CHANGED로 옮기고,
 * `registration.service`는 가입 트랜잭션을 다시 연다.
 *
 * 날 SQLSTATE를 `code`에서 직접 보지 않고 P2010 안쪽만 뒤진다 — Prisma를 거쳐 온
 * 오류만 재시도 대상이라는 뜻이며, 세 서비스가 지금까지 해 온 판정 그대로다.
 */
export function isSerializationConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  if (error.code === "P2034") return true;
  if (error.code !== "P2010" || !("meta" in error)) return false;

  const meta = error.meta as {
    driverAdapterError?: {
      cause?: { originalCode?: unknown; kind?: unknown };
    };
  };
  const cause = meta.driverAdapterError?.cause;
  return cause?.originalCode === "40001" || cause?.kind === "TransactionWriteConflict";
}

/**
 * 이 오류를 삼키면 안 되는가.
 *
 * Postgres는 트랜잭션 안에서 문장 하나가 실패하면 그 트랜잭션을 abort로 만든다.
 * 그래서 여기서 삼켜 봐야 바로 뒤 문장이 25P02로 죽고, 남는 건 원래 코드를 잃은
 * 정체불명 실패뿐이다. `recordAudit`의 이름 조회가 유일한 호출자다.
 *
 * 위 판정보다 넓다. 바깥 코드가 P2010인지 따지지 않고 날 SQLSTATE도 그대로 받는다 —
 * 어댑터를 거치지 않고 드라이버 오류가 올라오는 경로가 있고, 여기서는 "무엇인지
 * 모르겠으면 올려 보낸다"가 옳은 쪽이기 때문이다.
 */
export function isTransactionFatal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: Record<string, unknown> };

  // Prisma가 직접 분류해 주는 쓰기 충돌.
  if (code === "P2034") return true;
  // 어댑터를 거치지 않고 드라이버 오류가 그대로 올라온 경우.
  if (typeof code === "string" && FATAL_SQL_STATES.has(code)) return true;

  // 드라이버 어댑터는 원래 SQLSTATE를 meta.driverAdapterError 안에 감춘다 (P2010).
  const cause = (
    meta?.driverAdapterError as
      | { cause?: { originalCode?: unknown; kind?: unknown } }
      | undefined
  )?.cause;
  if (!cause) return false;
  if (cause.kind === "TransactionWriteConflict") return true;

  const originalCode = cause.originalCode;
  return typeof originalCode === "string" && FATAL_SQL_STATES.has(originalCode);
}
