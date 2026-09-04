import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MAX_CARD_BYTES,
  OG_PENDING_MAX_AGE_MS,
  OG_PENDING_REL_PATH,
  computeBrandWarnings,
  ogPendingActive,
  parseBrandCheckArgs,
  siteDeclaresOgTypeGame,
} from "./brand-check.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(TEMPLATE_ROOT, "scripts/brand-check.mjs");

const GAME_SITE = JSON.stringify({ title: "Wild Race", type: "x:game", card: "custom" });
const UTILITY_SITE = JSON.stringify({ title: "Invoice" });
const UTILITY_CUSTOM_SITE = JSON.stringify({ title: "Invoice", card: "custom" });

function makeWorkspace({
  siteJson,
  cardFile,
  narrowFile,
  cardBytes = 200 * 1024,
  narrowBytes = 200 * 1024,
  pendingAgeMs,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "brand-check-"));
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, "src/lib/og"), { recursive: true });
  mkdirSync(join(root, ".grok"), { recursive: true });
  if (pendingAgeMs !== undefined) {
    const marker = join(root, OG_PENDING_REL_PATH);
    writeFileSync(marker, "");
    const when = new Date(Date.now() - pendingAgeMs);
    utimesSync(marker, when, when);
  }
  if (siteJson !== undefined) {
    writeFileSync(join(root, "src/lib/og/site.json"), siteJson);
  }
  if (cardFile !== undefined) {
    writeFileSync(join(root, "public", cardFile), Buffer.alloc(cardBytes, 7));
  }
  if (narrowFile !== undefined) {
    writeFileSync(join(root, "public", narrowFile), Buffer.alloc(narrowBytes, 7));
  }
  return root;
}

test("non-canvas app with no custom card gets a soft BRAND NOTE (utility exception)", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE });
  const warnings = computeBrandWarnings({ hasCanvas: false, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^BRAND NOTE:/);
  assert.match(warnings[0], /plain utilit/);
  assert.doesNotMatch(warnings[0], /^BRAND WARNING:/);
});

test("non-canvas app with a compliant card is silent", () => {
  const root = makeWorkspace({ siteJson: UTILITY_CUSTOM_SITE, cardFile: "og.jpg" });
  assert.deepEqual(computeBrandWarnings({ hasCanvas: false, workspaceRoot: root }), []);
});

test("card file without site.json card=custom warns", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE, cardFile: "og.jpg" });
  const warnings = computeBrandWarnings({ hasCanvas: false, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"card": "custom"/);
});

test("card file with missing site.json warns for card=custom", () => {
  const root = makeWorkspace({ cardFile: "og.jpg" });
  const warnings = computeBrandWarnings({ hasCanvas: false, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"card": "custom"/);
});

test("card file with invalid site.json warns for card=custom", () => {
  const root = makeWorkspace({ siteJson: "{not-json", cardFile: "og.jpg" });
  const warnings = computeBrandWarnings({ hasCanvas: false, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"card": "custom"/);
});

test("oversized card warns for non-canvas apps too", () => {
  const root = makeWorkspace({
    siteJson: UTILITY_CUSTOM_SITE,
    cardFile: "og.jpg",
    cardBytes: MAX_CARD_BYTES + 1,
  });
  const warnings = computeBrandWarnings({ hasCanvas: false, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /over 600 KB/);
});

test("canvas app with no card warns 'missing' and missing og:type", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE });
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /og\.jpg.*is missing/s);
  assert.match(warnings[0], /not done/);
  assert.match(warnings[1], /site\.json/);
  assert.match(warnings[1], /og:type|x:game/);
});

test("canvas card without type still warns for og:type", () => {
  const root = makeWorkspace({ siteJson: UTILITY_CUSTOM_SITE, cardFile: "og.jpg" });
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.match(warnings.join("\n"), /x:game/);
  assert.match(warnings.join("\n"), /x-banner\.jpg/);
});

test("oversized card warns on the scraper budget (jpg and legacy png)", () => {
  for (const cardFile of ["og.jpg", "og.png"]) {
    const root = makeWorkspace({
      siteJson: GAME_SITE,
      cardFile,
      cardBytes: MAX_CARD_BYTES + 1,
      narrowFile: "x-banner.jpg",
    });
    const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
    assert.match(warnings[0], /over 600 KB/);
  }
});

test("compliant game (custom card + site.json type + x-banner) is silent", () => {
  const root = makeWorkspace({
    siteJson: GAME_SITE,
    cardFile: "og.jpg",
    narrowFile: "x-banner.jpg",
  });
  assert.deepEqual(computeBrandWarnings({ hasCanvas: true, workspaceRoot: root }), []);
});

