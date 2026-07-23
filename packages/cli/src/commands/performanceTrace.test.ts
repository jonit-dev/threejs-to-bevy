import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { performanceTraceCommand } from "./performanceTrace.js";

test("performance trace writes a gzipped DevTools trace artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-performance-trace-"));
  try {
    const trace = Buffer.from(JSON.stringify({ traceEvents: [{ name: "RunTask", ph: "X" }] }));
    const result = await performanceTraceCommand([
      "trace",
      "--project",
      root,
      "--url",
      "http://127.0.0.1:5173",
      "--seconds",
      "3",
      "--out",
      "artifacts/runtime.json.gz",
      "--json",
    ], process.cwd(), {
      collector: async (options) => {
        assert.deepEqual(options, {
          durationMs: 3_000,
          url: "http://127.0.0.1:5173",
        });
        return trace;
      },
    });
    const payload = JSON.parse(result.stdout) as {
      artifactPath: string;
      code: string;
      compressedBytes: number;
      durationSeconds: number;
      traceBytes: number;
      url: string;
    };
    const artifact = await readFile(join(root, "artifacts/runtime.json.gz"));

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(payload.code, "TN_PERFORMANCE_TRACE_OK");
    assert.equal(payload.artifactPath, join(root, "artifacts/runtime.json.gz"));
    assert.equal(payload.durationSeconds, 3);
    assert.equal(payload.traceBytes, trace.byteLength);
    assert.equal(payload.compressedBytes, artifact.byteLength);
    assert.equal(payload.url, "http://127.0.0.1:5173");
    assert.deepEqual(JSON.parse(gunzipSync(artifact).toString("utf8")), JSON.parse(trace.toString("utf8")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("performance trace rejects an invalid duration before launching a browser", async () => {
  let collectorCalled = false;
  const result = await performanceTraceCommand([
    "trace",
    "--url",
    "http://127.0.0.1:5173",
    "--seconds",
    "0",
    "--json",
  ], process.cwd(), {
    collector: async () => {
      collectorCalled = true;
      return Buffer.from("{}");
    },
  });
  const payload = JSON.parse(result.stdout) as { code: string; fix?: { instruction?: string } };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PERFORMANCE_TRACE_DURATION_INVALID");
  assert.match(payload.fix?.instruction ?? "", /1 and 30/);
  assert.equal(collectorCalled, false);
});

test("performance trace requires an explicit preview URL", async () => {
  const result = await performanceTraceCommand(["trace", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PERFORMANCE_TRACE_USAGE");
});
