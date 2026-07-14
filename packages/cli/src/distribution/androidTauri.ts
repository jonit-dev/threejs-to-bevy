import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDistribution, validateDistribution, type DistributionCapability, type IDistributionSource } from "@threenative/ir";

import { assertCredentialCanariesAbsent, redactCredentialCanaries, type ICredentialHandle } from "./signing.js";

const ANDROID_PERMISSION_POLICY = {
  camera: ["android.permission.CAMERA"],
  gamepad: [],
  microphone: ["android.permission.RECORD_AUDIO"],
  network: ["android.permission.ACCESS_NETWORK_STATE", "android.permission.INTERNET"],
  storage: [],
  vibration: ["android.permission.VIBRATE"],
} as const satisfies Record<DistributionCapability, readonly string[]>;

interface IAndroidDefaults {
  cleartextTraffic: false;
  compileSdk: number;
  minSdk: number;
  orientation: "landscape" | "portrait" | "unspecified";
  schema: "threenative.tauri-android-defaults";
  targetSdk: number;
  version: "0.1.0";
}

export interface IAndroidTauriConfig {
  appId: string;
  buildNumber: number;
  displayName: string;
  orientation: IAndroidDefaults["orientation"];
  permissions: string[];
  sdk: { compile: number; minimum: number; target: number };
  version: string;
}

export interface IAndroidTauriReport {
  architecture: "x86_64" | "arm64";
  artifact: { bytes: number; path: string; sha256: string };
  code: "TN_PACKAGE_ANDROID_TAURI_OK";
  config: IAndroidTauriConfig;
  format: "aab" | "apk";
  platform: "android";
  runtime: "webview";
  schema: "threenative.package-report";
  signing: { credentialRef?: string; status: "signed" | "unsigned"; verification?: "apksigner" | "jarsigner" };
  sourceHash: string;
  toolchain: { gradle: "tauri-generated"; ndk: "27.0.12077973"; tauriCli: "2.11.4" };
  version: "0.1.0";
}

export async function deriveAndroidTauriConfig(distributionSource: IDistributionSource): Promise<IAndroidTauriConfig> {
  const diagnostics = validateDistribution(distributionSource);
  if (diagnostics.length > 0) throw new Error(`TN_PACKAGE_DISTRIBUTION_INVALID: ${diagnostics[0]?.message ?? "invalid distribution"}`);
  const distribution = normalizeDistribution(distributionSource);
  const target = distribution.targets.find(({ platform, runtime }) => platform === "android" && runtime === "webview");
  if (target === undefined) throw new Error("TN_ANDROID_TAURI_TARGET_UNDECLARED: Android webview target is not declared.");
  const defaults = await readAndroidDefaults();
  const permissions = [...new Set((target.capabilities ?? []).flatMap((capability) => ANDROID_PERMISSION_POLICY[capability]))].sort();
  return {
    appId: distribution.app.id,
    buildNumber: distribution.app.buildNumber,
    displayName: distribution.app.displayName,
    orientation: defaults.orientation,
    permissions,
    sdk: { compile: defaults.compileSdk, minimum: defaults.minSdk, target: defaults.targetSdk },
    version: distribution.app.version,
  };
}

export async function prepareAndroidTauriProject(options: {
  commandRunner?: AndroidCommandRunner;
  distribution: IDistributionSource;
  env: NodeJS.ProcessEnv;
  shellPath: string;
  tauriCliPath: string;
}): Promise<IAndroidTauriConfig> {
  const config = await deriveAndroidTauriConfig(options.distribution);
  const commandRunner = options.commandRunner ?? runAndroidCommand;
  await commandRunner(options.tauriCliPath, ["android", "init", "--ci", "--skip-targets-install"], { cwd: options.shellPath, env: options.env });
  await writeFile(resolve(options.shellPath, "tauri.android.conf.json"), `${JSON.stringify({
    bundle: { android: { minSdkVersion: config.sdk.minimum, versionCode: config.buildNumber } },
  }, null, 2)}\n`);
  await assertGeneratedAndroidSdk(options.shellPath, config);
  const manifestPath = resolve(options.shellPath, "gen/android/app/src/main/AndroidManifest.xml");
  await writeFile(manifestPath, renderAndroidManifest(config));
  await writeCompatibleMainActivity(options.shellPath, config.appId);
  return config;
}

