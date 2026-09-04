import {
  HARD_LABELS,
  HOLDERS_MIN,
  LATE_MCAP_USD,
  LP_MIN_USD,
  PRIMARY_MCAP_MAX,
  PRIMARY_MCAP_MIN,
  TIER1_MCAP_MAX,
  TOP10_MAX,
} from "./constants";
import type {
  Candidate,
  HardKey,
  Light,
  Lights,
  SoftLights,
  Tier,
  Verdict,
} from "./types";

function light(ok: boolean | null | undefined): Light {
  if (ok === true) return "PASS";
  if (ok === false) return "FAIL";
  return "UNKNOWN";
}

function isOn(v: Light) {
  return v === "PASS";
}

/** UNKNOWN counts as fail — never leave a hole in the five lights. */
export function buildLights(input: {
  liquidityUsd: number | null;
  holders: number | null;
  top10ExLp: number | null;
  lpLocked: boolean | null;
  smartBuyers2h: number;
  smartKnown: boolean;
}): Lights {
  return {
    lp_gt_50k: light(
      input.liquidityUsd == null ? null : input.liquidityUsd > LP_MIN_USD,
    ),
    holders_gt_100: light(
      input.holders == null ? null : input.holders > HOLDERS_MIN,
    ),
    top10_lt_60: light(
      input.top10ExLp == null ? null : input.top10ExLp < TOP10_MAX,
    ),
    lp_locked: light(input.lpLocked),
    smart_money_2plus: input.smartKnown
      ? light(input.smartBuyers2h >= 2)
      : "UNKNOWN",
  };
}

export function buildSoft(input: {
  verified: boolean | null;
  mintOrPause: boolean | null;
  deployerLaunchCount: number | null;
  mcapUsd: number | null;
  dexscreenerTrending: boolean;
}): SoftLights {
  const unverified =
    input.verified === false || input.mintOrPause === true
      ? false
      : input.verified == null && input.mintOrPause == null
        ? null
        : true;
  return {
    unverified_or_mint: light(unverified),
    serial_deployer: light(
      input.deployerLaunchCount == null
        ? null
        : input.deployerLaunchCount < 3,
    ),
    late_layer: light(
      input.mcapUsd != null && input.mcapUsd > LATE_MCAP_USD
        ? false
        : input.dexscreenerTrending
          ? false
          : input.mcapUsd == null
            ? null
            : true,
    ),
  };
}

/**
 * Structural gates are lights 1–4. Light 5 (smart money) grades the tier.
 * That resolves the original prompt contradiction: 5/5 as a hard AND would
 * make Tier 1 / Tier 2 unreachable.
 */
export function grade(input: {
  lights: Lights;
  soft: SoftLights;
  smartBuyers2h: number;
  mcapUsd: number | null;
  dexscreenerTrending: boolean;
  tweetIsOriginal: boolean;
}): { verdict: Verdict; tier: Tier; hardPassed: number; reasons: string[] } {
  const keys = Object.keys(HARD_LABELS) as HardKey[];
  const hardPassed = keys.filter((k) => isOn(input.lights[k])).length;
  const structural: HardKey[] = [
    "lp_gt_50k",
    "holders_gt_100",
    "top10_lt_60",
    "lp_locked",
  ];
  const reasons: string[] = [];

  for (const k of structural) {
    if (!isOn(input.lights[k])) {
      reasons.push(
        `${HARD_LABELS[k]} → ${input.lights[k] === "UNKNOWN" ? "UNKNOWN" : "FAIL"}`,
      );
    }
  }

  const structOk = structural.every((k) => isOn(input.lights[k]));
  const late =
    (input.mcapUsd != null && input.mcapUsd > LATE_MCAP_USD) ||
    input.dexscreenerTrending;

  if (!structOk) {
    return { verdict: "SKIP", tier: null, hardPassed, reasons };
  }

  if (late) {
    reasons.push("迟到层：只监控，不开新仓");
    return { verdict: "LATE", tier: null, hardPassed, reasons };
  }

  if (input.mcapUsd != null && input.mcapUsd < PRIMARY_MCAP_MIN) {
    reasons.push("市值低于 $10k 主场");
    return { verdict: "SKIP", tier: null, hardPassed, reasons };
  }

  if (input.smartBuyers2h >= 2) {
    return { verdict: "ALERT", tier: 3, hardPassed, reasons };
  }
  if (input.smartBuyers2h === 1) {
    return { verdict: "ALERT", tier: 2, hardPassed, reasons };
  }
  if (
    input.mcapUsd != null &&
    input.mcapUsd <= TIER1_MCAP_MAX &&
    input.tweetIsOriginal
  ) {
    return { verdict: "ALERT", tier: 1, hardPassed, reasons };
  }

  reasons.push("结构过关但缺少聪明钱 / 原文叙事，最多观察");
  return { verdict: "SKIP", tier: null, hardPassed, reasons };
}

export function mcapBand(mcap: number | null): "primary" | "secondary" | "late" | "micro" | "unknown" {
  if (mcap == null) return "unknown";
  if (mcap < PRIMARY_MCAP_MIN) return "micro";
  if (mcap <= PRIMARY_MCAP_MAX) return "primary";
  if (mcap <= LATE_MCAP_USD) return "secondary";
  return "late";
}

export function applyGrade(c: Omit<Candidate, "verdict" | "tier" | "hardPassed" | "reasons">): Candidate {
  const g = grade({
    lights: c.lights,
    soft: c.soft,
    smartBuyers2h: c.smartBuyers2h.length,
    mcapUsd: c.mcapUsd,
    dexscreenerTrending: c.dexscreenerTrending,
    tweetIsOriginal: c.tweetIsOriginal,
  });
  return { ...c, ...g };
}