test("__root.tsx og:type no longer satisfies the canvas gate", () => {
  const root = makeWorkspace({
    siteJson: UTILITY_CUSTOM_SITE,
    cardFile: "og.jpg",
    narrowFile: "x-banner.jpg",
  });
  mkdirSync(join(root, "src/routes"), { recursive: true });
  writeFileSync(
    join(root, "src/routes/__root.tsx"),
    '{ property: "og:type", content: "x:game" }',
  );
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /x:game/);
});

test("oversized x-banner warns on the same scraper budget as og.jpg", () => {
  const root = makeWorkspace({
    siteJson: GAME_SITE,
    cardFile: "og.jpg",
    narrowFile: "x-banner.jpg",
    narrowBytes: MAX_CARD_BYTES + 1,
  });
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /x-banner\.jpg is over 600 KB/);
});

test("legacy png + site.json type still needs the X feed card", () => {
  const root = makeWorkspace({
    siteJson: GAME_SITE,
    cardFile: "og.png",
  });
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.match(warnings.join("\n"), /x-banner\.jpg/);
});

test("siteDeclaresOgTypeGame reads the site contract", () => {
  assert.equal(siteDeclaresOgTypeGame({ type: "x:game" }), true);
  assert.equal(siteDeclaresOgTypeGame({ type: "website" }), false);
  assert.equal(siteDeclaresOgTypeGame({}), false);
});

test("a fresh og-pending marker silences the whole gate view", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE, pendingAgeMs: 1000 });
  // Every caller reports this array as a count, so an in-flight card has to
  // leave nothing behind — a note would print as "brand: 1 warning(s)".
  assert.deepEqual(computeBrandWarnings({ hasCanvas: true, workspaceRoot: root }), []);
  assert.deepEqual(computeBrandWarnings({ hasCanvas: false, workspaceRoot: root }), []);
});

test("a stale og-pending marker is ignored and the warnings return", () => {
  const root = makeWorkspace({
    siteJson: UTILITY_SITE,
    pendingAgeMs: OG_PENDING_MAX_AGE_MS + 1000,
  });
  assert.equal(ogPendingActive(root), false);
  const warnings = computeBrandWarnings({ hasCanvas: true, workspaceRoot: root });
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /not done/);
});

test("the marker goes stale on the clock, not on the file", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE, pendingAgeMs: 1000 });
  const justInside = Date.now() + OG_PENDING_MAX_AGE_MS - 5000;
  const pastIt = Date.now() + OG_PENDING_MAX_AGE_MS + 5000;
  assert.deepEqual(
    computeBrandWarnings({ hasCanvas: true, workspaceRoot: root, now: justInside }),
    [],
  );
  assert.match(
    computeBrandWarnings({ hasCanvas: true, workspaceRoot: root, now: pastIt })[0],
    /^BRAND WARNING:/,
  );
});

test("no marker means nothing is in flight", () => {
  assert.equal(ogPendingActive(makeWorkspace()), false);
});

test("parseBrandCheckArgs takes --game, --placeholder-ok and --root, and rejects the rest", () => {
  assert.deepEqual(parseBrandCheckArgs([]), { game: false, placeholderOk: false, root: null });
  assert.deepEqual(parseBrandCheckArgs(["--game", "--root", "/tmp/w"]), {
    game: true,
    placeholderOk: false,
    root: "/tmp/w",
  });
  assert.equal(parseBrandCheckArgs(["--placeholder-ok"]).placeholderOk, true);
  assert.match(parseBrandCheckArgs(["--root"]).error, /--root needs a directory/);
  assert.match(parseBrandCheckArgs(["--canvas"]).error, /unexpected argument: --canvas/);
});

const runCheck = (root, extra = []) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...extra], { encoding: "utf8" });

test("cli: a game missing its card reports JSON and exits 1", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE });
  const run = runCheck(root, ["--game"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.pending, false);
  assert.equal(result.warnings, 2);
  assert.equal(result.workspaceRoot, root);
});

test("cli: a compliant game passes", () => {
  const root = makeWorkspace({
    siteJson: GAME_SITE,
    cardFile: "og.jpg",
    narrowFile: "x-banner.jpg",
  });
  const run = runCheck(root, ["--game"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).messages, []);
});

test("cli: the task's own marker is reported, not honoured", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE, pendingAgeMs: 1000 });
  const run = runCheck(root, ["--game"]);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.pending, true);
  assert.equal(result.warnings, 2);
});

test("cli: a bad argument fails with JSON on stderr", () => {
  const run = runCheck(makeWorkspace(), ["--nope"]);
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stderr).ok, false);
});

