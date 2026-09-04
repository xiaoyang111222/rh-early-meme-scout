import {
  HYDRATE_MAX,
  SCAN_TTL_MS,
  SMART_BUY_USD,
  SMART_WINDOW_MS,
  USDG,
  WETH,
  ZERO,
} from "./constants";
import {
  explorerToken,
  fetchContractFlags,
  fetchFactoryEvents,
  fetchHolders,
  fetchLargeBuys,
  fetchTokenInfo,
  ponsLaunch,
} from "./blockscout";
import { fetchDexPairs, fetchProfiles, pairStats, tweetFromProfile } from "./dexscreener";
import { applyGrade, buildLights, buildSoft } from "./filters";
import { mapLimit, num } from "./http";
import { fetchStockAssets, matchStock } from "./stocks";
import { erc20Meta } from "./rpc";
import type { Candidate, ScanResult, Stage, StockPair } from "./types";

type Cache = { at: number; result: ScanResult };
let cache: Cache | null = null;

function quoteLabel(pairToken: string | null, stocks: Awaited<ReturnType<typeof fetchStockAssets>>) {
  if (!pairToken) return "ETH";
  const p = pairToken.toLowerCase();
  if (p === ZERO.toLowerCase()) return "ETH";
  if (p === WETH.toLowerCase()) return "WETH";
  if (p === USDG.toLowerCase()) return "USDG";
  const s = matchStock(pairToken, stocks);
  return s?.symbol ?? "OTHER";
}

