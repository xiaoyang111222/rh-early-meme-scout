export const CHAIN_ID = 4663;
export const CHAIN_SLUG = "robinhood";
export const APP_NAME = "RH Early Meme Scout";

export const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
export const PONS_LOCKER = "0x267444d099b10fb5ed7c3cc7b7c767adca574952";
export const PONS_HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
export const PONS_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

export const DEAD = "0x000000000000000000000000000000000000dEaD";
export const ZERO = "0x0000000000000000000000000000000000000000";

export const EXCLUDED_HOLDERS = new Set(
  [
    DEAD,
    ZERO,
    PONS_LOCKER,
    PONS_HOOK,
    PONS_POOL_MANAGER,
    PONS_FACTORY,
  ].map((a) => a.toLowerCase()),
);

export const LP_MIN_USD = 50_000;
export const HOLDERS_MIN = 100;
export const TOP10_MAX = 0.6;
export const SMART_BUY_USD = 200;
export const SMART_WINDOW_MS = 120 * 60 * 1000;
export const LATE_MCAP_USD = 5_000_000;
export const PRIMARY_MCAP_MIN = 10_000;
export const PRIMARY_MCAP_MAX = 500_000;
export const TIER1_MCAP_MAX = 100_000;
export const WATCH_MAX = 5;
export const DECISION_MS = 3 * 60 * 1000;
export const FLATTEN_MS = 48 * 60 * 60 * 1000;
export const SCAN_TTL_MS = 90_000;
export const LOG_PAGES_MAX = 5;
export const HYDRATE_MAX = 8;
export const TRANSFER_PAGES = 1;

export const TIER_SIZE: Record<1 | 2 | 3, number> = {
  1: 10,
  2: 30,
  3: 60,
};

export const HARD_LABELS: Record<
  | "lp_gt_50k"
  | "holders_gt_100"
  | "top10_lt_60"
  | "lp_locked"
  | "smart_money_2plus",
  string
> = {
  lp_gt_50k: "流动性 > $50k",
  holders_gt_100: "持有人 > 100",
  top10_lt_60: "前十（剔 LP/锁/烧）< 60%",
  lp_locked: "流动性已锁 / 销毁",
  smart_money_2plus: "2h 内 ≥2 笔 ≥$200 买入",
};

export const SOFT_LABELS = {
  unverified_or_mint: "未开源 / 可增发 / 可暂停",
  serial_deployer: "部署者近窗连发 ≥3",
  late_layer: "市值 > $5M 或已 trending",
} as const;

export const RISK_FOOTER =
  "RH Chain 新币绝大多数会归零。过滤器挡不住讲得好的谎言。只用愿意全亏的钱。这不是投资建议，机器人不下单。";