async function writeCompatibleMainActivity(shellPath: string, appId: string): Promise<void> {
  const packagePath = appId.split(".").join("/");
  const sourceRoot = resolve(shellPath, "gen/android/app/src/main/java", packagePath);
  await mkdir(resolve(sourceRoot, "generated"), { recursive: true });
  await Promise.all([
    writeFile(resolve(sourceRoot, "MainActivity.kt"), `package ${appId}\n\nclass MainActivity : TauriActivity()\n`),
    writeFile(resolve(sourceRoot, "generated/TauriActivity.kt"), renderTauriActivity(appId)),
  ]);
}

function renderTauriActivity(appId: string): string {
  return `// SPDX-License-Identifier: Apache-2.0 OR MIT
package ${appId}

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import app.tauri.plugin.PluginManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

object TauriLifecycleObserver : DefaultLifecycleObserver {
  override fun onResume(owner: LifecycleOwner) { super.onResume(owner); PluginManager.onResume() }
  override fun onPause(owner: LifecycleOwner) { super.onPause(owner); PluginManager.onPause() }
  override fun onStop(owner: LifecycleOwner) { super.onStop(owner); PluginManager.onStop() }
}

abstract class TauriActivity : WryActivity() {
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    PluginManager.onActivityCreate(this)
  }

  fun getPluginManager(): PluginManager = PluginManager
  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); PluginManager.onNewIntent(intent) }
  override fun onRestart() { super.onRestart(); PluginManager.onRestart(this) }
  override fun onDestroy() { super.onDestroy(); PluginManager.onDestroy(this) }
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    PluginManager.onConfigurationChanged(newConfig)
  }
}
`;
}

async function assertGeneratedAndroidSdk(shellPath: string, config: IAndroidTauriConfig): Promise<void> {
  const gradle = await readFile(resolve(shellPath, "gen/android/app/build.gradle.kts"), "utf8");
  for (const [field, value] of [["compileSdk", config.sdk.compile], ["minSdk", config.sdk.minimum], ["targetSdk", config.sdk.target]] as const) {
    if (!new RegExp(`\\b${field}\\s*=\\s*${value}\\b`).test(gradle)) {
      throw new Error(`TN_PACKAGE_ANDROID_SDK_DRIFT: Generated Android ${field} does not match pinned value ${value}.`);
    }
  }
}

export async function buildAndroidTauriDistribution(options: {
  architecture: "x86_64" | "arm64";
  commandRunner?: AndroidCommandRunner;
  credential?: ICredentialHandle;
  distribution: IDistributionSource;
  env: NodeJS.ProcessEnv;
  format: "aab" | "apk";
  outputPath: string;
  shellPath: string;
  tauriCliPath: string;
}): Promise<IAndroidTauriReport> {
  const config = await prepareAndroidTauriProject(options);
  if (options.format === "aab" && options.credential === undefined) {
    throw new Error("TN_PACKAGE_CREDENTIAL_REQUIRED: Android AAB release requires an explicit credential provider handle.");
  }
  let signingState: Awaited<ReturnType<typeof writeAndroidSigningFiles>> | undefined;
  try {
    const releaseCredential = options.format === "aab" ? options.credential : undefined;
    signingState = releaseCredential === undefined
      ? undefined
      : await writeAndroidSigningFiles(options.shellPath, releaseCredential);
    const credentials = releaseCredential === undefined
      ? []
      : [releaseCredential, ...(signingState?.secretCanaries ?? []).map((value) => ({ reference: releaseCredential.reference, value }))];
    const target = options.architecture === "arm64" ? "aarch64" : "x86_64";
    const args = ["android", "build", "--ci", "--target", target, options.format === "apk" ? "--apk" : "--aab"];
    if (options.format === "apk") args.push("--debug");
    await (options.commandRunner ?? runAndroidCommand)(options.tauriCliPath, args, { cwd: options.shellPath, env: options.env, sensitiveCredentials: credentials });
    const generated = await findAndroidArtifact(resolve(options.shellPath, "gen/android/app/build/outputs"), options.format);
    if (options.format === "aab") {
      await (options.commandRunner ?? runAndroidCommand)("jarsigner", ["-verify", generated], { cwd: options.shellPath, env: options.env, sensitiveCredentials: credentials });
    } else {
      await (options.commandRunner ?? runAndroidCommand)(await resolveApkSigner(options.env), ["verify", generated], { cwd: options.shellPath, env: options.env, sensitiveCredentials: [] });
    }
    await rm(options.outputPath, { force: true, recursive: true });
    await mkdir(options.outputPath, { recursive: true });
    const artifactPath = resolve(options.outputPath, `${artifactStem(config.displayName)}_${config.version}_${options.architecture}.${options.format}`);
    await cp(generated, artifactPath);
    const report: IAndroidTauriReport = {
      architecture: options.architecture,
      artifact: { bytes: (await stat(artifactPath)).size, path: basename(artifactPath), sha256: await sha256File(artifactPath) },
      code: "TN_PACKAGE_ANDROID_TAURI_OK",
      config,
      format: options.format,
      platform: "android",
      runtime: "webview",
      schema: "threenative.package-report",
      signing: {
        ...(options.format === "aab" ? { credentialRef: releaseCredential!.reference, verification: "jarsigner" as const } : { verification: "apksigner" as const }),
        status: "signed",
      },
      sourceHash: createHash("sha256").update(JSON.stringify(normalizeDistribution(options.distribution))).digest("hex"),
      toolchain: { gradle: "tauri-generated", ndk: "27.0.12077973", tauriCli: "2.11.4" },
      version: "0.1.0",
    };
    const serialized = `${JSON.stringify(redactCredentialCanaries(report, credentials), null, 2)}\n`;
    assertCredentialCanariesAbsent([serialized, await readFile(artifactPath)], credentials);
    await writeFile(resolve(options.outputPath, "package-report.json"), serialized);
    return report;
  } finally {
    if (signingState !== undefined) {
      await Promise.all(signingState.files.map((path) => rm(path, { force: true })));
      await writeFile(signingState.gradlePath, signingState.originalGradle);
    }
  }
}