export async function runScan(force = false): Promise<ScanResult> {
  if (!force && cache && Date.now() - cache.at < SCAN_TTL_MS) return cache.result;
  const scannedAt = new Date().toISOString();
  try {
    const [{ events, pages }, stocks, profiles] = await Promise.all([
      fetchFactoryEvents(),
      fetchStockAssets(),
      fetchProfiles(),
    ]);

    const deployerCount = new Map<string, number>();
    const locked = new Set<string>();
    const launched = new Map<
      string,
      { at: string | null; deployer: string | null; pairToken: string | null }
    >();
    const graduated = new Map<string, string | null>();

    for (const e of events) {
      if (e.deployer) {
        const k = e.deployer.toLowerCase();
        if (e.method === "TokenLaunched") deployerCount.set(k, (deployerCount.get(k) ?? 0) + 1);
      }
      if (e.method === "GraduationTokensPermanentlyLocked" && e.token) {
        locked.add(e.token.toLowerCase());
      }
      if (e.method === "TokenLaunched" && e.token) {
        const k = e.token.toLowerCase();
        if (!launched.has(k)) {
          launched.set(k, {
            at: e.timestamp,
            deployer: e.deployer,
            pairToken: e.pairToken,
          });
        }
      }
      if (e.method === "PoolGraduated" && e.token) {
        const k = e.token.toLowerCase();
        if (!graduated.has(k)) graduated.set(k, e.timestamp);
      }
    }

    const graduateList = [...graduated.keys()];
    const newestList = [...launched.keys()].filter((a) => !graduated.has(a));
    const pick: { address: string; stage: Stage }[] = [];
    for (const a of graduateList) {
      if (pick.length >= HYDRATE_MAX) break;
      pick.push({ address: a, stage: "graduated" });
    }
    for (const a of newestList) {
      if (pick.length >= HYDRATE_MAX) break;
      pick.push({ address: a, stage: "bonding" });
    }

    const dexMap = await fetchDexPairs(pick.map((p) => p.address));

    const hydrated = await mapLimit(pick, 3, async (row) => {
      const address = row.address;
      const meta = launched.get(address);
      const info = await fetchTokenInfo(address);
      const rpcMeta =
        !info?.name || !info?.symbol || info.symbol === "???"
          ? await erc20Meta(address)
          : { name: null, symbol: null };
      const dex = pairStats(dexMap.get(address));
      const holders = num(info?.holders_count);
      const priceUsd = dex.priceUsd ?? num(info?.exchange_rate);
      const mcapUsd = dex.mcapUsd ?? num(info?.circulating_market_cap);

      const [hold, flags, buys] = await Promise.all([
        fetchHolders(address, info?.total_supply),
        fetchContractFlags(address),
        row.stage === "graduated" && priceUsd
          ? fetchLargeBuys(address, priceUsd, SMART_WINDOW_MS, SMART_BUY_USD)
          : Promise.resolve([]),
      ]);

      const profile = profiles.get(address);
      const tweetUrl = tweetFromProfile(profile);
      const stock = matchStock(meta?.pairToken ?? null, stocks);
      const stockPair: StockPair = stock
        ? { symbol: stock.symbol, name: stock.name, contract: stock.contract }
        : null;

      const launchedAt = meta?.at ?? null;
      const graduatedAt = graduated.get(address) ?? null;
      const createdMs = dex.createdAt
        ? dex.createdAt
        : graduatedAt
          ? new Date(graduatedAt).getTime()
          : launchedAt
            ? new Date(launchedAt).getTime()
            : null;
      const ageMs = createdMs ? Date.now() - createdMs : null;

      const lpLocked = locked.has(address)
        ? true
        : hold.hasLocker
          ? true
          : row.stage === "bonding"
            ? false
            : null;
      const lockReason = locked.has(address)
        ? "Pons GraduationTokensPermanentlyLocked"
        : hold.hasLocker
          ? "Pons locker 出现在持有人列表"
          : row.stage === "bonding"
            ? "尚未毕业，曲线内流动性未锁进 Uniswap"
            : "未在扫描窗内看到锁定事件";

      const lights = buildLights({
        liquidityUsd: dex.liquidityUsd,
        holders,
        top10ExLp: hold.top10ExLp,
        lpLocked,
        smartBuyers2h: buys.length,
        smartKnown: true,
      });
      const soft = buildSoft({
        verified: flags.verified,
        mintOrPause: flags.mintOrPause,
        deployerLaunchCount: meta?.deployer
          ? (deployerCount.get(meta.deployer.toLowerCase()) ?? 1)
          : null,
        mcapUsd,
        dexscreenerTrending: dex.trending,
      });

      const base = {
        address,
        name: dex.name || info?.name || rpcMeta.name || "Unknown",
        symbol: dex.symbol || info?.symbol || rpcMeta.symbol || "???",
        stage: row.stage,
        ageMs,
        launchedAt,
        graduatedAt,
        deployer: meta?.deployer ?? null,
        pairToken: meta?.pairToken ?? null,
        pairSymbol: quoteLabel(meta?.pairToken ?? null, stocks),
        stockPair,
        mcapUsd,
        liquidityUsd: dex.liquidityUsd,
        priceUsd,
        holders,
        top10ExLp: hold.top10ExLp,
        lpLocked,
        lockReason,
        smartBuyers2h: buys,
        verified: flags.verified,
        mintOrPause: flags.mintOrPause,
        deployerLaunchCount: meta?.deployer
          ? (deployerCount.get(meta.deployer.toLowerCase()) ?? 1)
          : null,
        dexscreenerTrending: dex.trending,
        dexUrl: dex.dexUrl ?? `https://dexscreener.com/robinhood/${address}`,
        explorerUrl: explorerToken(address),
        ponsUrl: ponsLaunch(address),
        tweetUrl,
        tweetIsOriginal: Boolean(tweetUrl),
        narrative: profile?.description ?? null,
        quoteSymbol: dex.quoteSymbol ?? quoteLabel(meta?.pairToken ?? null, stocks),
        volumeH1: dex.volumeH1,
        priceChangeH1: dex.priceChangeH1,
        lights,
        soft,
      };

      return applyGrade(base);
    });

    const candidates = hydrated.sort((a, b) => {
      const rank = (c: Candidate) =>
        c.verdict === "ALERT" ? 0 : c.verdict === "LATE" ? 1 : 2;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if ((b.hardPassed ?? 0) !== (a.hardPassed ?? 0)) return b.hardPassed - a.hardPassed;
      return (b.mcapUsd ?? 0) - (a.mcapUsd ?? 0);
    });

    const result: ScanResult = {
      meta: {
        scannedAt,
        logPages: pages,
        events: events.length,
        launched: launched.size,
        graduated: graduated.size,
        hydrated: candidates.length,
        dexOk: dexMap.size > 0,
        error: null,
        nextScanHintMin: 3,
      },
      candidates,
      alerts: candidates.filter((c) => c.verdict === "ALERT"),
      late: candidates.filter((c) => c.verdict === "LATE"),
      skipped: candidates.filter((c) => c.verdict === "SKIP"),
    };
    cache = { at: Date.now(), result };
    return result;
  } catch (err) {
    const result: ScanResult = {
      meta: {
        scannedAt,
        logPages: 0,
        events: 0,
        launched: 0,
        graduated: 0,
        hydrated: 0,
        dexOk: false,
        error: err instanceof Error ? err.message : "scan failed",
        nextScanHintMin: 3,
      },
      candidates: [],
      alerts: [],
      late: [],
      skipped: [],
    };
    return result;
  }
}

