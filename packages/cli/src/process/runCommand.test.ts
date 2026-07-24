import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runOwnedCommand } from "./runCommand.js";

test("owned command preserves output and exit behavior", async () => {
  const result = await runOwnedCommand(process.execPath, ["-e", "process.stdout.write('ok');"], {
    cwd: process.cwd(),
    timeoutMs: 5_000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.timedOut, false);
});

test("owned command rejects startup failure and unregisters signal ownership", async () => {
  let registered = false;
  let unregistered = false;

  await assert.rejects(
    runOwnedCommand("tn-command-that-does-not-exist", [], {
      cwd: process.cwd(),
      registerSignals() {
        registered = true;
        return () => { unregistered = true; };
      },
      timeoutMs: 5_000,
    }),
    /ENOENT/u,
  );

  assert.equal(registered, true);
  assert.equal(unregistered, true);
});

test("owned command terminates its process group on interruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-owned-command-signal-"));
  const lateMarker = join(root, "late-marker");
  let interrupt: ((signal: NodeJS.Signals) => void) | undefined;
  try {
    const script = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(lateMarker)}, 'late'), 400)`)}], { stdio: 'ignore' });`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const running = runOwnedCommand(process.execPath, ["-e", script], {
      cwd: root,
      registerSignals(handler) {
        interrupt = handler;
        return () => { interrupt = undefined; };
      },
      timeoutMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    interrupt?.("SIGTERM");
    const result = await running;
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(result.interruptedBy, "SIGTERM");
    assert.notEqual(result.exitCode, 0);
    await assert.rejects(access(lateMarker), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("owned command kills resistant descendants after the group leader exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-owned-command-resistant-"));
  const lateMarker = join(root, "late-marker");
  let interrupt: ((signal: NodeJS.Signals) => void) | undefined;
  try {
    const descendant = [
      "process.on('SIGTERM', () => {});",
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(lateMarker)}, 'late'), 400);`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const leader = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const running = runOwnedCommand(process.execPath, ["-e", leader], {
      cwd: root,
      registerSignals(handler) {
        interrupt = handler;
        return () => { interrupt = undefined; };
      },
      timeoutMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    interrupt?.("SIGINT");
    const result = await running;
    await new Promise((resolve) => setTimeout(resolve, 450));

    assert.equal(result.interruptedBy, "SIGINT");
    await assert.rejects(access(lateMarker), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("owned command drains descendants after a successful group leader", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-owned-command-success-tree-"));
  const lateMarker = join(root, "late-marker");
  try {
    const descendant = [
      "process.on('SIGTERM', () => {});",
      `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(lateMarker)}, 'late'), 400);`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const leader = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' }).unref();`,
    ].join("");
    const result = await runOwnedCommand(process.execPath, ["-e", leader], {
      cwd: root,
      timeoutMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 450));

    assert.equal(result.exitCode, 0);
    await assert.rejects(access(lateMarker), /ENOENT/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("owned command releases descendant listener ports on success", async () => {
  const port = await reservePort();
  const descendant = [
    "const net = require('node:net');",
    "process.on('SIGTERM', () => {});",
    `net.createServer(() => {}).listen(${port}, '127.0.0.1');`,
    "setInterval(() => {}, 1000);",
  ].join("");
  const leader = [
    "const { spawn } = require('node:child_process');",
    `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' }).unref();`,
    "setTimeout(() => {}, 150);",
  ].join("");

  const result = await runOwnedCommand(process.execPath, ["-e", leader], {
    cwd: process.cwd(),
    timeoutMs: 5_000,
  });

  assert.equal(result.exitCode, 0);
  await assert.rejects(connectToPort(port), /ECONNREFUSED|ECONNRESET/u);
});

test("owned command bounds timeout and reports it as interruption", async () => {
  const result = await runOwnedCommand(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    cwd: process.cwd(),
    timeoutMs: 50,
  });

  assert.equal(result.timedOut, true);
  assert.equal(result.interruptedBy, "SIGTERM");
  assert.notEqual(result.exitCode, 0);
});

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return port;
}

async function connectToPort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", reject);
  });
}
