#!/usr/bin/env node
/**
 * Brand-asset gate shared by browser-smoke.mjs (and unit-testable without a
 * browser): a canvas app is almost always a game / visually rich app, and
 * those must ship a custom share card — the default og.grok.me placeholder is
 * not acceptable for them (see .grok/skills/og/SKILL.md).
 *
 * Games must also set type=x:game in src/lib/og/site.json so the platform
 * injector emits og:type for X game-card unfurls, and public/x-banner.jpg for
 * the 50:11 X feed card. A card file is enough for bake to emit /og.jpg, but
 * brand-check still requires site.json `"card": "custom"` so the agent-facing
 * contract stays explicit.
 *
 * Checked on the filesystem (not the served head) so preview and mid-scaffold
 * workspaces are judged the same way.
 *
 * Also runnable, so the background brand task can check its own work before it
 * reports (the parent answers without waiting for it):
 *
 *   node scripts/brand-check.mjs [--game] [--placeholder-ok] [--root <dir>]
 *
 * That run judges the files on disk even though the task is holding the
 * og-pending marker; the marker only silences what the parent's gates see. It
 * also requires the custom card: its caller is normally the pass that exists to
 * produce one, so the placeholder the parent tolerates for a plain utility is a
 * failed pass here. --placeholder-ok is for the other launch — a pass doing
 * favicon, PWA icons and title for a plain utility that keeps the og.grok.me
 * card — where no card is the expected verdict rather than a failure.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OG_SITE_REL_PATH, readOgSite, siteHasCustomCard } from "./grok-pwa-shared.mjs";

// Over this, link scrapers (X card previews included) time out or skip the
// image, so the card silently fails to unfurl. The og skill's JPEG contract
// (ffmpeg -q:v 4, ~150-300 KB) exists precisely to stay under it.
export const MAX_CARD_BYTES = 600 * 1024;

// Written by the brand task while it generates, removed when it finishes.
export const OG_PENDING_REL_PATH = ".grok/og-pending";
// A Stop mid-generation leaves the marker behind, so the demotion expires
// instead of hiding a missing card forever on that workspace.
export const OG_PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export function siteDeclaresOgTypeGame(site) {
  return String(site?.type ?? "").toLowerCase() === "x:game";
}

export function ogPendingActive(workspaceRoot, now = Date.now()) {
  try {
    const { mtimeMs } = statSync(join(workspaceRoot, OG_PENDING_REL_PATH));
    return now - mtimeMs < OG_PENDING_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * What the parent's gates see. The brand pass may still be generating when a
 * gate runs, and "missing" would send the agent to redo the task's work.
 *
 * In flight is silence, not a note: callers report this array as warnings, so
 * anything left in it — however it is worded — reaches the agent as one.
 */
export function computeBrandWarnings({
  hasCanvas,
  workspaceRoot = "/workspace",
  now = Date.now(),
}) {
  if (ogPendingActive(workspaceRoot, now)) return [];
  return brandWarningsOnDisk({ hasCanvas, workspaceRoot });
}

/**
 * The files on disk, marker ignored — the brand pass's own view of its work.
 * Deliberately not exported: a gate that reached for this instead of
 * `computeBrandWarnings` would warn about a card that is still generating.
 * `cardRequired` is for a caller that is itself the brand pass: for it the
 * placeholder is a failure, not the plain-utility default the parent's gate
 * leaves alone.
 */
