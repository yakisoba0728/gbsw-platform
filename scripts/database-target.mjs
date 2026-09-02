/**
 * 자격 증명·schema·루프백 별칭이 달라도 같은 물리 DB인지 비교한다.
 * @param {string} connectionString
 * @returns {string}
 */
export function databaseTarget(connectionString) {
  try {
    const url = new URL(connectionString);
    const rawHost = url.hostname.toLowerCase();
    const host = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(rawHost)
      ? "loopback"
      : rawHost;
    const port = url.port || "5432";
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return `${host}:${port}/${database}`;
  } catch {
    return `raw:${connectionString}`;
  }
}

/**
 * @param {string | undefined} a
 * @param {string | undefined} b
 * @returns {boolean}
 */
export function sameDatabaseTarget(a, b) {
  if (!a || !b) return false;
  return databaseTarget(a) === databaseTarget(b);
}
