import type { IBundleManifest } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { IR_DOCUMENTS, IR_SCHEMA_IDS, IR_VERSION } from "./documents.js";
import { isRecord } from "./validationPrimitives.js";

export function validateManifest(manifest: unknown, path: string, diagnostics: IIrDiagnostic[]): manifest is IBundleManifest {
  if (!isRecord(manifest)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_INVALID",
      message: "Manifest must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate the bundle so manifest.json contains a threenative.bundle object.",
    });
    return false;
  }

  if (manifest.schema !== IR_SCHEMA_IDS.bundle || manifest.version !== IR_VERSION) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: `Manifest must use ${IR_SCHEMA_IDS.bundle} version ${IR_VERSION}.`,
      path,
    });
  }

  const entry = manifest.entry;
  if (!isRecord(entry)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_ENTRY_INVALID",
      message: "Manifest entry must be an object with a world document path.",
      path: `${path}/entry`,
      severity: "error",
      suggestion: `Regenerate the bundle or add entry.world: '${IR_DOCUMENTS.world.fileName}'.`,
    });
  } else if (entry.world !== IR_DOCUMENTS.world.fileName) {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: `V1 manifest entry.world must be ${IR_DOCUMENTS.world.fileName}.`,
      path: "manifest.json/entry/world",
    });
  }
  if (isRecord(entry) && entry.overlays !== undefined) {
    validateManifestPath(entry.overlays, `${path}/entry/overlays`, IR_DOCUMENTS.overlays.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.animations !== undefined) {
    validateManifestPath(entry.animations, `${path}/entry/animations`, IR_DOCUMENTS.animations.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.localData !== undefined) {
    validateManifestPath(entry.localData, `${path}/entry/localData`, IR_DOCUMENTS.localData.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.gameFlow !== undefined) {
    validateManifestPath(entry.gameFlow, `${path}/entry/gameFlow`, IR_DOCUMENTS.gameFlow.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.interactions !== undefined) {
    validateManifestPath(entry.interactions, `${path}/entry/interactions`, IR_DOCUMENTS.interactions.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.scenes !== undefined) {
    validateManifestPath(entry.scenes, `${path}/entry/scenes`, IR_DOCUMENTS.scenes.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.sequences !== undefined) {
    validateManifestPath(entry.sequences, `${path}/entry/sequences`, IR_DOCUMENTS.sequences.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.prefabs !== undefined) {
    validateManifestPath(entry.prefabs, `${path}/entry/prefabs`, IR_DOCUMENTS.prefabs.fileName, diagnostics);
  }

  const files = manifest.files;
  if (!isRecord(files)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_FILES_INVALID",
      message: "Manifest files must be an object with assets, materials, and targetProfile document paths.",
      path: `${path}/files`,
      severity: "error",
      suggestion: "Regenerate the bundle so manifest.json includes all required bundle file references.",
    });
  } else {
    validateManifestPath(files.assets, `${path}/files/assets`, IR_DOCUMENTS.assets.fileName, diagnostics);
    validateManifestPath(files.materials, `${path}/files/materials`, IR_DOCUMENTS.materials.fileName, diagnostics);
    validateManifestPath(files.targetProfile, `${path}/files/targetProfile`, IR_DOCUMENTS.targetProfile.fileName, diagnostics);
    for (const key of ["animations", "componentSchemas", "eventSchemas", "gltfScene", "input", "localData", "prefabs", "resourceSchemas", "runtimeConfig"] as const) {
      if (files[key] !== undefined) {
        validateManifestPath(files[key], `${path}/files/${key}`, undefined, diagnostics);
      }
    }
  }

  if (!isRecord(entry) || !isRecord(files)) {
    return false;
  }
  return (
    typeof entry.world === "string" &&
    typeof files.assets === "string" &&
    typeof files.materials === "string" &&
    typeof files.targetProfile === "string" &&
    (entry.audio === undefined || typeof entry.audio === "string") &&
    (entry.animations === undefined || typeof entry.animations === "string") &&
    (entry.environmentScene === undefined || typeof entry.environmentScene === "string") &&
    (entry.gameFlow === undefined || typeof entry.gameFlow === "string") &&
    (entry.interactions === undefined || typeof entry.interactions === "string") &&
    (entry.localData === undefined || typeof entry.localData === "string") &&
    (entry.scenes === undefined || typeof entry.scenes === "string") &&
    (entry.sequences === undefined || typeof entry.sequences === "string") &&
    (entry.systems === undefined || typeof entry.systems === "string") &&
    (entry.overlays === undefined || typeof entry.overlays === "string") &&
    (entry.prefabs === undefined || typeof entry.prefabs === "string") &&
    (entry.ui === undefined || typeof entry.ui === "string") &&
    (files.componentSchemas === undefined || typeof files.componentSchemas === "string") &&
    (files.animations === undefined || typeof files.animations === "string") &&
    (files.eventSchemas === undefined || typeof files.eventSchemas === "string") &&
    (files.gltfScene === undefined || typeof files.gltfScene === "string") &&
    (files.input === undefined || typeof files.input === "string") &&
    (files.localData === undefined || typeof files.localData === "string") &&
    (files.prefabs === undefined || typeof files.prefabs === "string") &&
    (files.resourceSchemas === undefined || typeof files.resourceSchemas === "string") &&
    (files.runtimeConfig === undefined || typeof files.runtimeConfig === "string")
  );
}

const v10BoundaryCapabilities: Array<{
  code: string;
  match: RegExp;
  message: string;
  suggestion: string;
}> = [
  {
    code: "TN_IR_NATIVE_AUTHORING_UNSUPPORTED",
    match: /(?:^|[.:/-])(?:bevy|native-authoring)(?:$|[.:/-])/i,
    message: "Direct Bevy/native authoring is outside the portable ThreeNative IR boundary.",
    suggestion: "Author behavior through the TypeScript SDK and emit portable ECS/IR declarations instead of Bevy-specific code.",
  },
  {
    code: "TN_IR_RAW_THREE_SOURCE_UNSUPPORTED",
    match: /(?:^|[.:/-])(?:three|raw-three|threejs)(?:$|[.:/-])/i,
    message: "Raw Three.js authoring cannot be the source of truth for a portable bundle.",
    suggestion: "Represent scene data through SDK objects, ECS declarations, and versioned IR consumed by both runtimes.",
  },
  {
    code: "TN_IR_CLOUD_STORAGE_UNSUPPORTED",
    match: /(?:cloud-save|cloud-storage|account-storage|account-bound|remote-save|user-account)/i,
    message: "Cloud save and account-bound storage are outside the current offline-first persistence contract.",
    suggestion: "Use declared local-data save slots and settings until a future PRD defines a portable account storage provider.",
  },
  {
    code: "TN_IR_AUDIO_DECODER_PLUGIN_UNSUPPORTED",
    match: /(?:audio-decoder|decoder-plugin|custom-decoder|decoder\.custom|codec\.custom)/i,
    message: "Executable or custom audio decoders are outside the portable audio contract.",
    suggestion: "Use bundle-local OGG or WAV audio assets and declared audio playback metadata.",
  },
  {
    code: "TN_IR_AUDIO_STREAMING_UNSUPPORTED",
    match: /(?:audio-stream|streaming-audio|audio\.stream|streaming-url)/i,
    message: "Streaming audio is outside the current portable audio contract.",
    suggestion: "Use bundle-local audio assets declared in audio.ir.json until a streaming audio PRD defines deterministic behavior.",
  },
  {
    code: "TN_IR_AUDIO_NETWORK_UNSUPPORTED",
    match: /(?:network-audio|audio-network|audio\.network|webrtc-audio)/i,
    message: "Network audio is outside the current portable audio contract.",
    suggestion: "Use bundle-local audio assets and deterministic audio events instead of network streams.",
  },
  {
    code: "TN_IR_RENDERER_PLUGIN_UNSUPPORTED",
    match: /(?:renderer-plugin|runtime-plugin|plugin-escape|render-phase|storage-buffer)/i,
    message: "Public renderer/runtime plugin escape hatches are not portable across web Three.js and native Bevy.",
    suggestion: "Use promoted SDK/IR extension points or wait for a PRD that defines a portable plugin contract.",
  },
  {
    code: "TN_IR_NETWORKING_UNSUPPORTED",
    match: /(?:network|websocket|replication|collaboration|online-service|cloud-save)/i,
    message: "Online services, networking, replication, and collaboration are outside the current portable runtime contract.",
    suggestion: "Keep data local or model synchronization as deterministic resources/events until a networking PRD defines a portable contract.",
  },
  {
    code: "TN_IR_BACKEND_ONLY_UNSUPPORTED",
    match: /(?:backend-only|server-only|server-rendered|matchmaking-server|authoritative-server)/i,
    message: "Backend-only features cannot be represented in a portable web/native runtime bundle.",
    suggestion: "Keep game behavior in portable resources, events, systems, and local data until a backend service PRD defines the contract.",
  },
  {
    code: "TN_IR_2D_WORKFLOW_UNSUPPORTED",
    match: /(?:sprite|tilemap|ldtk|tiled|2d-collision)/i,
    message: "2D-only authoring workflows are outside the current ThreeNative 3D product scope.",
    suggestion: "Use promoted 3D mesh, material, camera, and physics declarations, or wait for a dedicated 2D scope PRD.",
  },
  {
    code: "TN_IR_PLATFORM_API_UNSUPPORTED",
    match: /(?:npm|filesystem|worker|timer|platform-api|node-api)/i,
    message: "Arbitrary npm, filesystem, worker, timer, platform, and backend-only APIs cannot be represented in portable IR.",
    suggestion: "Use portable scripts with declared resources, events, services, target profiles, and bundle-local assets.",
  },
];

export function validateV10BoundaryCapabilities(manifest: IBundleManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(manifest.requiredCapabilities)) {
    diagnostics.push({
      code: "TN_IR_REQUIRED_CAPABILITIES_INVALID",
      message: "Manifest requiredCapabilities must be an object.",
      path,
      severity: "error",
      suggestion: "Regenerate the bundle so capability declarations are grouped by portable domain.",
    });
    return;
  }
  for (const [domain, values] of Object.entries(manifest.requiredCapabilities)) {
    const candidates = [domain, ...(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [])];
    for (const candidate of candidates) {
      const boundary = v10BoundaryCapabilities.find((item) => item.match.test(candidate));
      if (boundary === undefined) {
        continue;
      }
      diagnostics.push({
        code: boundary.code,
        message: boundary.message,
        path: `${path}/${domain}`,
        severity: "error",
        suggestion: boundary.suggestion,
        target: "portable-web-native",
        value: candidate,
      });
      break;
    }
  }
}

function validateManifestPath(value: unknown, path: string, expected: string | undefined, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_PATH_INVALID",
      message: "Manifest file references must be non-empty bundle-relative paths.",
      path,
      severity: "error",
      suggestion: expected === undefined ? "Regenerate the bundle or remove the optional manifest entry." : `Regenerate the bundle or set this path to '${expected}'.`,
    });
    return;
  }
  if (expected !== undefined && value !== expected) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_PATH_INVALID",
      message: `Manifest file reference must be ${expected}.`,
      path,
      severity: "error",
      suggestion: `Regenerate the bundle or set this path to '${expected}'.`,
    });
  }
}