function brandWarningsOnDisk({
  hasCanvas,
  workspaceRoot = "/workspace",
  cardRequired = false,
}) {
  const skillPath = join(workspaceRoot, ".grok/skills/og/SKILL.md");
  const sitePath = join(workspaceRoot, OG_SITE_REL_PATH);
  const site = readOgSite(workspaceRoot);
  const cardPath = [
    join(workspaceRoot, "public/og.jpg"),
    join(workspaceRoot, "public/og.png"),
  ].find(existsSync);
  const warnings = [];

  if (cardPath !== undefined) {
    if (statSync(cardPath).size > MAX_CARD_BYTES) {
      warnings.push(
        `BRAND WARNING: ${cardPath} is over 600 KB — link scrapers (X card previews included) `
          + "time out or skip images this heavy, so the card silently fails to unfurl. "
          + `Re-encode as JPEG (public/og.jpg, ffmpeg -q:v 4) per ${skillPath}.`,
      );
    }
    if (!siteHasCustomCard(site)) {
      warnings.push(
        `BRAND WARNING: ${cardPath} exists but ${sitePath} is missing "card": "custom". `
          + "Bake infers custom from the file, but set the flag in "
          + `${sitePath} per ${skillPath} so identity is explicit.`,
      );
    }
  } else if (hasCanvas) {
    warnings.push(
      `BRAND WARNING: this looks like a game/canvas app but ${workspaceRoot}/public/og.jpg `
        + "is missing. Games and visually rich apps must ship a custom 1200x630 share card "
        + "built from the app's own art — the default og.grok.me placeholder card is not "
        + `acceptable for them. You are not done: open ${skillPath} and finish the `
        + "brand-asset pass.",
    );
  } else if (cardRequired) {
    warnings.push(
      `BRAND WARNING: ${workspaceRoot}/public/og.jpg is missing and this pass exists to `
        + "produce it. Generate the 1200x630 card from the app's own art and hand it over "
        + `per ${skillPath}. If no image-generation tool is available in this session, `
        + "report that instead of reporting a pass — the app keeps the og.grok.me "
        + "placeholder.",
    );
  } else {
    warnings.push(
      "BRAND NOTE: no custom public/og.jpg — the platform will serve the og.grok.me placeholder. "
        + "Custom cards are the default for games of every kind (DOM board/word games included), "
        + "whimsical apps, creative tools, and brand-forward pages — only plain utilities "
        + "(converters, CRUD trackers, admin dashboards) keep the placeholder. If this app "
        + `is not a plain utility, finish the brand-asset pass per ${skillPath}.`,
    );
  }

  if (hasCanvas && !siteDeclaresOgTypeGame(site)) {
    warnings.push(
      'BRAND WARNING: this looks like a game/canvas app but src/lib/og/site.json is missing '
        + '"type": "x:game". X uses og:type=x:game to present the unfurl as a game card — set '
        + `it in ${sitePath} per ${skillPath}. Do not invent `
        + "x:type or overload twitter:card as the game signal.",
    );
  }

  // Games with a custom link card must also ship the 50:11 X feed card.
  // Skip while still on the og.grok.me placeholder — that pass has not started yet.
  if (hasCanvas && cardPath !== undefined) {
    const bannerPath = join(workspaceRoot, "public/x-banner.jpg");
    if (!existsSync(bannerPath)) {
      warnings.push(
        `BRAND WARNING: this looks like a game/canvas app but ${bannerPath} is missing. `
          + "Games need a 50:11 X feed card (1200×264 JPEG) at public/x-banner.jpg — "
          + `open ${skillPath} and finish the brand-asset pass.`,
      );
    } else if (statSync(bannerPath).size > MAX_CARD_BYTES) {
      warnings.push(
        `BRAND WARNING: ${bannerPath} is over 600 KB — link scrapers (X card previews `
          + "included) time out or skip images this heavy, so the feed card silently fails "
          + `to unfurl. Re-encode as JPEG (ffmpeg -q:v 4) per ${skillPath}.`,
      );
    }
  }

  return warnings;
}

export function parseBrandCheckArgs(argv) {
  const usage =
    "usage: node scripts/brand-check.mjs [--game] [--placeholder-ok] [--root <dir>]";
  let game = false;
  let placeholderOk = false;
  let root = null;
  for (let i = 0; i < argv.length; i += 1) {
    // --game runs the checks browser-smoke.mjs derives from a real <canvas>;
    // DOM board/word games need them too and have no canvas to detect.
    if (argv[i] === "--game") {
      game = true;
    } else if (argv[i] === "--placeholder-ok") {
      placeholderOk = true;
    } else if (argv[i] === "--root") {
      root = argv[++i];
      if (root === undefined) return { error: `--root needs a directory — ${usage}` };
    } else {
      return { error: `unexpected argument: ${argv[i]} — ${usage}` };
    }
  }
  return { game, placeholderOk, root };
}

function isBrandWarning(message) {
  return message.startsWith("BRAND WARNING:");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseBrandCheckArgs(process.argv.slice(2));
  if (args.error) {
    console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
    process.exit(1);
  }
  const workspaceRoot = args.root ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  // The caller here is the brand task checking its own work: it is holding the
  // marker (report it, but judge the assets on disk) and it owes a custom card
  // whether or not the app draws to a canvas — unless it was launched for a
  // plain utility that keeps the placeholder, which only it knows.
  const messages = brandWarningsOnDisk({
    hasCanvas: args.game,
    workspaceRoot,
    cardRequired: !args.placeholderOk,
  });
  const warnings = messages.filter(isBrandWarning);
  console.log(
    JSON.stringify(
      {
        ok: warnings.length === 0,
        workspaceRoot,
        pending: ogPendingActive(workspaceRoot),
        warnings: warnings.length,
        messages,
      },
      null,
      2,
    ),
  );
  process.exitCode = warnings.length === 0 ? 0 : 1;
}
