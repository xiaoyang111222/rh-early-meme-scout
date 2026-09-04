import { CHAIN_SLUG } from "./constants";
import { fetchJson, mapLimit, num } from "./http";

export type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  volume?: { h1?: number; h24?: number; m5?: number };
  priceChange?: { h1?: number; m5?: number; h24?: number };
  boosts?: { active?: number };
  txns?: { h1?: { buys?: number; sells?: number } };
};

export type TokenProfile = {
  chainId?: string;
  tokenAddress?: string;
  description?: string | null;
  url?: string;
  links?: Array<{ type?: string; url?: string; label?: string }>;
};

export async function fetchDexPairs(addresses: string[]): Promise<Map<string, DexPair>> {
  const map = new Map<string, DexPair>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  await mapLimit(unique, 3, async (addr) => {
    try {
      const rows = await fetchJson<DexPair[]>(
        `https://api.dexscreener.com/tokens/v1/${CHAIN_SLUG}/${addr}`,
        { retries: 2, timeoutMs: 8_000 },
      );
      if (!Array.isArray(rows)) return;
      for (const p of rows) {
        const key = p.baseToken?.address?.toLowerCase() ?? addr;
        const prev = map.get(key);
        const liq = p.liquidity?.usd ?? 0;
        if (!prev || (prev.liquidity?.usd ?? 0) < liq) map.set(key, p);
      }
    } catch {
      /* leave missing — UNKNOWN is safer than inventing a pool */
    }
  });
  return map;
}

export async function fetchProfiles(): Promise<Map<string, TokenProfile>> {
  const map = new Map<string, TokenProfile>();
  try {
    const rows = await fetchJson<TokenProfile[]>(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      { retries: 1 },
    );
    if (!Array.isArray(rows)) return map;
    for (const p of rows) {
      if (String(p.chainId).toLowerCase() !== CHAIN_SLUG) continue;
      if (p.tokenAddress) map.set(p.tokenAddress.toLowerCase(), p);
    }
  } catch {
    /* optional */
  }
  return map;
}

export function tweetFromProfile(p: TokenProfile | undefined): string | null {
  if (!p?.links) return null;
  const t = p.links.find(
    (l) =>
      l.type === "twitter" ||
      /x\.com|twitter\.com/i.test(l.url ?? "") ||
      /twitter/i.test(l.label ?? ""),
  );
  return t?.url ?? null;
}

export function pairStats(p: DexPair | undefined) {
  if (!p) {
    return {
      liquidityUsd: null as number | null,
      mcapUsd: null as number | null,
      priceUsd: null as number | null,
      createdAt: null as number | null,
      dexUrl: null as string | null,
      quoteSymbol: null as string | null,
      volumeH1: null as number | null,
      priceChangeH1: null as number | null,
      trending: false,
      name: null as string | null,
      symbol: null as string | null,
    };
  }
  return {
    liquidityUsd: num(p.liquidity?.usd),
    mcapUsd: num(p.marketCap) ?? num(p.fdv),
    priceUsd: num(p.priceUsd),
    createdAt: num(p.pairCreatedAt),
    dexUrl: p.url ?? null,
    quoteSymbol: p.quoteToken?.symbol ?? null,
    volumeH1: num(p.volume?.h1),
    priceChangeH1: num(p.priceChange?.h1),
    trending: (p.boosts?.active ?? 0) > 0,
    name: p.baseToken?.name ?? null,
    symbol: p.baseToken?.symbol ?? null,
  };
}
