import assert from "node:assert/strict";
import { test } from "node:test";
import {
  looksLikePreviewProcess,
  parseListenerInodes,
  parsePgid,
  parsePid,
  parsePreviewArgs,
  previewOwners,
  stopOutcome,
  terminatePids,
} from "./preview.mjs";

test("parsePreviewArgs accepts the two actions", () => {
  for (const action of ["stop", "restart"]) {
    assert.deepEqual(parsePreviewArgs([action]), { action });
  }
});

test("parsePreviewArgs rejects missing, unknown and extra arguments", () => {
  assert.match(parsePreviewArgs([]).error, /usage:/);
  assert.match(parsePreviewArgs(["reload"]).error, /unknown action: reload/);
  assert.match(parsePreviewArgs(["start"]).error, /unknown action: start/);
  assert.match(parsePreviewArgs(["restart", "--force"]).error, /unexpected argument: --force/);
});

test("parsePid reads a pidfile and rejects junk", () => {
  assert.equal(parsePid("4321\n"), 4321);
  assert.equal(parsePid("  99  "), 99);
  assert.equal(parsePid(""), null);
  assert.equal(parsePid("not-a-pid"), null);
  assert.equal(parsePid("-7"), null);
  // pid 1 is the sandbox init, never a preview server.
  assert.equal(parsePid("1"), null);
});

test("parsePgid reads the pgrp field past a comm containing spaces", () => {
  assert.equal(parsePgid("4321 (node) S 4300 4321 4321 0 -1 4194304 1234"), 4321);
  assert.equal(parsePgid("4321 (npm run preview) S 4300 4200 4200 0 -1 0 0"), 4200);
  assert.equal(parsePgid("4321 (weird ) name) S 4300 4200 4200 0"), 4200);
  assert.equal(parsePgid("garbage"), null);
  assert.equal(parsePgid(""), null);
  assert.equal(parsePgid(undefined), null);
});

// One /proc/net/tcp row; the socket inode is column 10.
const tcpRow = (sl, local, state, inode) =>
  [
    `  ${sl}:`,
    local,
    "00000000:0000",
    state,
    "00000000:00000000",
    "00:00000000",
    "00000000",
    "1000",
    "0",
    inode,
    "1",
    "0000",
    "100",
  ].join(" ");

const PROC_NET_TCP = [
  "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode",
  tcpRow(0, "0100007F:1F91", "0A", 5551),
  tcpRow(1, "0100007F:1F90", "0A", 5552),
  tcpRow(2, "0100007F:1F91", "01", 5553),
  "",
].join("\n");

test("parseListenerInodes picks LISTEN sockets on the wanted port only", () => {
  // 0x1F91 = 8081 (LISTEN), 0x1F90 = 8080, and the third row is ESTABLISHED.
  assert.deepEqual(parseListenerInodes(PROC_NET_TCP, 8081), ["5551"]);
  assert.deepEqual(parseListenerInodes(PROC_NET_TCP, 8080), ["5552"]);
  assert.deepEqual(parseListenerInodes(PROC_NET_TCP, 9999), []);
  assert.deepEqual(parseListenerInodes("", 8081), []);
  assert.deepEqual(parseListenerInodes(undefined, 8081), []);
});

test("parseListenerInodes reads the tcp6 dump the same way", () => {
  const v6 = "00000000000000000000000000000000:1F91";
  assert.deepEqual(parseListenerInodes(tcpRow(0, v6, "0A", 7777), 8081), ["7777"]);
});

// /proc/<pid>/cmdline is NUL-separated.
const cmdline = (...argv) => argv.join("\u0000");

test("looksLikePreviewProcess matches the npm wrapper and its vite child", () => {
  const npmRun = cmdline("node", "/usr/lib/node_modules/npm/bin/npm-cli.js", "run", "preview");
  assert.equal(looksLikePreviewProcess(npmRun), true);
  assert.equal(looksLikePreviewProcess(cmdline("npm", "run", "preview")), true);
  assert.equal(
    looksLikePreviewProcess(cmdline("node", "/ws/node_modules/.bin/vite", "preview")),
    true,
  );
  // `ps -o command=` output is space-separated.
  assert.equal(looksLikePreviewProcess("node /ws/node_modules/.bin/vite preview"), true);
});

test("looksLikePreviewProcess spares the sibling scripts and re-used pids", () => {
  // The sandbox service runs this one in the same box (CapturePreviewThumbnail).
  const thumbnail = cmdline(
    "node",
    "/opt/app-template/scripts/preview-thumbnail.mjs",
    "http://127.0.0.1:8080/",
    "/tmp/preview-thumbnail.png",
  );
  assert.equal(looksLikePreviewProcess(thumbnail), false);
  assert.equal(looksLikePreviewProcess(cmdline("node", "scripts/preview.mjs", "stop")), false);
  // This tooling's own npm wrappers, which carry no `.mjs` in their cmdline.
  const npmCli = "/usr/lib/node_modules/npm/bin/npm-cli.js";
  assert.equal(looksLikePreviewProcess(cmdline("node", npmCli, "run", "preview:stop")), false);
  assert.equal(looksLikePreviewProcess(cmdline("node", npmCli, "run", "preview:restart")), false);
  assert.equal(looksLikePreviewProcess(cmdline("npm", "run", "preview:stop")), false);
  const viteBuild = cmdline("vite", "build", "--outDir", "preview-dist");
  assert.equal(looksLikePreviewProcess(viteBuild), false);
  assert.equal(looksLikePreviewProcess(cmdline("/usr/bin/preview-tool", "--x")), false);
  assert.equal(looksLikePreviewProcess(cmdline("sleep", "300")), false);
  assert.equal(looksLikePreviewProcess(cmdline("node", "server.mjs")), false);
  assert.equal(looksLikePreviewProcess(""), false);
});

