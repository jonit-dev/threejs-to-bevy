import type { ICompilerDiagnostic } from "../diagnostics.js";
import { SCRIPT_STDLIB_BUNDLE_SOURCE } from "@threenative/script-stdlib";
import { diagnosePortableSystem } from "./diagnostics.js";

const RACING_KIT_BUNDLE_SOURCE = String.raw`
const Track2D = Object.freeze({
  loop(options) {
    const points = normalizeRacingKitPoints(options.points);
    const width = racingKitFinite(options.width, 1);
    const definition = Object.freeze({ points, width });
    return Object.freeze({
      points: definition.points,
      width: definition.width,
      contains2d(position) {
        return Track2D.contains2d(definition, position);
      },
      pointAtPhase(phase) {
        return Track2D.pointAtPhase(definition, phase);
      },
    });
  },
  contains2d(track, position) {
    const points = normalizeRacingKitPoints(track.points);
    if (points.length === 0) {
      return false;
    }
    const width = Math.max(0, racingKitFinite(track.width, 0));
    const pos = racingKitVec3(position);
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      nearest = Math.min(nearest, racingKitDistanceToSegment2d(pos, points[index], points[(index + 1) % points.length]));
    }
    return nearest <= width / 2;
  },
  pointAtPhase(track, phase) {
    const points = normalizeRacingKitPoints(track.points);
    if (points.length === 0) {
      return [0, 0, 0];
    }
    if (points.length === 1) {
      return points[0];
    }
    const segmentLengths = points.map((point, index) => racingKitDistance2d(point, points[(index + 1) % points.length]));
    const total = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (total <= 1e-9) {
      return points[0];
    }
    let targetDistance = (((racingKitFinite(phase, 0) % 1) + 1) % 1) * total;
    for (let index = 0; index < points.length; index += 1) {
      const length = segmentLengths[index];
      if (targetDistance <= length || index === points.length - 1) {
        return racingKitLerp(points[index], points[(index + 1) % points.length], length <= 1e-9 ? 0 : targetDistance / length);
      }
      targetDistance -= length;
    }
    return points[0];
  },
});
const CheckpointRace = Object.freeze({
  advance(state, position, checkpoints, options = {}) {
    const points = normalizeRacingKitPoints(checkpoints);
    if (points.length === 0) {
      return { checkpoint: 0, completed: false, lap: Math.max(0, Math.trunc(racingKitFinite(state.lap, 0))), message: "No checkpoints" };
    }
    const checkpoint = Math.min(Math.max(Math.trunc(racingKitFinite(state.checkpoint, 0)), 0), points.length - 1);
    const lap = Math.max(0, Math.trunc(racingKitFinite(state.lap, 0)));
    const radius = Math.max(0, racingKitFinite(options.radius, 1));
    const reached = racingKitDistance2d(racingKitVec3(position), points[checkpoint]) <= radius;
    if (!reached) {
      return { checkpoint, completed: false, lap, message: "Checkpoint " + (checkpoint + 1) + "/" + points.length };
    }
    const nextCheckpoint = (checkpoint + 1) % points.length;
    const completed = nextCheckpoint === 0;
    const nextLap = completed ? lap + 1 : lap;
    return {
      checkpoint: nextCheckpoint,
      completed,
      lap: nextLap,
      message: completed ? "Lap " + nextLap : "Checkpoint " + (nextCheckpoint + 1) + "/" + points.length,
    };
  },
  hud(state) {
    const speed = Math.max(0, racingKitFinite(state.speed, 0));
    const lap = Math.max(0, Math.trunc(racingKitFinite(state.lap, 0)));
    const checkpoint = Math.max(0, Math.trunc(racingKitFinite(state.checkpoint, 0))) + 1;
    const message = typeof state.message === "string" && state.message.length > 0 ? state.message : "Checkpoint " + checkpoint;
    return "Lap " + lap + " | " + message + " | " + Math.round(speed) + " km/h";
  },
});
function normalizeRacingKitPoints(points) {
  return (Array.isArray(points) ? points : []).map((point) => racingKitVec3(point));
}
function racingKitVec3(value) {
  if (Array.isArray(value)) {
    return [racingKitFinite(value[0], 0), racingKitFinite(value[1], 0), racingKitFinite(value[2], 0)];
  }
  if (value !== null && typeof value === "object") {
    return [racingKitFinite(value.x, 0), racingKitFinite(value.y, 0), racingKitFinite(value.z, 0)];
  }
  return [0, 0, 0];
}
function racingKitFinite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function racingKitDistance2d(left, right) {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}
function racingKitLerp(left, right, alpha) {
  const t = Math.min(Math.max(racingKitFinite(alpha, 0), 0), 1);
  return [left[0] + (right[0] - left[0]) * t, left[1] + (right[1] - left[1]) * t, left[2] + (right[2] - left[2]) * t];
}
function racingKitDistanceToSegment2d(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-9) {
    return racingKitDistance2d(point, start);
  }
  const t = Math.min(Math.max(((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSquared, 0), 1);
  return racingKitDistance2d(point, [start[0] + dx * t, 0, start[2] + dz * t]);
}
`;

