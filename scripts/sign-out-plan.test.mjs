import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEPLOYED_SIGN_OUT_TIMEOUT_MS,
  PREVIEW_SIGN_OUT_TIMEOUT_MS,
  runPreSignInSignOut,
  runSignOut,
  settleWithin,
  signOutTimeoutMs,
} from "./sign-out-plan.mjs";

const TEST_TIMEOUT_MS = 20;

const hangs = () => new Promise(() => {});
const rejects = () => Promise.reject(new Error("network down"));

/**
 * Drain pending microtasks without advancing mocked time, so "has it finished
 * yet?" is answered by the mocked clock rather than by wall-clock luck.
 * `setImmediate` stays real — only `setTimeout` is mocked.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A `runSignOut` call with the browser effects replaced by recorders, so each
 * test asserts on what actually happened rather than on how it was written.
 */
function harness(overrides = {}) {
  /** @type {string[]} */
  const order = [];
  let requests = 0;
  const steps = {
    livePreview: false,
    hasBearer: true,
    requestSignOut: () => {
      requests += 1;
      return Promise.resolve();
    },
    clearToken: () => order.push("clear"),
    redirect: () => order.push("redirect"),
    timeoutMs: TEST_TIMEOUT_MS,
    ...overrides,
  };
  return {
    order,
    get requests() {
      return requests;
    },
    run: () => runSignOut(steps),
  };
}

/** Live preview: the bearer is the session, so the local clear always wins. */
const preview = (overrides = {}) => harness({ livePreview: true, ...overrides });

/** Deployed: only the server can clear the `__Host-` cookie. */
const deployed = (overrides = {}) => harness({ livePreview: false, ...overrides });

// ── Live preview ─────────────────────────────────────────────────────────────

