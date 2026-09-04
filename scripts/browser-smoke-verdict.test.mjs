import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  baselineComparison,
  bodyTextPrefix,
  compareToBaseline,
  derivedPaths,
  exitCodeFor,
  normalizeBodyText,
  normalizedBodyTextHash,
  parseSmokeArgs,
} from "./browser-smoke-verdict.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function viewport(overrides = {}) {
  return {
    status: 200,
    title: "App",
    hasCanvas: false,
    horizontalOverflow: false,
    bodyTextLen: 500,
    bodyTextHash: "aaa",
    bodyTextPrefix: "hello world",
    consoleErrors: [],
    pageErrors: [],
    ...overrides,
  };
}

function verdict(desktop = {}, mobile = {}) {
  return { viewports: { desktop: viewport(desktop), mobile: viewport(mobile) } };
}

test("normalizes whitespace before hashing", () => {
  assert.equal(normalizeBodyText("  a \n\t b  "), "a b");
  assert.equal(normalizedBodyTextHash("a \n b"), normalizedBodyTextHash("  a b "));
  assert.notEqual(normalizedBodyTextHash("a b"), normalizedBodyTextHash("a c"));
});

test("nullish and blank body text normalize to the empty string", () => {
  assert.equal(normalizeBodyText(null), "");
  assert.equal(normalizeBodyText(undefined), "");
  assert.equal(normalizedBodyTextHash(""), normalizedBodyTextHash("  \n "));
});

test("body text prefix is normalized and capped", () => {
  assert.equal(bodyTextPrefix("  a \n b  "), "a b");
  assert.equal(bodyTextPrefix("x".repeat(200)).length, 64);
});

test("identical runs do not diverge", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(verdict(), verdict());
  assert.equal(divergesFromBaseline, false);
  assert.deepEqual(reasons, []);
});

test("status change diverges", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(verdict({ status: 500 }), verdict());
  assert.equal(divergesFromBaseline, true);
  assert.match(reasons.join(";"), /desktop: HTTP status changed 200 -> 500/);
});

test("title change diverges", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(
    verdict({ title: "Error" }),
    verdict(),
  );
  assert.equal(divergesFromBaseline, true);
  assert.match(reasons.join(";"), /desktop: title changed \("App" -> "Error"\)/);
});

test("title comparison is skipped when either side lacks one", () => {
  const { divergesFromBaseline } = compareToBaseline(
    verdict({ title: undefined }),
    verdict({ title: "App" }),
  );
  assert.equal(divergesFromBaseline, false);
});

test("canvas disappearing diverges; canvas appearing does not", () => {
  const gone = compareToBaseline(verdict({ hasCanvas: false }), verdict({ hasCanvas: true }));
  assert.equal(gone.divergesFromBaseline, true);
  assert.match(gone.reasons.join(";"), /desktop: canvas disappeared/);

  const appeared = compareToBaseline(verdict({ hasCanvas: true }), verdict({ hasCanvas: false }));
  assert.equal(appeared.divergesFromBaseline, false);
});

test("horizontal overflow appearing diverges; clearing does not", () => {
  const appeared = compareToBaseline(
    verdict({}, { horizontalOverflow: true }),
    verdict({}, { horizontalOverflow: false }),
  );
  assert.equal(appeared.divergesFromBaseline, true);
  assert.match(appeared.reasons.join(";"), /mobile: horizontal overflow appeared/);

  const cleared = compareToBaseline(
    verdict({}, { horizontalOverflow: false }),
    verdict({}, { horizontalOverflow: true }),
  );
  assert.equal(cleared.divergesFromBaseline, false);
});

test("new console errors diverge", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(
    verdict({}, { consoleErrors: ["boom"] }),
    verdict(),
  );
  assert.equal(divergesFromBaseline, true);
  assert.match(reasons.join(";"), /mobile: console\/page errors appeared/);
});

test("errors already present in the baseline do not re-diverge", () => {
  const { divergesFromBaseline } = compareToBaseline(
    verdict({ consoleErrors: ["boom"] }),
    verdict({ consoleErrors: ["boom"] }),
  );
  assert.equal(divergesFromBaseline, false);
});

test("body text collapse diverges", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(
    verdict({ bodyTextLen: 10, bodyTextHash: "bbb" }),
    verdict(),
  );
  assert.equal(divergesFromBaseline, true);
  assert.match(reasons.join(";"), /desktop: body text collapsed \(500 -> 10 chars\)/);
});

