import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production hardening verifier should declare package preflight and native trace command", async () => {
  const source = await readFile(new URL("./verify-production-hardening.mjs", import.meta.url), "utf8");

  assert.match(source, /production-hardening/);
  assert.match(source, /threenative_production_hardening_trace/);
  assert.match(source, /tn package --preflight --target mobile/);
  assert.match(source, /TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED/);
});