export const SUPPORTED_SCRIPT_HELPER_IMPORTS = ["@threenative/racing-kit", "@threenative/script-stdlib"] as const;
export type SupportedScriptHelperImport = (typeof SUPPORTED_SCRIPT_HELPER_IMPORTS)[number];

export interface ISystemScriptSource {
  commands?: ReadonlyArray<{ kind: string }>;
  eventReads?: ReadonlyArray<string>;
  eventWrites?: ReadonlyArray<string>;
  name: string;
  queries?: ReadonlyArray<{ with: string[]; without: string[] }>;
  reads?: ReadonlyArray<string>;
  resourceReads?: ReadonlyArray<string>;
  resourceWrites?: ReadonlyArray<string>;
  script?: {
    exportName: string;
    helperImports?: ReadonlyArray<{
      imported: ReadonlyArray<string>;
      module: SupportedScriptHelperImport;
    }>;
    source?: string;
    sourceRef?: {
      export: string;
      hash?: string;
      module: string;
      systemId: string;
    };
  };
  services?: ReadonlyArray<string>;
  writes?: ReadonlyArray<string>;
}

export interface IScriptBundleResult {
  code?: string;
  diagnostics: ICompilerDiagnostic[];
  manifest?: IScriptsManifest;
}

export interface IScriptsManifest {
  artifacts: Array<{
    generated: true;
    path: "scripts.bundle.js";
    source: false;
  }>;
  schema: "threenative.scripts";
  systems: Array<{
    generated: {
      bundle: "scripts.bundle.js";
      exportName: string;
    };
    source?: {
      export: string;
      helperImports?: Array<{
        imported: string[];
        module: SupportedScriptHelperImport;
      }>;
      hash?: string;
      module: string;
    };
    systemId: string;
  }>;
  version: "0.1.0";
}

export function bundleSystemScripts(systems: ReadonlyArray<ISystemScriptSource>): IScriptBundleResult {
  const scriptedSystems = systems
    .filter((system): system is ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> } => system.script !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  const unresolvedSourceDiagnostics = scriptedSystems.flatMap((system): ICompilerDiagnostic[] =>
    system.script.source === undefined && system.script.sourceRef !== undefined
      ? [
          {
            code: "TN_SCRIPT_SOURCE_REFERENCE_UNRESOLVED",
            file: system.script.sourceRef.module,
            message: `System '${system.name}' references script export '${system.script.sourceRef.export}' before it has been bundled.`,
            path: `systems/${system.name}/script/sourceRef`,
            severity: "error",
            suggestion: "Resolve the referenced TypeScript module/export into the generated scripts bundle before emitting runtime IR.",
          },
        ]
      : [],
  );
  const exportCollisionDiagnostics = diagnoseExportNameCollisions(scriptedSystems);
  const diagnostics = [
    ...exportCollisionDiagnostics,
    ...unresolvedSourceDiagnostics,
    ...scriptedSystems.flatMap((system) =>
      system.script.source === undefined
        ? []
        : diagnosePortableSystem({
            commands: system.commands?.map((command) => command.kind),
            eventWrites: system.eventWrites,
            exportName: system.script.sourceRef?.export,
            file: system.script.sourceRef?.module,
            queries: system.queries,
            resourceWrites: system.resourceWrites,
            services: system.services,
            source: system.script.source,
            systemName: system.name,
            writes: system.writes,
          }),
    ),
  ];
  if (diagnostics.length > 0 || scriptedSystems.length === 0) {
    return { diagnostics };
  }

  const handles = scriptHandleNames(scriptedSystems).map((name) => `const ${name} = Object.freeze({ name: ${JSON.stringify(name)} });`);
  const helperModules = helperImportModules(scriptedSystems);
  const helperDeclarations = [
    ...(helperModules.includes("@threenative/script-stdlib") ? [SCRIPT_STDLIB_BUNDLE_SOURCE] : []),
    ...(helperModules.includes("@threenative/racing-kit") ? [RACING_KIT_BUNDLE_SOURCE] : []),
  ];
  const declarations = scriptedSystems.map((system) => `const ${system.script.exportName} = ${normalizeSystemSource(system.script.source ?? "")};`);
  const exports = scriptedSystems.map((system) => `  ${JSON.stringify(system.script.exportName)}: ${system.script.exportName},`);
  const systemIds = scriptedSystems.map((system) => `  ${JSON.stringify(system.script.exportName)}: ${JSON.stringify(system.name)},`);
  return {
    diagnostics: [],
    manifest: scriptsManifest(scriptedSystems),
    code: [
      "// Generated by ThreeNative. Do not edit.",
      ...helperDeclarations,
      ...handles,
      ...declarations,
      "export const systemIds = Object.freeze({",
      ...systemIds,
      "});",
      "export const systems = Object.freeze({",
      ...exports,
      "});",
      "",
    ].join("\n"),
  };
}

