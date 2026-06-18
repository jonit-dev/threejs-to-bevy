import type { ISceneLifecycleIr, ISceneTransitionIr, IScenesIr } from "@threenative/ir";

export interface IRenderTransitionTraceInput {
  elapsedMs: number;
  from: string;
  readyAssetGroups?: readonly string[];
  scenes: IScenesIr;
  timeoutMs?: number;
  to: string;
  transition?: ISceneTransitionIr;
}

export interface IRenderTransitionFrame {
  alpha: number;
  phase: "complete" | "loading" | "transitioning";
  scene: string;
  timeMs: number;
}

export interface IRenderTransitionDiagnostic {
  code: "TN_SCENE_LOADING_NOT_READY" | "TN_SCENE_LOADING_SCENE_MISSING" | "TN_SCENE_LOADING_TIMEOUT";
  message: string;
  path: string;
  severity: "error" | "warning";
}

export interface IRenderTransitionTrace {
  activeScene: string;
  diagnostics: readonly IRenderTransitionDiagnostic[];
  frames: readonly IRenderTransitionFrame[];
  status: "complete" | "loading" | "transitioning";
}

export function traceRenderTransition(input: IRenderTransitionTraceInput): IRenderTransitionTrace {
  const sceneById = new Map(input.scenes.scenes.map((scene) => [scene.id, scene]));
  const target = requireScene(sceneById, input.to);
  const transition = input.transition ?? target.transitions?.enter ?? { durationMs: 0, kind: "instant" as const };
  const diagnostics = validateLoadingTransition(input.scenes, transition);
  const missingGroups = (target.assetGroups ?? []).filter((group) => !(input.readyAssetGroups ?? []).includes(group));
  if (missingGroups.length > 0) {
    diagnostics.push({
      code: "TN_SCENE_LOADING_NOT_READY",
      message: `Scene '${target.id}' is waiting for asset group '${missingGroups[0]}'.`,
      path: `scenes.ir.json/scenes/${target.id}/assetGroups`,
      severity: "warning",
    });
    if ((input.timeoutMs ?? Number.POSITIVE_INFINITY) <= input.elapsedMs) {
      diagnostics.push({
        code: "TN_SCENE_LOADING_TIMEOUT",
        message: `Scene '${target.id}' asset readiness timed out after ${input.elapsedMs}ms.`,
        path: `scenes.ir.json/scenes/${target.id}/assetGroups`,
        severity: "error",
      });
    }
    return {
      activeScene: loadingScene(transition) ?? input.from,
      diagnostics,
      frames: [{ alpha: 1, phase: "loading", scene: loadingScene(transition) ?? input.from, timeMs: input.elapsedMs }],
      status: "loading",
    };
  }

  if (transition.kind === "instant" || transition.durationMs <= 0 || input.elapsedMs >= transition.durationMs) {
    return {
      activeScene: target.id,
      diagnostics,
      frames: [{ alpha: 1, phase: "complete", scene: target.id, timeMs: input.elapsedMs }],
      status: "complete",
    };
  }

  const progress = Math.max(0, Math.min(1, input.elapsedMs / transition.durationMs));
  return {
    activeScene: input.from,
    diagnostics,
    frames: [{ alpha: progress, phase: "transitioning", scene: input.from, timeMs: input.elapsedMs }],
    status: "transitioning",
  };
}

function validateLoadingTransition(scenes: IScenesIr, transition: ISceneTransitionIr): IRenderTransitionDiagnostic[] {
  if (transition.kind !== "loadingScreen" || transition.loadingScene === undefined) {
    return [];
  }
  if (scenes.scenes.some((scene) => scene.id === transition.loadingScene)) {
    return [];
  }
  return [{
    code: "TN_SCENE_LOADING_SCENE_MISSING",
    message: `Loading transition references unknown scene '${transition.loadingScene}'.`,
    path: "scenes.ir.json/transitions/loadingScene",
    severity: "error",
  }];
}

function loadingScene(transition: ISceneTransitionIr): string | undefined {
  return transition.kind === "loadingScreen" ? transition.loadingScene : undefined;
}

function requireScene(sceneById: ReadonlyMap<string, ISceneLifecycleIr>, id: string): ISceneLifecycleIr {
  const scene = sceneById.get(id);
  if (scene === undefined) {
    throw new Error(`Unknown scene lifecycle id '${id}'.`);
  }
  return scene;
}
