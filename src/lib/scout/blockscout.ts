import {
  EXCLUDED_HOLDERS,
  LOG_PAGES_MAX,
  PONS_FACTORY,
  PONS_LOCKER,
  TRANSFER_PAGES,
} from "./constants";
import { asAddr, fetchJson, num } from "./http";

const BS = "https://robinhoodchain.blockscout.com/api/v2";

export type DecodedParam = { name: string; value: unknown; indexed?: boolean };

export type FactoryEvent = {
  method: string;
  token: string | null;
  curve: string | null;
  deployer: string | null;
  pairToken: string | null;
  timestamp: string | null;
  tx: string | null;
};

type LogPage = {
  items: Array<{
    decoded?: { method_call?: string; parameters?: DecodedParam[] } | null;
    block_timestamp?: string;
    transaction_hash?: string;
    topics?: string[];
  }>;
  next_page_params?: {
    index?: number;
    block_number?: number;
    items_count?: number;
  } | null;
};

type TokenInfo = {
  name?: string;
  symbol?: string;
  address_hash?: string;
  holders_count?: string | number;
  exchange_rate?: string | number | null;
  circulating_market_cap?: string | number | null;
  total_supply?: string;
  decimals?: string | number;
  volume_24h?: string | number | null;
};

type HolderPage = {
  items: Array<{
    address?: { hash?: string; is_contract?: boolean } | string;
    value?: string;
  }>;
};

type TransferPage = {
  items: Array<{
    timestamp?: string;
    from?: { hash?: string; is_contract?: boolean };
    to?: { hash?: string; is_contract?: boolean };
    total?: { value?: string; decimals?: string | number } | string;
    type?: string;
  }>;
};

function param(params: DecodedParam[] | undefined, name: string): string | null {
  const p = params?.find((x) => x.name === name);
  if (!p) return null;
  const v = p.value;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: string }).value);
  return v == null ? null : String(v);
}

function methodName(call?: string): string {
  if (!call) return "unknown";
  return call.split("(")[0] ?? "unknown";
}

export async function fetchFactoryEvents(): Promise<{
  events: FactoryEvent[];
  pages: number;
}> {
  const events: FactoryEvent[] = [];
  let pages = 0;
  let qs = "";
  for (let i = 0; i < LOG_PAGES_MAX; i++) {
    const page = await fetchJson<LogPage>(
      `${BS}/addresses/${PONS_FACTORY}/logs${qs}`,
    );
    pages++;
    for (const item of page.items ?? []) {
      const decoded = item.decoded;
      const method = methodName(decoded?.method_call);
      const params = decoded?.parameters;
      events.push({
        method,
        token: param(params, "token"),
        curve: param(params, "curve"),
        deployer: param(params, "deployer"),
        pairToken: param(params, "pairToken"),
        timestamp: item.block_timestamp ?? null,
        tx: item.transaction_hash ?? null,
      });
    }
    const n = page.next_page_params;
    if (!n || !page.items?.length) break;
    const oldest = page.items[page.items.length - 1]?.block_timestamp;
    if (oldest) {
      const age = Date.now() - new Date(oldest).getTime();
      if (age > 6 * 60 * 60 * 1000 && events.filter((e) => e.method === "PoolGraduated").length >= 6) {
        break;
      }
    }
    qs = `?block_number=${n.block_number}&index=${n.index}&items_count=${n.items_count ?? 50}`;
  }
  return { events, pages };
}

export async function fetchTokenInfo(address: string): Promise<TokenInfo | null> {
  try {
    return await fetchJson<TokenInfo>(`${BS}/tokens/${address}`);
  } catch {
    return null;
  }
}