test("previewOwners trusts port owners and dedupes the pidfile pid", () => {
  const owners = previewOwners({
    portPids: [50, 51],
    pidFilePid: 50,
    cmdlineOf: () => assert.fail("a port owner needs no corroboration"),
  });
  assert.deepEqual(owners, [50, 51]);
});

test("previewOwners adds a pidfile pid whose command line is still the preview", () => {
  const owners = previewOwners({
    portPids: [51],
    pidFilePid: 50,
    cmdlineOf: (pid) => (pid === 50 ? cmdline("node", "npm-cli.js", "run", "preview") : ""),
  });
  assert.deepEqual(owners, [51, 50]);
});

test("previewOwners drops a stale pidfile pid re-used by another process", () => {
  const owners = previewOwners({
    portPids: [],
    pidFilePid: 50,
    cmdlineOf: () => cmdline("sleep", "300"),
  });
  assert.deepEqual(owners, []);
});

test("previewOwners drops a pidfile pid that no longer exists", () => {
  const owners = previewOwners({ portPids: [], pidFilePid: 50, cmdlineOf: () => "" });
  assert.deepEqual(owners, []);
});

test("previewOwners on a free port with no pidfile signals nothing", () => {
  const owners = previewOwners({ portPids: [], pidFilePid: null, cmdlineOf: () => "" });
  assert.deepEqual(owners, []);
});

test("stopOutcome fails when a pid survives or the port is still held", () => {
  const stubbornOnly = stopOutcome({
    signalled: [50],
    stubborn: [50],
    after: { pids: [] },
  });
  assert.equal(stubbornOnly.ok, false);
  assert.match(stubbornOnly.error, /still held by pid\(s\) 50/);

  const newOwner = stopOutcome({
    signalled: [50],
    stubborn: [],
    after: { pids: [77] },
  });
  assert.equal(newOwner.ok, false);
  assert.match(newOwner.error, /still held by pid\(s\) 77/);
});

test("stopOutcome reports a verified free port", () => {
  const stopped = stopOutcome({
    signalled: [50],
    stubborn: [],
    after: { pids: [] },
  });
  assert.equal(stopped.ok, true);
  assert.match(stopped.message, /stopped pid\(s\) 50 — port 8081 is free/);

  const idle = stopOutcome({ signalled: [], stubborn: [], after: { pids: [] } });
  assert.equal(idle.ok, true);
  assert.match(idle.message, /nothing was listening on 8081/);
});

test("stopOutcome fails on a listener whose owner cannot be attributed", () => {
  const outcome = stopOutcome({
    signalled: [],
    stubborn: [],
    after: { pids: [], unattributed: true },
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /port 8081 is held by a process this script cannot see/);
});

function fakeProcesses({ pids, ignoresTerm = [] }) {
  const alive = new Set(pids);
  const signals = [];
  return {
    signals,
    isAlive: (pid) => alive.has(pid),
    kill: (pid, signal) => {
      signals.push([pid, signal]);
      if (signal === "SIGKILL" || !ignoresTerm.includes(pid)) alive.delete(pid);
    },
    sleep: async () => {},
  };
}

test("terminatePids SIGTERMs live pids and skips dead ones", async () => {
  const fake = fakeProcesses({ pids: [11, 12] });
  const result = await terminatePids([11, 12, 13], fake);
  assert.deepEqual(result, { signalled: [11, 12], killed: [], stubborn: [] });
  assert.deepEqual(fake.signals, [
    [11, "SIGTERM"],
    [12, "SIGTERM"],
  ]);
});

test("terminatePids escalates to SIGKILL when SIGTERM is ignored", async () => {
  const fake = fakeProcesses({ pids: [11, 12], ignoresTerm: [12] });
  const result = await terminatePids([11, 12], fake);
  assert.deepEqual(result, { signalled: [11, 12], killed: [12], stubborn: [] });
  assert.deepEqual(fake.signals, [
    [11, "SIGTERM"],
    [12, "SIGTERM"],
    [12, "SIGKILL"],
  ]);
});

test("terminatePids reports a pid that survives SIGKILL as stubborn", async () => {
  const signals = [];
  const result = await terminatePids([11], {
    isAlive: () => true,
    kill: (pid, signal) => signals.push([pid, signal]),
    sleep: async () => {},
  });
  assert.deepEqual(result, { signalled: [11], killed: [11], stubborn: [11] });
  assert.deepEqual(signals, [
    [11, "SIGTERM"],
    [11, "SIGKILL"],
  ]);
});

test("terminatePids on a free port signals nothing", async () => {
  const fake = fakeProcesses({ pids: [] });
  const result = await terminatePids([], fake);
  assert.deepEqual(result, { signalled: [], killed: [], stubborn: [] });
  assert.deepEqual(fake.signals, []);
});