async function resolveApkSigner(env: NodeJS.ProcessEnv): Promise<string> {
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.HOME === undefined ? undefined : resolve(env.HOME, "Android/Sdk")]
    .filter((value): value is string => value !== undefined);
  for (const root of roots) {
    try {
      const versions = (await readdir(resolve(root, "build-tools"))).sort().reverse();
      for (const version of versions) {
        const candidate = resolve(root, "build-tools", version, process.platform === "win32" ? "apksigner.bat" : "apksigner");
        try {
          if ((await stat(candidate)).isFile()) return candidate;
        } catch {
          // Continue through installed build-tools versions.
        }
      }
    } catch {
      // Fall back to PATH when this SDK root is unavailable.
    }
  }
  return "apksigner";
}

async function writeAndroidSigningFiles(shellPath: string, credential: ICredentialHandle): Promise<{
  files: string[];
  gradlePath: string;
  originalGradle: string;
  secretCanaries: string[];
}> {
  let secret: { keyAlias?: string; keyPassword?: string; storeFile?: string; storePassword?: string };
  try {
    secret = JSON.parse(credential.value) as typeof secret;
  } catch {
    throw new Error("TN_PACKAGE_ANDROID_CREDENTIAL_INVALID: Android credential value must be provider-supplied signing JSON.");
  }
  for (const key of ["keyAlias", "keyPassword", "storeFile", "storePassword"] as const) {
    if (typeof secret[key] !== "string" || secret[key] === "") throw new Error(`TN_PACKAGE_ANDROID_CREDENTIAL_INVALID: Missing '${key}'.`);
  }
  const signing = secret as Required<typeof secret>;
  const androidRoot = resolve(shellPath, "gen/android");
  const propertiesPath = resolve(androidRoot, "keystore.properties");
  const scriptPath = resolve(androidRoot, "app/signing.gradle.kts");
  const gradlePath = resolve(androidRoot, "app/build.gradle.kts");
  const originalGradle = await readFile(gradlePath, "utf8");
  try {
    await writeFile(propertiesPath, `keyAlias=${escapeJavaProperty(signing.keyAlias)}\nkeyPassword=${escapeJavaProperty(signing.keyPassword)}\nstoreFile=${escapeJavaProperty(signing.storeFile)}\nstorePassword=${escapeJavaProperty(signing.storePassword)}\n`, { mode: 0o600 });
    await chmod(propertiesPath, 0o600);
    await writeFile(scriptPath, `import com.android.build.api.dsl.ApplicationExtension\nimport java.io.FileInputStream\nimport java.util.Properties\n\nextensions.configure<ApplicationExtension> {\n  val signingValues = Properties().apply { load(FileInputStream(rootProject.file("keystore.properties"))) }\n  signingConfigs.create("threenativeRelease") {\n    keyAlias = signingValues["keyAlias"] as String\n    keyPassword = signingValues["keyPassword"] as String\n    storeFile = file(signingValues["storeFile"] as String)\n    storePassword = signingValues["storePassword"] as String\n  }\n  buildTypes.getByName("release").signingConfig = signingConfigs.getByName("threenativeRelease")\n}\n`);
    if (!originalGradle.includes("signing.gradle.kts")) await writeFile(gradlePath, `${originalGradle.trimEnd()}\n\napply(from = "signing.gradle.kts")\n`);
  } catch (error) {
    await Promise.all([rm(propertiesPath, { force: true }), rm(scriptPath, { force: true })]);
    await writeFile(gradlePath, originalGradle);
    throw error;
  }
  return { files: [propertiesPath, scriptPath], gradlePath, originalGradle, secretCanaries: [signing.keyPassword, signing.storePassword] };
}

