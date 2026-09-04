const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(n: number | null | undefined, fallback = "UNKNOWN"): string {
  if (n == null || Number.isNaN(n)) return fallback;
  if (Math.abs(n) >= 1000) return `$${compact.format(n)}`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}

export function formatUsdExact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "UNKNOWN";
  return usdFull.format(n);
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function formatAge(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatHolders(n: number | null | undefined): string {
  if (n == null) return "UNKNOWN";
  return compact.format(n);
}

export function formatTop10(n: number | null | undefined): string {
  if (n == null) return "UNKNOWN";
  return `${(n * 100).toFixed(1)}%`;
}

export function countdown(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function isAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}