export async function fetchHolders(
  address: string,
  totalSupply?: string | null,
): Promise<{
  top10ExLp: number | null;
  sample: number;
  hasLocker: boolean;
}> {
  try {
    const page = await fetchJson<HolderPage>(`${BS}/tokens/${address}/holders`);
    const supplyRaw = totalSupply ?? (await fetchTokenInfo(address))?.total_supply;
    const supply = BigInt(supplyRaw ?? "0");
    if (supply === 0n) return { top10ExLp: null, sample: 0, hasLocker: false };
    const rows = (page.items ?? [])
      .map((it) => {
        const addr = asAddr(it.address).toLowerCase();
        const val = BigInt(it.value ?? "0");
        const isContract =
          typeof it.address === "object" ? Boolean(it.address?.is_contract) : false;
        return { addr, val, isContract };
      })
      .filter((r) => r.addr && r.val > 0n);
    const hasLocker = rows.some((r) => r.addr === PONS_LOCKER.toLowerCase());
    const kept = rows.filter((r) => !EXCLUDED_HOLDERS.has(r.addr));
    const top = kept.slice(0, 10);
    const sum = top.reduce((a, b) => a + b.val, 0n);
    const ratio = Number((sum * 10_000n) / supply) / 10_000;
    return {
      top10ExLp: ratio,
      sample: kept.length,
      hasLocker,
    };
  } catch {
    return { top10ExLp: null, sample: 0, hasLocker: false };
  }
}

export async function fetchContractFlags(address: string): Promise<{
  verified: boolean | null;
  mintOrPause: boolean | null;
}> {
  try {
    const d = await fetchJson<{
      is_verified?: boolean;
      is_contract?: boolean;
    }>(`${BS}/addresses/${address}`);
    return {
      verified: d.is_verified === true ? true : null,
      mintOrPause: null,
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return { verified: false, mintOrPause: null };
    return { verified: null, mintOrPause: null };
  }
}

function transferUsd(
  total: TransferPage["items"][number]["total"],
  price: number | null,
): number | null {
  if (price == null) return null;
  let value: string | undefined;
  let decimals = 18;
  if (typeof total === "string") value = total;
  else if (total && typeof total === "object") {
    value = total.value;
    decimals = num(total.decimals) ?? 18;
  }
  if (!value) return null;
  const n = Number(value) / 10 ** decimals;
  if (!Number.isFinite(n)) return null;
  return n * price;
}

export async function fetchLargeBuys(
  address: string,
  priceUsd: number | null,
  windowMs: number,
  minUsd: number,
): Promise<{ address: string; usd: number; at: string }[]> {
  const buyers = new Map<string, { usd: number; at: string }>();
  const cutoff = Date.now() - windowMs;
  let qs = "";
  for (let i = 0; i < TRANSFER_PAGES; i++) {
    let page: TransferPage;
    try {
      page = await fetchJson<TransferPage>(
        `${BS}/tokens/${address}/transfers${qs}`,
      );
    } catch {
      break;
    }
    const items = page.items ?? [];
    if (!items.length) break;
    let older = false;
    for (const it of items) {
      const ts = it.timestamp ? new Date(it.timestamp).getTime() : Date.now();
      if (ts < cutoff) {
        older = true;
        continue;
      }
      const from = it.from;
      const to = it.to;
      if (!to?.hash || to.is_contract) continue;
      if (!from?.is_contract) continue;
      const usd = transferUsd(it.total, priceUsd);
      if (usd == null || usd < minUsd) continue;
      const key = to.hash.toLowerCase();
      const prev = buyers.get(key);
      if (!prev || usd > prev.usd) {
        buyers.set(key, { usd, at: it.timestamp ?? new Date(ts).toISOString() });
      }
    }
    const n = (page as TransferPage & { next_page_params?: Record<string, unknown> })
      .next_page_params;
    if (older || !n) break;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(n)) params.set(k, String(v));
    qs = `?${params.toString()}`;
  }
  return [...buyers.entries()]
    .map(([address, v]) => ({ address, ...v }))
    .sort((a, b) => b.usd - a.usd);
}

export function explorerToken(address: string) {
  return `https://robinhoodchain.blockscout.com/token/${address}`;
}

export function ponsLaunch(address: string) {
  return `https://ponslaunchpad.com/launchpad/${address}`;
}

export { num };
