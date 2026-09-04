const UA =
  "Mozilla/5.0 (compatible; RHEarlyMemeScout/1.0; +https://x.ai) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const retries = opts.retries ?? 1;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status === 1015) {
        last = new HttpError(res.status, `rate limited ${url}`);
        await sleep(600 * (i + 1));
        continue;
      }
      if (!res.ok) {
        throw new HttpError(res.status, `${res.status} ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      last = err;
      if (i < retries) await sleep(400 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

export function asAddr(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "hash" in v) {
    return String((v as { hash: string }).hash);
  }
  return "";
}

export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
