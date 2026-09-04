import { CHAIN_ID, ZERO } from "./constants";
import { fetchJson } from "./http";
import type { StockAsset } from "./types";

type Rhj = {
  assets?: Array<{
    tokenSymbol?: string;
    tokenName?: string;
    logoUrl?: string | null;
    status?: string;
    deployments?: Array<{
      contractAddress?: string;
      chainId?: number | string;
    }>;
  }>;
};

let cache: { at: number; rows: StockAsset[] } | null = null;

export async function fetchStockAssets(): Promise<StockAsset[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  try {
    const d = await fetchJson<Rhj>("https://api.robinhood.com/rhj/assets", {
      timeoutMs: 10_000,
    });
    const rows: StockAsset[] = [];
    for (const a of d.assets ?? []) {
      const dep = (a.deployments ?? []).find(
        (x) => Number(x.chainId) === CHAIN_ID && x.contractAddress,
      );
      if (!dep?.contractAddress) continue;
      rows.push({
        symbol: a.tokenSymbol ?? "—",
        name: (a.tokenName ?? "").replace(" • Robinhood Token", ""),
        contract: dep.contractAddress,
        logoUrl: a.logoUrl ?? null,
        status: a.status ?? "",
      });
    }
    rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}

export function matchStock(
  pairToken: string | null,
  stocks: StockAsset[],
): StockAsset | null {
  if (!pairToken) return null;
  const p = pairToken.toLowerCase();
  if (p === ZERO.toLowerCase()) return null;
  return stocks.find((s) => s.contract.toLowerCase() === p) ?? null;
}
