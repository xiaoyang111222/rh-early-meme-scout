import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FLATTEN_MS, WATCH_MAX } from "@/lib/scout/constants";
import type { Candidate, Tier } from "@/lib/scout/types";

export type WatchEntry = {
  address: string;
  symbol: string;
  name: string;
  tier: Tier;
  entryPrice: number | null;
  entryMcap: number | null;
  watchedAt: number;
  highPrice: number | null;
  lastPrice: number | null;
  lastMcap: number | null;
  tweetUrl: string | null;
  dexUrl: string | null;
  explorerUrl: string;
};

type State = {
  items: WatchEntry[];
  watch: (c: Candidate) => { ok: boolean; reason?: string };
  drop: (address: string) => void;
  patchQuotes: (
    quotes: Array<{ address: string; priceUsd: number | null; mcapUsd: number | null }>,
  ) => void;
};

export const useWatchlist = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      watch: (c) => {
        const items = get().items;
        if (items.some((x) => x.address.toLowerCase() === c.address.toLowerCase())) {
          return { ok: true };
        }
        if (items.length >= WATCH_MAX) {
          return { ok: false, reason: `观察仓最多 ${WATCH_MAX} 个，先释放资金` };
        }
        const entry: WatchEntry = {
          address: c.address,
          symbol: c.symbol,
          name: c.name,
          tier: c.tier,
          entryPrice: c.priceUsd,
          entryMcap: c.mcapUsd,
          watchedAt: Date.now(),
          highPrice: c.priceUsd,
          lastPrice: c.priceUsd,
          lastMcap: c.mcapUsd,
          tweetUrl: c.tweetUrl,
          dexUrl: c.dexUrl,
          explorerUrl: c.explorerUrl,
        };
        set({ items: [...items, entry] });
        return { ok: true };
      },
      drop: (address) =>
        set({
          items: get().items.filter(
            (x) => x.address.toLowerCase() !== address.toLowerCase(),
          ),
        }),
      patchQuotes: (quotes) =>
        set({
          items: get().items.map((it) => {
            const q = quotes.find(
              (x) => x.address.toLowerCase() === it.address.toLowerCase(),
            );
            if (!q) return it;
            const lastPrice = q.priceUsd ?? it.lastPrice;
            const highPrice =
              lastPrice != null
                ? Math.max(it.highPrice ?? lastPrice, lastPrice)
                : it.highPrice;
            return {
              ...it,
              lastPrice,
              lastMcap: q.mcapUsd ?? it.lastMcap,
              highPrice,
            };
          }),
        }),
    }),
    { name: "rh-meme-scout-watch" },
  ),
);

export function pnlPct(entry: WatchEntry): number | null {
  if (entry.entryPrice == null || entry.lastPrice == null || entry.entryPrice === 0) {
    return null;
  }
  return ((entry.lastPrice - entry.entryPrice) / entry.entryPrice) * 100;
}

export function sentryFlags(entry: WatchEntry) {
  const pnl = pnlPct(entry);
  const age = Date.now() - entry.watchedAt;
  const sl = pnl != null && pnl <= -30;
  const tpFull = pnl != null && pnl >= 200;
  const tpHalf = pnl != null && pnl >= 100;
  const flatten =
    age >= FLATTEN_MS &&
    (entry.highPrice == null ||
      entry.lastPrice == null ||
      entry.highPrice <= (entry.entryPrice ?? 0) * 1.05);
  return { pnl, sl, tpFull, tpHalf, flatten, age };
}