test("body text dropping to zero reports collapse", () => {
  const { reasons } = compareToBaseline(
    verdict({ bodyTextLen: 0, bodyTextHash: "bbb", bodyTextPrefix: "" }),
    verdict(),
  );
  assert.match(reasons.join(";"), /desktop: body text collapsed \(500 -> 0 chars\)/);
});

test("zero-length baseline reports growth via the hash branch, not collapse", () => {
  const { reasons } = compareToBaseline(
    verdict({ bodyTextLen: 500 }),
    verdict({ bodyTextLen: 0, bodyTextHash: "bbb", bodyTextPrefix: "" }),
  );
  assert.match(reasons.join(";"), /desktop: body text changed \(0 -> 500 chars/);
});

test("hash mismatch with a trivial length delta and same page start is tolerated", () => {
  const { divergesFromBaseline } = compareToBaseline(
    verdict({ bodyTextLen: 510, bodyTextHash: "bbb" }),
    verdict(),
  );
  assert.equal(divergesFromBaseline, false);
});

test("hash mismatch with a trivial length delta but changed page start diverges", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(
    verdict({ bodyTextLen: 510, bodyTextHash: "bbb", bodyTextPrefix: "500 Internal Error" }),
    verdict(),
  );
  assert.equal(divergesFromBaseline, true);
  assert.match(
    reasons.join(";"),
    /desktop: body text replaced \(similar length, page start changed\)/,
  );
});

test("prefix check is skipped when either side lacks a prefix", () => {
  const cases = [
    [{ bodyTextPrefix: undefined }, { bodyTextPrefix: undefined }],
    [{}, { bodyTextPrefix: undefined }],
    [{ bodyTextPrefix: undefined }, {}],
  ];
  for (const [curOverrides, baseOverrides] of cases) {
    const { divergesFromBaseline } = compareToBaseline(
      verdict({ bodyTextLen: 510, bodyTextHash: "bbb", ...curOverrides }),
      verdict(baseOverrides),
    );
    assert.equal(divergesFromBaseline, false);
  }
});

test("length-delta tolerance boundary: 50 tolerated, 51 diverges (500-char baseline)", () => {
  const at = compareToBaseline(verdict({ bodyTextLen: 550, bodyTextHash: "bbb" }), verdict());
  assert.equal(at.divergesFromBaseline, false);

  const over = compareToBaseline(verdict({ bodyTextLen: 551, bodyTextHash: "bbb" }), verdict());
  assert.equal(over.divergesFromBaseline, true);
  assert.match(over.reasons.join(";"), /desktop: body text changed/);
});

test("length-delta floor dominates small baselines: 20 tolerated, 21 diverges (100-char baseline)", () => {
  const base = verdict({ bodyTextLen: 100 }, { bodyTextLen: 100 });
  const at = compareToBaseline(
    verdict({ bodyTextLen: 120, bodyTextHash: "bbb" }, { bodyTextLen: 100 }),
    base,
  );
  assert.equal(at.divergesFromBaseline, false);

  const over = compareToBaseline(
    verdict({ bodyTextLen: 121, bodyTextHash: "bbb" }, { bodyTextLen: 100 }),
    base,
  );
  assert.equal(over.divergesFromBaseline, true);
});

