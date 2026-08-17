/**
 * P2002가 어느 컬럼에서 났는지 본다. 드라이버 어댑터는 위반 컬럼을 `meta.target`이
 * 아니라 `meta.driverAdapterError`에 담는다 — 옛 표현도 함께 받아 둔다.
 */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: Record<string, unknown> };
  if (code !== "P2002") return false;

  const constraint = (
    meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown; index?: unknown } } }
      | undefined
  )?.cause?.constraint;

  if (Array.isArray(constraint?.fields)) return constraint.fields.includes(field);
  // 어댑터가 컬럼 목록 대신 인덱스 이름만 주는 경우 (user_email_key).
  if (typeof constraint?.index === "string") {
    return constraint.index.includes(field);
  }

  const target = meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return target === field;
}

/**
 * 한 반에 같은 번호가 이미 있을 때. 모듈마다 같은 이름의 별개 클래스를 두면
 * instanceof가 모듈을 건너 통하지 않는다 — repo들은 이 클래스를 re-export만 한다.
 */
export class NumberTakenError extends Error {}
