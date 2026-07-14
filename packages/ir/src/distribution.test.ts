import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DISTRIBUTION_TARGET_REGISTRY,
  normalizeDistribution,
  validateDistribution,
  validateDistributionProjectPaths,
  type IDistributionSource,
} from "./distribution.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";
import { validateBundle } from "./validate.js";

test("distribution should accept android webview and bevy targets when metadata is complete", () => {
  const source = makeDistribution({
    targets: [
      { capabilities: ["storage", "network", "storage"], formats: ["apk", "aab", "apk"], platform: "android", runtime: "webview" },
      { capabilities: ["gamepad", "storage"], formats: ["aab", "apk"], platform: "android", runtime: "bevy" },
    ],
  });

  assert.deepEqual(validateDistribution(source), []);
  assert.deepEqual(normalizeDistribution(source).targets, [
    { capabilities: ["network", "storage"], formats: ["aab", "apk"], platform: "android", runtime: "webview" },
    { capabilities: ["storage", "gamepad"], formats: ["aab", "apk"], platform: "android", runtime: "bevy" },
  ]);
});

test("distribution should reject unsupported runtime format combinations", () => {
  const source = makeDistribution({
    targets: [{ formats: ["dmg"], platform: "android", runtime: "bevy" }],
  });

  const diagnostics = validateDistribution(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_FORMAT_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "content/distribution.json/targets/0/formats/0");
  assert.deepEqual(diagnostics[0]?.fix?.allowed, ["aab", "apk"]);
  assert.match(diagnostics[0]?.message ?? "", /android\/bevy\/dmg/);
});

test("distribution should reject embedded signing secrets", () => {
  const source = {
    ...makeDistribution(),
    signing: {
      android: {
        credentialRef: "ci:android-upload",
        keystorePassword: "TN_SECRET_CANARY",
      },
    },
  };

  const diagnostics = validateDistribution(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_SIGNING_SECRET_FORBIDDEN");
  assert.equal(diagnostics[0]?.path, "content/distribution.json/signing/android/keystorePassword");
  assert.doesNotMatch(JSON.stringify(normalizeDistribution(source)), /TN_SECRET_CANARY/);
});

test("distribution should reject unsafe presentation asset paths", () => {
  const source = makeDistribution({ app: { icons: "../private/icons" } });

  const diagnostics = validateDistribution(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_PATH_UNSAFE");
  assert.equal(diagnostics[0]?.path, "content/distribution.json/app/icons");
});

test("distribution should reject secret-shaped fields and unknown signing providers anywhere in source", () => {
  const source = {
    ...makeDistribution(),
    apiKey: "TN_SECRET_CANARY",
    app: { ...makeDistribution().app, certificate: "TN_SECRET_CANARY" },
    signing: { custom: { credentialRef: "ci:custom" } },
    targets: [{ formats: ["static"], password: "TN_SECRET_CANARY", platform: "web", runtime: "web" }],
  };

  const diagnostics = validateDistribution(source);
  assert.deepEqual(diagnostics.map(({ code, path }) => ({ code, path })), [
    { code: "TN_IR_DISTRIBUTION_SIGNING_SECRET_FORBIDDEN", path: "content/distribution.json/apiKey" },
    { code: "TN_IR_DISTRIBUTION_SIGNING_SECRET_FORBIDDEN", path: "content/distribution.json/app/certificate" },
    { code: "TN_IR_DISTRIBUTION_SIGNING_SECRET_FORBIDDEN", path: "content/distribution.json/targets/0/password" },
    { code: "TN_IR_DISTRIBUTION_SIGNING_PROVIDER_UNSUPPORTED", path: "content/distribution.json/signing/custom" },
  ]);
  assert.doesNotMatch(JSON.stringify(normalizeDistribution(source)), /TN_SECRET_CANARY/);
});

test("distribution should reject presentation asset symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-distribution-root-"));
  const outside = await mkdtemp(join(tmpdir(), "tn-distribution-outside-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await symlink(outside, join(root, "assets", "distribution"));
    const source = makeDistribution({ app: { icons: "assets/distribution/icons" } });

    const diagnostics = await validateDistributionProjectPaths(source, root);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_PATH_SYMLINK_ESCAPE");
    assert.equal(diagnostics[0]?.path, "content/distribution.json/app/icons");
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("distribution should require a compatible existing target profile", () => {
  const source = makeDistribution({
    targets: [{ formats: ["aab"], platform: "android", runtime: "webview" }],
  });

  const diagnostics = validateDistribution(source, "content/distribution.json", { targets: ["web"] });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_TARGET_PROFILE_INCOMPATIBLE");
  assert.equal(diagnostics[0]?.path, "content/distribution.json/targets/0/platform");
  assert.deepEqual(diagnostics[0]?.fix?.allowed, ["web", "desktop"]);
});

test("distribution should reject universal architecture outside macos", () => {
  const source = makeDistribution({
    targets: [{ architecture: "universal", formats: ["nsis"], platform: "windows", runtime: "webview" }],
  });

  const diagnostics = validateDistribution(source);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "TN_IR_DISTRIBUTION_ARCHITECTURE_UNSUPPORTED");
  assert.deepEqual(diagnostics[0]?.fix?.allowed, ["x86_64", "arm64"]);
});

test("distribution registry should describe every required platform runtime family", () => {
  assert.deepEqual(
    DISTRIBUTION_TARGET_REGISTRY.map(({ platform, runtime }) => `${platform}/${runtime}`),
    [
      "web/web",
      "windows/bevy",
      "windows/webview",
      "macos/bevy",
      "macos/webview",
      "linux/bevy",
      "linux/webview",
      "android/bevy",
      "android/webview",
      "ios/bevy",
      "ios/webview",
    ],
  );
});

test("bundle validation should load and reject malformed distribution IR", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-distribution-bundle-"));
  try {
    await writeTestBundle(root, { manifest: { files: { distribution: "distribution.ir.json" } } });
    await writeJson(root, "distribution.ir.json", makeDistribution({
      targets: [{ formats: ["dmg"], platform: "android", runtime: "bevy" }],
    }));

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) =>
      diagnostic.code === "TN_IR_DISTRIBUTION_FORMAT_UNSUPPORTED" &&
      diagnostic.path === "distribution.ir.json/targets/0/formats/0"
    ), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeDistribution(
  overrides: {
    app?: Partial<IDistributionSource["app"]>;
    targets?: IDistributionSource["targets"];
  } = {},
): IDistributionSource {
  return {
    app: {
      buildNumber: 42,
      displayName: "Chess",
      icons: "assets/distribution/icons",
      id: "com.threenative.chess",
      privacyPolicyUrl: "https://example.com/privacy",
      version: "1.2.3",
      ...overrides.app,
    },
    schema: "threenative.distribution",
    targets: overrides.targets ?? [{ formats: ["static", "zip", "pwa"], platform: "web", runtime: "web" }],
    version: "0.1.0",
  };
}