function diagnoseExportNameCollisions(systems: ReadonlyArray<ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> }>): ICompilerDiagnostic[] {
  const byExport = new Map<string, string[]>();
  for (const system of systems) {
    byExport.set(system.script.exportName, [...(byExport.get(system.script.exportName) ?? []), system.name].sort());
  }
  return [...byExport.entries()].flatMap(([exportName, systemNames]) =>
    systemNames.length < 2
      ? []
      : systemNames.map((systemName) => ({
          code: "TN_SCRIPT_EXPORT_COLLISION",
          message: `System '${systemName}' generated script export '${exportName}' collides with another system.`,
          path: `systems/${systemName}/script/exportName`,
          severity: "error" as const,
          suggestion: "Rename one of the systems so generated script export names are unique after sanitization.",
        })),
  );
}

function scriptsManifest(systems: ReadonlyArray<ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> }>): IScriptsManifest {
  return {
    artifacts: [
      {
        generated: true,
        path: "scripts.bundle.js",
        source: false,
      },
    ],
    schema: "threenative.scripts",
    systems: systems.map((system) => ({
      generated: {
        bundle: "scripts.bundle.js",
        exportName: system.script.exportName,
      },
      ...(system.script.sourceRef === undefined
        ? {}
        : {
            source: {
              export: system.script.sourceRef.export,
              ...(system.script.helperImports === undefined || system.script.helperImports.length === 0
                ? {}
                : {
                    helperImports: system.script.helperImports.map((helperImport) => ({
                      imported: [...helperImport.imported].sort(),
                      module: helperImport.module,
                    })),
                  }),
              ...(system.script.sourceRef.hash === undefined ? {} : { hash: system.script.sourceRef.hash }),
              module: system.script.sourceRef.module,
            },
          }),
      systemId: system.name,
    })),
    version: "0.1.0",
  };
}

function helperImportModules(systems: ReadonlyArray<ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> }>): SupportedScriptHelperImport[] {
  return [
    ...new Set(
      systems.flatMap((system) => system.script.helperImports ?? []).map((helperImport) => helperImport.module),
    ),
  ].sort();
}

function scriptHandleNames(systems: ReadonlyArray<ISystemScriptSource>): string[] {
  const names = new Set<string>();
  for (const system of systems) {
    for (const name of [
      ...(system.reads ?? []),
      ...(system.writes ?? []),
      ...(system.eventReads ?? []),
      ...(system.eventWrites ?? []),
      ...(system.resourceReads ?? []),
      ...(system.resourceWrites ?? []),
      ...(system.queries ?? []).flatMap((query) => [...query.with, ...query.without]),
    ]) {
      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

function normalizeSystemSource(source: string): string {
  if (/^async\s+[A-Za-z_$][\w$]*\s*\(/.test(source)) {
    return source.replace(/^async\s+/, "async function ");
  }
  if (/^[A-Za-z_$][\w$]*\s*\(/.test(source)) {
    return `function ${source}`;
  }
  return source;
}
