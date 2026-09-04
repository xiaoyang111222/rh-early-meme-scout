#!/usr/bin/env node
/**
 * Hand a staged file over to a path another agent reads, in one step.
 *
 *   node scripts/write-atomic.mjs /workspace/.grok/og.jpg.tmp public/og.jpg
 *
 * The brand-asset task writes public/og.jpg and src/lib/og/site.json while the
 * parent may be mid-`npm run build`, so an in-place write can be read
 * half-finished. rename(2) is atomic within one filesystem: a reader sees the
 * old bytes or the new ones. /workspace is one filesystem, so a staged file
 * from anywhere else (/tmp is a separate mount) is refused rather than copied:
 * copying would have to land its temp in the target's directory, which is the
 * one thing a staged path is not allowed to do.
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function parseWriteAtomicArgs(argv) {
  const [staged, target, ...rest] = argv;
  if (!staged || !target) {
    return { error: "usage: node scripts/write-atomic.mjs <staged-file> <target>" };
  }
  if (rest.length > 0) return { error: `unexpected argument: ${rest[0]}` };
  return { staged, target };
}

function isInside(dir, file) {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Why a staged path can be refused: `vite build` copies public/ verbatim into
 * the deployed app, so a temp that lands there ships (and an interrupted run
 * leaves it behind).
 */
export function stagingError({ staged, target, publicDir }) {
  if (staged === target) return `staged file and target are the same path: ${target}`;
  if (isInside(publicDir, staged)) {
    return `stage outside ${publicDir} (vite build ships that directory verbatim): ${staged}`;
  }
  return null;
}

/**
 * Moves `staged` onto `target`, leaving `target` untouched if anything fails.
 * `rename` is injectable because EXDEV — the refusal the "stage under
 * /workspace/.grok/" contract rests on — cannot be provoked portably.
 */
export function handOver(staged, target, { rename = renameSync } = {}) {
  if (!existsSync(staged)) {
    throw Object.assign(new Error(`staged file is missing: ${staged}`), { code: "ENOENT" });
  }
  mkdirSync(dirname(target), { recursive: true });
  try {
    rename(staged, target);
  } catch (err) {
    if (err?.code === "EXDEV") {
      throw new Error(
        `${staged} is on another filesystem than ${target}, so the hand-over cannot be a `
          + "rename — stage under /workspace/.grok/ instead",
      );
    }
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseWriteAtomicArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[write-atomic] ${args.error}`);
    process.exit(1);
  }
  // Relative paths follow this script's root, not the caller's cwd: the brand
  // pass runs from wherever its sub-shell left it, and the public/ refusal
  // below is defined against that same root.
  const staged = resolve(ROOT, args.staged);
  const target = resolve(ROOT, args.target);
  const problem = stagingError({ staged, target, publicDir: join(ROOT, "public") });
  if (problem) {
    console.error(`[write-atomic] ${problem}`);
    process.exit(1);
  }
  try {
    handOver(staged, target);
  } catch (err) {
    console.error(`[write-atomic] ${staged} → ${target} failed: ${err?.message || err}`);
    process.exit(1);
  }
  console.log(`[write-atomic] wrote ${target}`);
}
