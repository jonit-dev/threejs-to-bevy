import { type IGameKitCandidate } from "../game/kits.js";

export interface IGameIntentVerb {
  action: string;
  id: string;
  object: string;
  required: boolean;
  subject: string;
}

export interface IGameAcceptanceAssertion {
  description: string;
  id: string;
  kind: "interaction" | "movement" | "progress" | "retry";
  proof?: IGameProofTemplateBinding;
  required: boolean;
}

export type GameProofAssertionFamily = "blocked-movement" | "canvas-render" | "movement" | "objective-progress" | "push-only" | "retry" | "state-change" | "win-state";

export interface IGameProofTemplateBinding {
  family: GameProofAssertionFamily;
  templateId: string;
}

export interface IGameIntentContract {
  acceptanceAssertions: IGameAcceptanceAssertion[];
  id: string;
  prototype?: IGamePrototypeBinding;
  requiredCapabilities: string[];
  schema: "threenative.game-intent";
  verbs: IGameIntentVerb[];
  version: 1;
}

export interface IGamePrototypeBinding {
  id: "alternating-grid-single-pursuit" | "continuous-arena-pooled-pressure";
  proofRoles: Record<string, GamePrototypeProofRole>;
}

export type GamePrototypeProofRole = "canvas" | "failure" | "objective-outcomes" | "opponent-turn" | "primary-input" | "progression" | "retry";

export interface IGamePlanStep {
  id: string;
  phase: string;
  recipe?: string;
  recipeArgs?: Record<string, unknown>;
  recipeGameplayBlocks?: string[];
  recipeGeneratedIds?: Record<string, string[]>;
  recipeProofCommands?: string[];
  recipeProofHints?: string[];
  recipeScriptResponsibilities?: string[];
  recipeSourceOwners?: Record<string, string[]>;
  command?: string;
  apply: boolean;
  summary: string;
}

export interface IGameplayBlockDescriptor {
  appliesWhen: string[];
  cautions: string[];
  helperImports: string[];
  id: string;
  kind: "ai" | "basis" | "camera" | "combat" | "controller" | "objective" | "spawn" | "world";
  proof: string[];
  recipeIds: string[];
  scriptResponsibilities: string[];
  source: "gameblocks-inspired" | "threenative";
}

export interface IGamePlan {
  acceptanceCriteria: string[];
  archetype: string;
  authoringMode: "bounded-match" | "custom-on-starter";
  archetypeDetails: {
    controls: string[];
    lookProfile: Record<string, unknown>;
    probe: string;
    script: {
      exportName: string;
      module: string;
      responsibility: string;
    };
    summary: string;
  };
  archetypeSuggestions: Array<{
    archetype: "camera-boom" | "character" | "pickup" | "prop-static" | "vehicle";
    command: string;
    id: string;
    reason: string;
    surface: "camera" | "hero" | "pickup" | "prop" | "vehicle";
  }>;
  assetPlan: Array<{
    fallback: string;
    requiredEvidence: string[];
    searchCommand?: string;
    sourcePreference: string;
    surface: string;
  }>;
  code: "TN_GAME_PLAN";
  coveredResponsibilityIds: string[];
  design: {
    controls: string[];
    failRetry: string;
    feedback: string[];
    loop: string;
    objective: string;
    progression: string;
  };
  diagnostics: unknown[];
  goal: string;
  inventory: {
    diagnostics: Array<{ code: string; message: string; path?: string; severity: string }>;
    primarySceneId?: string;
    projectKind: string;
    recommendedOperations: string[];
    sourceFamilies: Array<{ count: number; files: string[]; kind: string }>;
  };
  intentContract: IGameIntentContract;
  gameplayBlocks: IGameplayBlockDescriptor[];
  kitCandidates: IGameKitCandidate[];
  mechanicDecomposition: Array<{
    command?: string;
    cookbookId?: string;
    mechanic: string;
    owner: string;
    proof: string;
    summary: string;
  }>;
  message: string;
  mutate: false;
  phases: Array<{ id: string; order: number; summary: string }>;
  polishPlan: Array<{
    acceptance: string;
    category: string;
    sourceSurface: string;
    treatment: string;
  }>;
  proofCommands: string[];
  recipeIds: string[];
  schema: "threenative.game-plan";
  scriptPlan: Array<{
    module: string;
    exportName: string;
    responsibility: string;
    state: string[];
    proof: string;
  }>;
  sourcePlan: Array<{
    document: string;
    path: string;
    supportedShape: string[];
    avoid: string[];
    operations: string[];
  }>;
  steps: IGamePlanStep[];
  uncoveredResponsibilityIds: string[];
  version: 2;
}
