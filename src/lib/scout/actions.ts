import { createServerFn } from "@tanstack/react-start";
import { isAddress } from "./format";
import type { StockAsset } from "./types";

export const scanRadar = createServerFn({ method: "POST" })
  .validator((input: { force?: boolean } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { runScan } = await import("./scan.server");
    return runScan(Boolean(data?.force));
  });

export const inspectToken = createServerFn({ method: "POST" })
  .validator((input: { address: string }) => {
    const address = input.address.trim();
    if (!isAddress(address)) throw new Error("需要 0x 开头的 40 位合约地址");
    return { address };
  })
  .handler(async ({ data }) => {
    const { inspectAddress } = await import("./scan.server");
    return inspectAddress(data.address);
  });

export const refreshQuotes = createServerFn({ method: "POST" })
  .validator((input: { addresses: string[] }) => ({
    addresses: (input.addresses ?? []).filter(isAddress).slice(0, 8),
  }))
  .handler(async ({ data }) => {
    const { quotePrices } = await import("./scan.server");
    return quotePrices(data.addresses);
  });

export const listStocks = createServerFn({ method: "GET" }).handler(
  async (): Promise<StockAsset[]> => {
    const { fetchStockAssets } = await import("./stocks");
    return fetchStockAssets();
  },
);

export const scoreTokenNarrative = createServerFn({ method: "POST" })
  .validator((input: {
    name: string;
    symbol: string;
    narrative: string | null;
    tweetUrl: string | null;
    stockPair: string | null;
  }) => input)
  .handler(async ({ data }) => {
    const { scoreNarrative } = await import("./scan.server");
    return scoreNarrative(data);
  });