export async function inspectAddress(address: string): Promise<Candidate | { error: string }> {
  const addr = address.toLowerCase();
  const scan = await runScan(false);
  const hit = scan.candidates.find((c) => c.address.toLowerCase() === addr);
  if (hit) return hit;

  const [profiles, dexMap, info, rpcMeta] = await Promise.all([
    fetchProfiles(),
    fetchDexPairs([address]),
    fetchTokenInfo(address),
    erc20Meta(address),
  ]);
  const dex = pairStats(dexMap.get(addr));
  if (!info && !dex.name && !rpcMeta.symbol) {
    return { error: "链上找不到这个合约，或尚未被索引。" };
  }

  const holders = num(info?.holders_count);
  const priceUsd = dex.priceUsd ?? num(info?.exchange_rate);
  const mcapUsd = dex.mcapUsd ?? num(info?.circulating_market_cap);
  const [hold, flags, buys] = await Promise.all([
    fetchHolders(address, info?.total_supply),
    fetchContractFlags(address),
    fetchLargeBuys(address, priceUsd, SMART_WINDOW_MS, SMART_BUY_USD),
  ]);
  const profile = profiles.get(addr);
  const tweetUrl = tweetFromProfile(profile);
  const stage: Stage = dex.liquidityUsd != null ? "graduated" : "unknown";
  const createdMs = dex.createdAt ?? null;
  const lpLocked = hold.hasLocker ? true : stage === "unknown" ? null : null;

  const lights = buildLights({
    liquidityUsd: dex.liquidityUsd,
    holders,
    top10ExLp: hold.top10ExLp,
    lpLocked,
    smartBuyers2h: buys.length,
    smartKnown: true,
  });
  const soft = buildSoft({
    verified: flags.verified,
    mintOrPause: flags.mintOrPause,
    deployerLaunchCount: null,
    mcapUsd,
    dexscreenerTrending: dex.trending,
  });

  return applyGrade({
    address,
    name: dex.name || info?.name || rpcMeta.name || "Unknown",
    symbol: dex.symbol || info?.symbol || rpcMeta.symbol || "???",
    stage,
    ageMs: createdMs ? Date.now() - createdMs : null,
    launchedAt: null,
    graduatedAt: null,
    deployer: null,
    pairToken: null,
    pairSymbol: dex.quoteSymbol ?? null,
    stockPair: null,
    mcapUsd,
    liquidityUsd: dex.liquidityUsd,
    priceUsd,
    holders,
    top10ExLp: hold.top10ExLp,
    lpLocked,
    lockReason: hold.hasLocker ? "Pons locker 出现在持有人列表" : "UNKNOWN",
    smartBuyers2h: buys,
    verified: flags.verified,
    mintOrPause: flags.mintOrPause,
    deployerLaunchCount: null,
    dexscreenerTrending: dex.trending,
    dexUrl: dex.dexUrl ?? `https://dexscreener.com/robinhood/${address}`,
    explorerUrl: explorerToken(address),
    ponsUrl: ponsLaunch(address),
    tweetUrl,
    tweetIsOriginal: Boolean(tweetUrl),
    narrative: profile?.description ?? null,
    quoteSymbol: dex.quoteSymbol ?? null,
    volumeH1: dex.volumeH1,
    priceChangeH1: dex.priceChangeH1,
    lights,
    soft,
  });
}

export async function quotePrices(addresses: string[]) {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, 8);
  const dex = await fetchDexPairs(uniq);
  const out = await mapLimit(uniq, 4, async (address) => {
    const p = pairStats(dex.get(address));
    const info = p.priceUsd == null ? await fetchTokenInfo(address) : null;
    return {
      address,
      priceUsd: p.priceUsd ?? num(info?.exchange_rate),
      mcapUsd: p.mcapUsd ?? num(info?.circulating_market_cap),
      liquidityUsd: p.liquidityUsd,
    };
  });
  return out;
}

export async function scoreNarrative(input: {
  name: string;
  symbol: string;
  narrative: string | null;
  tweetUrl: string | null;
  stockPair: string | null;
}): Promise<{
  ok: boolean;
  scoreDelta: number;
  label: string;
  summary: string;
  pairing: string;
  error?: string;
}> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      scoreDelta: 0,
      label: "unavailable",
      summary: "叙事打分暂时不可用",
      pairing: "none",
      error: "AI is not available",
    };
  }
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 400,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You score early Robinhood Chain memes. Return compact JSON only: {scoreDelta: number, label: string, summary: string, pairing: string}. scoreDelta is one of -5,-3,0,1,2,3 per: +3 stock-paired Nasdaq small-cap high-short cultural meme; +2 RH native primitive with little discussion; +1 original tweet and not trending; -3 already media layer; -5 fake narrative / copy / serial deployer. pairing is FAMI-style or none. summary max 40 Chinese words. Never promise it will pump. Never invent facts.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      scoreDelta: 0,
      label: "error",
      summary: `xAI ${res.status}`,
      pairing: "none",
      error: `xAI API error ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(match?.[0] ?? text) as {
      scoreDelta?: number;
      label?: string;
      summary?: string;
      pairing?: string;
    };
    return {
      ok: true,
      scoreDelta: Number(parsed.scoreDelta ?? 0),
      label: String(parsed.label ?? "scored"),
      summary: String(parsed.summary ?? text).slice(0, 280),
      pairing: String(parsed.pairing ?? "none"),
    };
  } catch {
    return {
      ok: true,
      scoreDelta: 0,
      label: "raw",
      summary: text.slice(0, 280),
      pairing: "none",
    };
  }
}
