/**
 * P2002(유일 제약 위반)가 어느 컬럼에서 났는지 본다.
 *
 * Prisma 7은 네이티브 엔진 없이 드라이버 어댑터로만 접속하므로 위반 컬럼이
 * 예전처럼 `meta.target`에 오지 않고, 어댑터가 옮겨 준
 * `meta.driverAdapterError.cause.constraint.fields`에 담긴다.
 * 옛 표현도 함께 받아 둔다 — 어댑터 없이 돌 때나 버전이 바뀔 때를 위해서다.
 *
 * `admin-users`와 `registration` 두 모듈이 같은 판정을 쓰므로 여기 core/db로 옮겨왔다.
 * (원래 admin-user.repo.ts에 있던 헬퍼 — 로직은 그대로다.)
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
 * 한 반에 같은 번호가 이미 있을 때.
 *
 * 소속에 반·번호를 쓰는 모듈이 여럿(사용자 상세·학생 표·명단 반영·가입)이라
 * 여기 둔다. 모듈마다 같은 이름의 별개 클래스를 두면 instanceof가 모듈을 건너
 * 통하지 않아 조용히 새는 자리가 된다 — 각 모듈의 repo는 이 클래스를 import해
 * re-export만 한다. **숫자를 세어 적지 않는다**: 예전엔 "경로가 셋"이라고 적혀
 * 있었는데 네 번째가 생겼을 때 아무도 이 줄을 고치지 않았고, 그 네 번째가 바로
 * 별개 클래스를 새로 만든 곳이었다.
 */
export class NumberTakenError extends Error {}
