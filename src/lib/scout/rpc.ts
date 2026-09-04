const RPC = "https://rpc.mainnet.chain.robinhood.com";
const UA =
  "Mozilla/5.0 (compatible; RHEarlyMemeScout/1.0; +https://x.ai) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36";

const NAME_SEL = "0x06fdde03";
const SYMBOL_SEL = "0x95d89b41";

type RpcRes = { result?: string; error?: { message?: string } };

async function ethCall(to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as RpcRes;
    return j.result ?? null;
  } catch {
    return null;
  }
}

function decodeAbiString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  try {
    if (raw.length <= 64) {
      const buf = Buffer.from(raw.replace(/00+$/, ""), "hex").toString("utf8").replace(/\0/g, "").trim();
      return buf || null;
    }
    const len = parseInt(raw.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0 || len > 128) return null;
    const body = raw.slice(128, 128 + len * 2);
    const s = Buffer.from(body, "hex").toString("utf8").replace(/\0/g, "").trim();
    return s || null;
  } catch {
    return null;
  }
}

export async function erc20Meta(address: string): Promise<{ name: string | null; symbol: string | null }> {
  const [nameHex, symbolHex] = await Promise.all([
    ethCall(address, NAME_SEL),
    ethCall(address, SYMBOL_SEL),
  ]);
  return {
    name: decodeAbiString(nameHex),
    symbol: decodeAbiString(symbolHex),
  };
}