function escapeJavaProperty(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

function renderAndroidManifest(config: IAndroidTauriConfig): string {
  const permissions = config.permissions.map((permission) => `    <uses-permission android:name="${permission}" />`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n${permissions === "" ? "" : `${permissions}\n`}    <uses-feature android:name="android.software.leanback" android:required="false" />\n    <application android:icon="@mipmap/ic_launcher" android:label="@string/app_name" android:theme="@style/Theme.threenative_generated_shell" android:usesCleartextTraffic="false">\n        <activity android:configChanges="orientation|keyboardHidden|keyboard|locale|uiMode" android:launchMode="singleTask" android:label="@string/main_activity_title" android:name=".MainActivity" android:screenOrientation="${config.orientation}" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />\n            </intent-filter>\n        </activity>\n        <provider android:name="androidx.core.content.FileProvider" android:authorities="\${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true">\n            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />\n        </provider>\n    </application>\n</manifest>\n`;
}

async function readAndroidDefaults(): Promise<IAndroidDefaults> {
  const path = fileURLToPath(new URL("../../templates/tauri/mobile/android.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as IAndroidDefaults;
}

async function findAndroidArtifact(root: string, extension: "aab" | "apk"): Promise<string> {
  const matches = await findFiles(root, `.${extension}`);
  const preferred = matches.find((path) => extension === "apk" ? path.includes("debug") : path.includes("release")) ?? matches[0];
  if (preferred === undefined) throw new Error(`TN_PACKAGE_ANDROID_ARTIFACT_MISSING: Tauri did not produce a .${extension} artifact.`);
  return preferred;
}

async function findFiles(root: string, suffix: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? findFiles(path, suffix) : Promise.resolve(path.endsWith(suffix) ? [path] : []);
  }));
  return nested.flat().sort();
}

function artifactStem(displayName: string): string {
  return displayName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ThreeNative-Game";
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export type AndroidCommandRunner = (command: string, args: readonly string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  sensitiveCredentials?: readonly ICredentialHandle[];
}) => Promise<void>;

async function runAndroidCommand(command: string, args: readonly string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  sensitiveCredentials?: readonly ICredentialHandle[];
}): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const executable = command.includes("/") || command.includes("\\") ? resolve(command) : command;
    const commandDirectory = dirname(resolve(executable));
    const path = options.env.PATH ?? process.env.PATH ?? "";
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: { ...options.env, PATH: `${commandDirectory}${delimiter}${path}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      const stdoutBuffer = Buffer.concat(stdout);
      const stderrBuffer = Buffer.concat(stderr);
      try {
        assertCredentialCanariesAbsent([stdoutBuffer, stderrBuffer], options.sensitiveCredentials ?? []);
      } catch (error) {
        reject(error);
        return;
      }
      process.stdout.write(stdoutBuffer);
      process.stderr.write(stderrBuffer);
      if (code === 0) resolvePromise();
      else reject(new Error(`TN_PACKAGE_TOOL_FAILED: '${command}' exited with ${code}.`));
    });
  });
}
