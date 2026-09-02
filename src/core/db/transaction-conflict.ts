const FATAL_SQL_STATES = new Set(["40001", "40P01", "25P02"]);

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

// 재시도 가능한 충돌보다 넓게, 이미 중단되어 계속 쓸 수 없는 트랜잭션도 판별한다.
export function isTransactionFatal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: Record<string, unknown> };

  if (code === "P2034") return true;
  if (typeof code === "string" && FATAL_SQL_STATES.has(code)) return true;

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
