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
  if (typeof constraint?.index === "string") {
    return constraint.index.includes(field);
  }

  const target = meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return target === field;
}

export class NumberTakenError extends Error {}
