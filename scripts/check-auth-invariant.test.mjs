import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  authEnabledFromEnvValue,
  authInvariantWarnings,
  buildAuthEnabled,
  compareAuthInvariant,
  probeDevAuthEnabled,
} from "./check-auth-invariant.mjs";
import { projectRoot } from "./with-app-env.mjs";

/**
 * The JSON body `/__app-env` would serve. Do not start a real Vite server —
 * `import { createServer } from "vite"` loads rolldown native bindings that
 * SIGSEGV the test worker under qemu-user (amd64 image builds).
 */
function appEnvFetch(env) {
  return async () => ({
    ok: true,
    text: async () => JSON.stringify(env),
  });
}

test("the flag predicate matches src/lib/auth", () => {
  assert.equal(authEnabledFromEnvValue("false"), false);
  assert.equal(authEnabledFromEnvValue("true"), true);
  assert.equal(authEnabledFromEnvValue(undefined), true);
});

test("reads the value a live dev server resolved", async () => {
  assert.equal(
    await probeDevAuthEnabled("http://127.0.0.1:8080", appEnvFetch({ VITE_AUTH_ENABLED: "false" })),
    false,
  );
});

test("a server started without the flag reads as sign-in on", async () => {
  assert.equal(await probeDevAuthEnabled("http://127.0.0.1:8080", appEnvFetch({})), true);
});

test("agreement passes", () => {
  assert.equal(
    compareAuthInvariant({ devAuthEnabled: false, buildAuthEnabled: false }).status,
    "ok",
  );
});

test("divergence fails in either direction", () => {
  const devOn = compareAuthInvariant({ devAuthEnabled: true, buildAuthEnabled: false });
  assert.equal(devOn.status, "diverged");
  assert.match(devOn.message, /dev server has sign-in on but the next build has it off/);
  assert.equal(
    compareAuthInvariant({ devAuthEnabled: false, buildAuthEnabled: true }).status,
    "diverged",
  );
});

test("an unobservable dev server is indeterminate, not agreement", () => {
  assert.equal(
    compareAuthInvariant({ devAuthEnabled: null, buildAuthEnabled: false }).status,
    "indeterminate",
  );
});

test("a dev server that cannot be reached probes as null", async () => {
  const unreachable = () => Promise.reject(new Error("ECONNREFUSED"));
  assert.equal(await probeDevAuthEnabled("http://127.0.0.1:1", unreachable), null);
});

test("a server without the endpoint probes as null, not as agreement", async () => {
  const notFound = async () => ({ ok: false, text: async () => "Not Found" });
  assert.equal(await probeDevAuthEnabled("http://127.0.0.1:8081", notFound), null);
  const html = async () => ({ ok: true, text: async () => "<!doctype html>" });
  assert.equal(await probeDevAuthEnabled("http://127.0.0.1:8081", html), null);
});

test("only a divergence warns the smoke verdict", () => {
  const diverged = compareAuthInvariant({ devAuthEnabled: true, buildAuthEnabled: false });
  assert.deepEqual(authInvariantWarnings(diverged), [diverged.message]);
  for (const result of [
    compareAuthInvariant({ devAuthEnabled: false, buildAuthEnabled: false }),
    compareAuthInvariant({ devAuthEnabled: null, buildAuthEnabled: false }),
  ]) {
    assert.deepEqual(authInvariantWarnings(result), []);
  }
});

test("the build side resolves the template's shipped app-env", () => {
  assert.equal(buildAuthEnabled(projectRoot(), {}), false);
  assert.equal(buildAuthEnabled(projectRoot(), { VITE_AUTH_ENABLED: "true" }), true);
});

test("the CLI reports rather than silently passing when run via a symlink", async () => {
  // A check whose exit code is the whole signal must never no-op to 0 because
  // process.argv[1] came in through a symlinked path.
  const link = join(mkdtempSync(join(tmpdir(), "auth-invariant-link-")), "scripts");
  symlinkSync(join(projectRoot(), "scripts"), link);
  const error = await promisify(execFile)(process.execPath, [
    join(link, "check-auth-invariant.mjs"),
    "--dev-url",
    "http://127.0.0.1:1",
  ]).catch((err) => err);
  assert.equal(error.code, 2);
  assert.match(error.stderr, /could not read the dev server's resolved VITE_AUTH_ENABLED/);
});
