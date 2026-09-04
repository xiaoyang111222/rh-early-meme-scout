export type Light = "PASS" | "FAIL" | "UNKNOWN";
export type Verdict = "ALERT" | "LATE" | "SKIP";
export type Tier = 1 | 2 | 3 | null;
export type Stage = "bonding" | "graduated" | "unknown";

export type HardKey =
  | "lp_gt_50k"
  | "holders_gt_100"
  | "top10_lt_60"
  | "lp_locked"
  | "smart_money_2plus";

export type SoftKey =
  | "unverified_or_mint"
  | "serial_deployer"
  | "late_layer";

export type Lights = Record<HardKey, Light>;
export type SoftLights = Record<SoftKey, Light>;

export type SmartBuyer = {
  address: string;
  usd: number;
  at: string;
};

export type StockPair = {
  symbol: string;
  name: string;
  contract: string;
} | null;

export type Candidate = {
  address: string;
  name: string;
  symbol: string;
  stage: Stage;
  ageMs: number | null;
  launchedAt: string | null;
  graduatedAt: string | null;
  deployer: string | null;
  pairToken: string | null;
  pairSymbol: string | null;
  stockPair: StockPair;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  holders: number | null;
  top10ExLp: number | null;
  lpLocked: boolean | null;
  lockReason: string | null;
  smartBuyers2h: SmartBuyer[];
  verified: boolean | null;
  mintOrPause: boolean | null;
  deployerLaunchCount: number | null;
  dexscreenerTrending: boolean;
  dexUrl: string | null;
  explorerUrl: string;
  ponsUrl: string;
  tweetUrl: string | null;
  tweetIsOriginal: boolean;
  narrative: string | null;
  quoteSymbol: string | null;
  volumeH1: number | null;
  priceChangeH1: number | null;
  lights: Lights;
  soft: SoftLights;
  verdict: Verdict;
  tier: Tier;
  hardPassed: number;
  reasons: string[];
};

export type ScanMeta = {
  scannedAt: string;
  logPages: number;
  events: number;
  launched: number;
  graduated: number;
  hydrated: number;
  dexOk: boolean;
  error: string | null;
  nextScanHintMin: number;
};

export type ScanResult = {
  meta: ScanMeta;
  candidates: Candidate[];
  alerts: Candidate[];
  late: Candidate[];
  skipped: Candidate[];
};

export type InspectInput = { address: string };

export type NarrativeScore = {
  ok: boolean;
  scoreDelta: number;
  label: string;
  summary: string;
  pairing: string;
  error?: string;
};

export type PriceQuote = {
  address: string;
  priceUsd: number | null;
  mcapUsd: number | null;
  liquidityUsd: number | null;
};

export type StockAsset = {
  symbol: string;
  name: string;
  contract: string;
  logoUrl: string | null;
  status: string;
};
