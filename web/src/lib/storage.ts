export function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function writeList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage unavailable or full: ignore silently
  }
}

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // storage unavailable or full: ignore silently
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: ignore silently
  }
}