test("cli: a non-game with no card fails too — the pass exists to produce one", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE });
  const run = runCheck(root);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.warnings, 1);
  assert.match(result.messages[0], /^BRAND WARNING: .*og\.jpg is missing and this pass exists/);
  // The parent's gate keeps tolerating the placeholder for a plain utility.
  assert.match(computeBrandWarnings({ hasCanvas: false, workspaceRoot: root })[0], /^BRAND NOTE:/);
});

test("cli: --placeholder-ok is how a plain-utility pass reports no card as expected", () => {
  const root = makeWorkspace({ siteJson: UTILITY_SITE });
  const run = runCheck(root, ["--placeholder-ok"]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true);
  assert.match(result.messages[0], /^BRAND NOTE:/);
  // A game is never a placeholder app, so the flag cannot excuse one.
  const game = runCheck(root, ["--game", "--placeholder-ok"]);
  assert.equal(game.status, 1, game.stdout + game.stderr);
  assert.match(JSON.parse(game.stdout).messages[0], /^BRAND WARNING: .*not done/s);
});

test("cli: a non-game with a compliant card passes", () => {
  const root = makeWorkspace({ siteJson: UTILITY_CUSTOM_SITE, cardFile: "og.jpg" });
  const run = runCheck(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).messages, []);
});

// --- the prompts are the only enforcement here, so pin them to the code ---

const readDoc = (rel) => readFileSync(join(TEMPLATE_ROOT, rel), "utf8");

test("SKILL.md and AGENTS.md name the marker path and bound this script uses", () => {
  // Prose wraps, so the minute count may straddle a line break.
  const bound = new RegExp(`${OG_PENDING_MAX_AGE_MS / 60_000}\\s+minutes`);
  for (const rel of [".grok/skills/og/SKILL.md", "AGENTS.md"]) {
    const doc = readDoc(rel);
    assert.ok(doc.includes(`/workspace/${OG_PENDING_REL_PATH}`), `${rel}: marker path`);
    assert.ok(bound.test(doc), `${rel}: staleness bound`);
  }
});

// The two places that own "never wait on the brand task". Scanning the whole
// of AGENTS.md instead would make every unrelated `wait_tasks` mention a future
// feature adds to it this test's business.
const PROHIBITION_SECTIONS = [
  {
    rel: ".grok/skills/og/SKILL.md",
    label: '§ "Brand-asset pass"',
    from: "## Brand-asset pass:",
    until: /\n## /,
  },
  {
    rel: "AGENTS.md",
    label: "execution loop step 6",
    from: "6. **Brand-asset pass",
    until: /\n7\. /,
  },
];

function prohibitionSection({ rel, label, from, until }) {
  const doc = readDoc(rel);
  const start = doc.indexOf(from);
  assert.notEqual(start, -1, `${rel}: ${label} moved — no "${from.trim()}"`);
  const rest = doc.slice(start + from.length);
  const end = rest.search(until);
  // Markdown emphasis and prose wrapping both sit between the two words.
  return (from + (end === -1 ? rest : rest.slice(0, end))).replace(/[`*]/g, "").replace(/\s+/g, " ");
}

test("the sections that own the brand-task prohibition never affirm a wait", () => {
  // Pinned on the shape of the prohibition, not on a negation being somewhere
  // nearby: "So: wait_tasks before the final verify, but never get_task_output"
  // keeps a negation in the sentence while instructing exactly the wait.
  const connectors = /(?:\s|[/,;]|\band\b|\bor\b|\bwait_tasks\b|\bget_task_output\b)+$/i;
  const negation = /\b(?:no|never|not|don['’]t)$/i;
  for (const section of PROHIBITION_SECTIONS) {
    const where = `${section.rel} ${section.label}`;
    const prose = prohibitionSection(section);
    const mentions = [...prose.matchAll(/wait_tasks|get_task_output/g)];
    assert.ok(mentions.length >= 2, `${where}: the prohibition itself went missing`);
    for (const match of mentions) {
      const before = prose.slice(0, match.index).replace(connectors, "");
      const context = prose.slice(Math.max(0, match.index - 60), match.index + 20);
      assert.ok(negation.test(before), `${where}: not a prohibition: …${context}…`);
    }
  }
});

test("SKILL.md tells the pass to self-check with the flag this CLI accepts", () => {
  const skill = readDoc(".grok/skills/og/SKILL.md");
  const invocations = skill.match(/node scripts\/brand-check\.mjs[^\n`]*/g) ?? [];
  assert.ok(invocations.length > 0);
  for (const line of invocations) {
    const argv = line.replace("node scripts/brand-check.mjs", "").trim().split(/\s+/);
    assert.equal(parseBrandCheckArgs(argv.filter(Boolean)).error, undefined, line);
  }
});