test("preview: a successful sign-out clears the token, then redirects", async () => {
  const h = preview();
  await h.run();
  assert.equal(h.requests, 1);
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("preview: a rejected sign-out still clears the token and redirects", async () => {
  const h = preview({ requestSignOut: rejects });
  await h.run();
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("preview: a sign-out that throws synchronously still clears and redirects", async () => {
  const h = preview({
    requestSignOut: () => {
      throw new Error("no fetch");
    },
  });
  await h.run();
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("preview: a sign-out that never settles clears and redirects once the wait expires", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = preview({ requestSignOut: hangs });
  const done = h.run();

  t.mock.timers.tick(TEST_TIMEOUT_MS - 1);
  await flush();
  assert.deepEqual(h.order, [], "the server still has its window — do not give up early");

  t.mock.timers.tick(1);
  await done;
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("preview: no bearer means nothing to invalidate, so no request is made", async () => {
  const h = preview({ hasBearer: false });
  await h.run();
  assert.equal(h.requests, 0);
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("preview: a stored bearer is still invalidated server-side", async () => {
  const h = preview({ hasBearer: true });
  await h.run();
  assert.equal(h.requests, 1);
});

// ── Deployed ─────────────────────────────────────────────────────────────────
// JS cannot delete the HttpOnly `__Host-` cookie and `cookieCache` keeps
// serving the cached session, so an unconfirmed sign-out must NOT look like one.

test("deployed: a confirmed sign-out clears the token, then redirects", async () => {
  const h = deployed();
  await h.run();
  assert.deepEqual(h.order, ["clear", "redirect"]);
});

test("deployed: a sign-out that never settles throws and does NOT redirect", async () => {
  const h = deployed({ requestSignOut: hangs });
  await assert.rejects(h.run(), /still signed in/);
  assert.deepEqual(h.order, [], "no redirect may claim a sign-out the server never made");
});

test("deployed: a rejected sign-out throws and does NOT redirect", async () => {
  const h = deployed({ requestSignOut: rejects });
  await assert.rejects(h.run(), /still signed in/);
  assert.deepEqual(h.order, []);
});

test("deployed: the timeout is distinguishable from a rejection", async () => {
  await assert.rejects(deployed({ requestSignOut: hangs }).run(), /timed out/);
  await assert.rejects(deployed({ requestSignOut: rejects }).run(), /Sign-out failed/);
});

// ── Bounded wait (also used by `signIn`'s pre-sign-in session clear) ──────────

test("settleWithin reports the outcome and never rejects", async () => {
  assert.equal(await settleWithin(() => Promise.resolve(), TEST_TIMEOUT_MS), "ok");
  assert.equal(await settleWithin(rejects, TEST_TIMEOUT_MS), "failed");
  assert.equal(await settleWithin(hangs, TEST_TIMEOUT_MS), "timeout");
});

test("settleWithin waits its full window, then gives up rather than hanging", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let outcome = null;
  const done = settleWithin(hangs, TEST_TIMEOUT_MS).then((o) => (outcome = o));

  t.mock.timers.tick(TEST_TIMEOUT_MS - 1);
  await flush();
  assert.equal(outcome, null, "the request still has time left");

  t.mock.timers.tick(1);
  await done;
  assert.equal(outcome, "timeout", "the caller is never left waiting on a wedged request");
});

// ── Pre-sign-in session clear (`signIn`) ─────────────────────────────────────
// Same per-environment bound as sign-out, but best effort: it also runs when
// there is no prior session, so a failure must never block sign-in.

/** A pre-sign-in clear whose request never settles. */
function preSignIn(livePreview, overrides = {}) {
  let cleared = 0;
  const done = runPreSignInSignOut({
    livePreview,
    hasBearer: true,
    requestSignOut: hangs,
    clearToken: () => (cleared += 1),
    ...overrides,
  });
  return {
    done,
    get cleared() {
      return cleared;
    },
  };
}

test("pre-sign-in: the preview clear gives up at the preview bound", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = preSignIn(true);

  t.mock.timers.tick(PREVIEW_SIGN_OUT_TIMEOUT_MS - 1);
  await flush();
  assert.equal(h.cleared, 0);

  t.mock.timers.tick(1);
  await h.done;
  assert.equal(h.cleared, 1);
});

test("pre-sign-in: a deployed session gets the deployed window, not the preview one", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = preSignIn(false);

  t.mock.timers.tick(PREVIEW_SIGN_OUT_TIMEOUT_MS);
  await flush();
  assert.equal(
    h.cleared,
    0,
    "only the server can end a deployed session — do not start OAuth while it is still live",
  );

  t.mock.timers.tick(DEPLOYED_SIGN_OUT_TIMEOUT_MS - PREVIEW_SIGN_OUT_TIMEOUT_MS);
  await h.done;
  assert.equal(h.cleared, 1);
});

test("pre-sign-in: a failed clear never blocks sign-in", async () => {
  // Best effort by design: this also runs with no prior session to clear.
  await preSignIn(false, { requestSignOut: rejects, timeoutMs: TEST_TIMEOUT_MS }).done;
  await preSignIn(true, { requestSignOut: rejects, timeoutMs: TEST_TIMEOUT_MS }).done;
});

test("pre-sign-in: the preview skips the request when there is no bearer", async () => {
  let requests = 0;
  const h = preSignIn(true, {
    hasBearer: false,
    requestSignOut: () => {
      requests += 1;
      return hangs();
    },
  });
  await h.done;
  assert.equal(requests, 0);
  assert.equal(h.cleared, 1);
});

test("every sign-out bound comes from one rule", () => {
  assert.equal(signOutTimeoutMs(true), PREVIEW_SIGN_OUT_TIMEOUT_MS);
  assert.equal(signOutTimeoutMs(false), DEPLOYED_SIGN_OUT_TIMEOUT_MS);
});

test("the defaults are bounded, and deployed waits longer than preview", async (t) => {
  assert.ok(PREVIEW_SIGN_OUT_TIMEOUT_MS > 0 && PREVIEW_SIGN_OUT_TIMEOUT_MS <= 2000);
  assert.ok(DEPLOYED_SIGN_OUT_TIMEOUT_MS > PREVIEW_SIGN_OUT_TIMEOUT_MS);
  assert.ok(DEPLOYED_SIGN_OUT_TIMEOUT_MS <= 30_000);

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = preview({ requestSignOut: hangs, timeoutMs: undefined });
  const done = h.run();
  t.mock.timers.tick(PREVIEW_SIGN_OUT_TIMEOUT_MS);
  await done;
  assert.deepEqual(h.order, ["clear", "redirect"]);
});
