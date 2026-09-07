/** JSON helpers for TEXT columns. Returns `fallback` on malformed data. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}
