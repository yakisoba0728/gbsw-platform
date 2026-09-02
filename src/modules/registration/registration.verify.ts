export function normalizeName(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").normalize("NFC");
}

export function nameMatches(expected: string, actual: string): boolean {
  return normalizeName(expected) === normalizeName(actual);
}

export function birthDateMatches(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}
