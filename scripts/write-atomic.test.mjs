import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { handOver, parseWriteAtomicArgs, stagingError } from "./write-atomic.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(TEMPLATE_ROOT, "scripts/write-atomic.mjs");

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "write-atomic-"));
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, ".grok"), { recursive: true });
  return root;
}

test("parseWriteAtomicArgs needs exactly a staged file and a target", () => {
  assert.deepEqual(parseWriteAtomicArgs([".grok/og.tmp", "public/og.jpg"]), {
    staged: ".grok/og.tmp",
    target: "public/og.jpg",
  });
  assert.match(parseWriteAtomicArgs([]).error, /usage:/);
  assert.match(parseWriteAtomicArgs([".grok/og.tmp"]).error, /usage:/);
  assert.match(parseWriteAtomicArgs(["a", "b", "c"]).error, /unexpected argument: c/);
});

test("stagingError refuses a temp inside public/ and a no-op move", () => {
  const publicDir = "/workspace/public";
  assert.equal(
    stagingError({
      staged: "/workspace/.grok/og.jpg.tmp",
      target: "/workspace/public/og.jpg",
      publicDir,
    }),
    null,
  );
  assert.match(
    stagingError({
      staged: "/workspace/public/og.jpg.tmp",
      target: "/workspace/public/og.jpg",
      publicDir,
    }),
    /vite build ships that directory verbatim/,
  );
  assert.match(
    stagingError({
      staged: "/workspace/public/og.jpg",
      target: "/workspace/public/og.jpg",
      publicDir,
    }),
    /same path/,
  );
});

test("handOver replaces the target and clears the staged file", () => {
  const root = makeWorkspace();
  const staged = join(root, ".grok/og.jpg.tmp");
  const target = join(root, "public/og.jpg");
  writeFileSync(target, "old card");
  writeFileSync(staged, "new card");

  handOver(staged, target);

  assert.equal(readFileSync(target, "utf8"), "new card");
  assert.equal(existsSync(staged), false);
});

test("handOver creates a missing target directory", () => {
  const root = makeWorkspace();
  const staged = join(root, ".grok/site.json.tmp");
  writeFileSync(staged, '{"title":"Sky Strike"}');

  handOver(staged, join(root, "src/lib/og/site.json"));

  assert.equal(readFileSync(join(root, "src/lib/og/site.json"), "utf8"), '{"title":"Sky Strike"}');
});

test("an interrupted pass leaves the target on its old bytes, temp-free", () => {
  const root = makeWorkspace();
  const target = join(root, "public/og.jpg");
  writeFileSync(target, "old card");
  // The staged file a killed ffmpeg leaves behind: never handed over.
  writeFileSync(join(root, ".grok/og.jpg.tmp"), "half a JPEG");

  assert.equal(readFileSync(target, "utf8"), "old card");
  assert.throws(() => handOver(join(root, ".grok/absent.tmp"), target), { code: "ENOENT" });
  assert.equal(readFileSync(target, "utf8"), "old card");
  assert.equal(existsSync(`${target}.tmp-${process.pid}`), false);
});

test("a failed hand-over creates no directory for the target it never wrote", () => {
  const root = makeWorkspace();
  const missing = join(root, ".grok/absent.tmp");
  assert.throws(() => handOver(missing, join(root, "src/lib/og/site.json")), { code: "ENOENT" });
  assert.equal(existsSync(join(root, "src")), false);
});

test("a staged file on another filesystem is refused, not copied", () => {
  const root = makeWorkspace();
  const staged = join(root, ".grok/og.jpg.tmp");
  const target = join(root, "public/og.jpg");
  writeFileSync(staged, "new card");
  writeFileSync(target, "old card");
  const crossDevice = () => {
    throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
  };

  assert.throws(() => handOver(staged, target, { rename: crossDevice }), {
    message: /stage under \/workspace\/\.grok\//,
  });
  // Copying would have had to stage its own temp inside public/, which is the
  // one place stagingError refuses.
  assert.deepEqual(readdirSync(join(root, "public")), ["og.jpg"]);
  assert.equal(readFileSync(target, "utf8"), "old card");
});

test("cli: hands the file over, and refuses a temp staged in public/", () => {
  const root = makeWorkspace();
  writeFileSync(join(root, ".grok/og.jpg.tmp"), "new card");
  const ok = spawnSync(
    process.execPath,
    [SCRIPT, join(root, ".grok/og.jpg.tmp"), join(root, "public/og.jpg")],
    { encoding: "utf8" },
  );
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(readFileSync(join(root, "public/og.jpg"), "utf8"), "new card");

  // publicDir comes from the script's own root, so refusal is checked there.
  const templateRoot = join(dirname(SCRIPT), "..");
  const staged = join(templateRoot, "public/og.jpg.tmp");
  const refused = spawnSync(
    process.execPath,
    [SCRIPT, staged, join(templateRoot, "public/og.jpg")],
    { encoding: "utf8" },
  );
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /stage outside/);
  assert.equal(existsSync(staged), false);
});

test("cli: relative paths follow the script's root, not the caller's cwd", () => {
  // Same relative pair the skill documents, run from a workspace that has its
  // own public/: resolving against cwd would take the staged temp out of the
  // directory the refusal is defined against and move it.
  const root = makeWorkspace();
  writeFileSync(join(root, "public/og.jpg.tmp"), "half a JPEG");
  const run = spawnSync(process.execPath, [SCRIPT, "public/og.jpg.tmp", "public/og.jpg"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /stage outside/);
  assert.equal(readFileSync(join(root, "public/og.jpg.tmp"), "utf8"), "half a JPEG");
  assert.equal(existsSync(join(root, "public/og.jpg")), false);
});

test("every hand-over the og skill prints is one this script accepts", () => {
  // The card and banner recipes live in the skill's references/, not SKILL.md.
  const skillDir = join(TEMPLATE_ROOT, ".grok/skills/og");
  const docs = [
    join(skillDir, "SKILL.md"),
    ...readdirSync(join(skillDir, "references")).map((f) => join(skillDir, "references", f)),
  ];
  const invocations = docs.flatMap(
    (path) => readFileSync(path, "utf8").match(/node scripts\/write-atomic\.mjs[^\n`]*/g) ?? [],
  );
  assert.ok(invocations.length >= 3, "og.jpg, x-banner.jpg and site.json each hand over");
  for (const line of invocations) {
    const argv = line.replace("node scripts/write-atomic.mjs", "").trim().split(/\s+/);
    const args = parseWriteAtomicArgs(argv);
    assert.equal(args.error, undefined, line);
    assert.equal(
      stagingError({ staged: args.staged, target: args.target, publicDir: "/workspace/public" }),
      null,
      line,
    );
  }
});

test("cli: a missing staged file fails without touching the target", () => {
  const root = makeWorkspace();
  writeFileSync(join(root, "public/og.jpg"), "old card");
  const run = spawnSync(
    process.execPath,
    [SCRIPT, join(root, ".grok/absent.tmp"), join(root, "public/og.jpg")],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /\[write-atomic\]/);
  assert.equal(readFileSync(join(root, "public/og.jpg"), "utf8"), "old card");
});
