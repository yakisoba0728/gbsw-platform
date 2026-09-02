export type SearchParamsInput = Record<string, string | string[] | undefined>;

export function hrefWith(
  basePath: string,
  params: SearchParamsInput,
  patch: Record<string, string | null> = {},
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