test("collapse boundary: exactly half is 'changed', one below is 'collapsed'", () => {
  const half = compareToBaseline(verdict({ bodyTextLen: 250, bodyTextHash: "bbb" }), verdict());
  assert.match(half.reasons.join(";"), /desktop: body text changed \(500 -> 250 chars/);

  const below = compareToBaseline(verdict({ bodyTextLen: 249, bodyTextHash: "bbb" }), verdict());
  assert.match(below.reasons.join(";"), /desktop: body text collapsed \(500 -> 249 chars\)/);
});

test("missing baseline viewport diverges", () => {
  const { divergesFromBaseline, reasons } = compareToBaseline(verdict(), {
    viewports: { desktop: viewport() },
  });
  assert.equal(divergesFromBaseline, true);
  assert.match(reasons.join(";"), /mobile: no baseline data/);
});

test("empty or null baseline diverges for every viewport", () => {
  for (const baseline of [{}, null]) {
    const { divergesFromBaseline, reasons } = compareToBaseline(verdict(), baseline);
    assert.equal(divergesFromBaseline, true);
    assert.match(reasons.join(";"), /desktop: no baseline data/);
    assert.match(reasons.join(";"), /mobile: no baseline data/);
  }
});

test("degenerate current verdict fails closed", () => {
  for (const current of [null, undefined, {}, { viewports: {} }]) {
    const { divergesFromBaseline, reasons } = compareToBaseline(current, verdict());
    assert.equal(divergesFromBaseline, true);
    assert.deepEqual(reasons, ["current verdict has no viewport data"]);
  }
});

test("multiple signals across viewports all accumulate", () => {
  const { reasons } = compareToBaseline(
    verdict({ status: 500 }, { consoleErrors: ["boom"] }),
    verdict(),
  );
  assert.match(reasons.join(";"), /desktop: HTTP status changed/);
  assert.match(reasons.join(";"), /mobile: console\/page errors appeared/);
  assert.equal(reasons.length, 2);
});

test("baselineComparison round-trips a valid baseline", () => {
  const { divergesFromBaseline } = baselineComparison(verdict(), JSON.stringify(verdict()));
  assert.equal(divergesFromBaseline, false);
});

test("baselineComparison fails closed on malformed or wrong-shape baselines", () => {
  for (const raw of ["{", "", "not json"]) {
    const { divergesFromBaseline, reasons } = baselineComparison(verdict(), raw);
    assert.equal(divergesFromBaseline, true);
    assert.deepEqual(reasons, ["baseline unreadable: invalid JSON"]);
  }
  for (const raw of [
    "null",
    "[]",
    "0",
    "false",
    '""',
    "{}",
    '{"viewports": null}',
    '{"viewports": []}',
  ]) {
    const { divergesFromBaseline, reasons } = baselineComparison(verdict(), raw);
    assert.equal(divergesFromBaseline, true);
    assert.deepEqual(reasons, ["baseline unreadable: not a verdict object"]);
  }
});

test("parseSmokeArgs defaults", () => {
  assert.deepEqual(parseSmokeArgs([], {}), {
    url: "http://127.0.0.1:8080/",
    outPng: "/workspace/screenshots/app-builder-preview.png",
    baseline: "",
  });
});

test("parseSmokeArgs consumes --baseline without shifting positionals", () => {
  assert.deepEqual(
    parseSmokeArgs(
      ["http://127.0.0.1:8081/", "--baseline", "/workspace/a.json", "/workspace/b.png"],
      {},
    ),
    {
      url: "http://127.0.0.1:8081/",
      outPng: "/workspace/b.png",
      baseline: "/workspace/a.json",
    },
  );
});

test("parseSmokeArgs rejects a trailing --baseline flag", () => {
  assert.deepEqual(parseSmokeArgs(["--baseline"], {}), {
    error: "--baseline requires a path to a prior verdict JSON",
  });
});

test("parseSmokeArgs supports the --baseline= form", () => {
  assert.equal(parseSmokeArgs(["--baseline=/workspace/a.json"], {}).baseline, "/workspace/a.json");
  assert.deepEqual(parseSmokeArgs(["--baseline="], {}), {
    error: "--baseline requires a path to a prior verdict JSON",
  });
});

test("parseSmokeArgs rejects unknown flags instead of treating them as positionals", () => {
  assert.deepEqual(parseSmokeArgs(["--nope"], {}), { error: "unknown flag: --nope" });
  assert.deepEqual(
    parseSmokeArgs(["http://127.0.0.1:8080/", "--Baseline", "/workspace/a.json"], {}),
    {
      error: "unknown flag: --Baseline",
    },
  );
});

test("parseSmokeArgs env fallback and flag precedence", () => {
  const env = { BROWSER_SMOKE_BASELINE: "/workspace/env.json" };
  assert.equal(parseSmokeArgs([], env).baseline, "/workspace/env.json");
  assert.equal(
    parseSmokeArgs(["--baseline", "/workspace/flag.json"], env).baseline,
    "/workspace/flag.json",
  );
});

test("derivedPaths handles .png, .PNG, and extensionless inputs", () => {
  assert.deepEqual(derivedPaths("/workspace/shot.png"), {
    mobilePng: "/workspace/shot-mobile.png",
    verdictJson: "/workspace/shot.json",
  });
  assert.deepEqual(derivedPaths("/workspace/shot.PNG"), {
    mobilePng: "/workspace/shot-mobile.png",
    verdictJson: "/workspace/shot.json",
  });
  assert.deepEqual(derivedPaths("/workspace/shot"), {
    mobilePng: "/workspace/shot-mobile.png",
    verdictJson: "/workspace/shot.json",
  });
});

test("exitCodeFor: clean run exits 0", () => {
  assert.equal(exitCodeFor(verdict().viewports), 0);
});

test("exitCodeFor: errors in any single viewport exit 2", () => {
  assert.equal(exitCodeFor(verdict({}, { consoleErrors: ["boom"] }).viewports), 2);
  assert.equal(exitCodeFor(verdict({ pageErrors: ["boom"] }).viewports), 2);
});

test("exitCodeFor: navigation failure in any viewport exits 1, beating errors", () => {
  assert.equal(exitCodeFor(verdict({}, { status: 500 }).viewports), 1);
  assert.equal(exitCodeFor(verdict({ status: 0 }).viewports), 1);
  assert.equal(exitCodeFor(verdict({ status: 404 }, { consoleErrors: ["boom"] }).viewports), 1);
});

test("exitCodeFor: 4xx boundary and missing status", () => {
  assert.equal(exitCodeFor(verdict({ status: 399 }).viewports), 0);
  assert.equal(exitCodeFor(verdict({ status: 400 }).viewports), 1);
  assert.equal(exitCodeFor(verdict({ status: undefined }).viewports), 1);
});

test("exitCodeFor: no viewport data is a failure", () => {
  assert.equal(exitCodeFor({}), 1);
  assert.equal(exitCodeFor(undefined), 1);
});

test("browser-smoke wires the guard and verdict helpers", () => {
  const src = readFileSync(join(TEMPLATE_ROOT, "scripts/browser-smoke.mjs"), "utf8");
  assert.match(src, /from "\.\/browser-guard\.mjs"/);
  assert.match(src, /from "\.\/browser-smoke-verdict\.mjs"/);
  assert.match(src, /const args = parseSmokeArgs\(process\.argv\.slice\(2\), process\.env\)/);
  assert.match(src, /const url = checkedUrl\(args\.url\)/);
  assert.match(src, /const outPng = checkedOutputPath\(args\.outPng, \["\/workspace"\]\)/);
  assert.match(src, /const mobilePng = checkedOutputPath\(derived\.mobilePng, \["\/workspace"\]\)/);
  assert.match(src, /const outJson = checkedOutputPath\(derived\.verdictJson, \["\/workspace"\]/);
  assert.match(src, /checkedOutputPath\(realpathSync\(args\.baseline\), \["\/workspace"\]/);
  assert.match(src, /baselinePath === outJson/);
  assert.match(src, /normalizedBodyTextHash\(/);
  assert.match(src, /bodyTextPrefix\(/);
  assert.match(src, /baselineComparison\(/);
  assert.match(src, /process\.exitCode = exitCodeFor\(viewports\)/);
  assert.match(src, /waitUntil: "domcontentloaded"/);
  assert.doesNotMatch(
    src,
    /waitUntil:\s*["']networkidle["']/,
    "Vite HMR never reaches networkidle",
  );
  assert.match(src, /} finally \{\s*await browser\?\.close\(\);/s);
  assert.doesNotMatch(
    src.slice(src.indexOf("let browser = null")),
    /process\.exit\(/,
    "process.exit after Chromium launch skips finally teardown",
  );
});

test("browser-smoke file I/O only touches guarded paths", () => {
  const src = readFileSync(join(TEMPLATE_ROOT, "scripts/browser-smoke.mjs"), "utf8");
  assert.doesNotMatch(src, /(?:writeFileSync|readFileSync|statSync|realpathSync)\(\s*["'`]/);
  const writes = [...src.matchAll(/writeFileSync\(\s*([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
  assert.equal(writes.length, 2);
  assert.ok(
    writes.every((v) => v === "outJson"),
    `unexpected writeFileSync target: ${writes}`,
  );
  const reads = [...src.matchAll(/readFileSync\(\s*([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
  assert.deepEqual(reads, ["baselinePath"]);
  const stats = [...src.matchAll(/statSync\(\s*([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
  assert.deepEqual(stats, ["baselinePath"]);
});
