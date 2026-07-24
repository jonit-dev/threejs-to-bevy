import { PLAYTEST_ASSERTION_REGISTRY } from "./playtestAssertions.js";
import type { IPlaytestScenario } from "./playtestScenario.js";
import type { ICommandResult } from "../diagnostics.js";

export interface IPlaytestSchemaPayload {
  assertionKinds: Array<(typeof PLAYTEST_ASSERTION_REGISTRY)[number]["kind"]>;
  assertions: typeof PLAYTEST_ASSERTION_REGISTRY;
  code: "TN_PLAYTEST_SCHEMA";
  examples: {
    retryPath: IPlaytestScenario;
    stepSequence: IPlaytestScenario["steps"];
  };
  message: string;
  parity: {
    description: string;
    fields: Array<{ description: string; name: string; type: string }>;
  };
  schema: "threenative.playtest-schema";
  setup: {
    description: string;
    fields: Array<{ description: string; name: string; type: string }>;
  };
  steps: Array<{
    description: string;
    fields: Array<{ description: string; name: keyof IPlaytestScenario["steps"][number]; type: string }>;
  }>;
  timing: {
    fixedDeltaSeconds: number;
    relation: string;
    ticksPerRenderedFrame: number;
  };
}

export async function playtestSchemaCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const payload = playtestSchemaPayload();

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderHumanSchema(payload),
  };
}

export function playtestSchemaPayload(): IPlaytestSchemaPayload {
  return {
    assertionKinds: PLAYTEST_ASSERTION_REGISTRY.map((entry) => entry.kind),
    assertions: PLAYTEST_ASSERTION_REGISTRY,
    code: "TN_PLAYTEST_SCHEMA",
    examples: {
      retryPath: {
        assert: {
          diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
          hud: [{ id: "status-label", textIncludes: "Ready" }],
        },
        name: "retry-path",
        schemaVersion: 1,
        setup: { entities: [{ entity: "player", position: [0, 0.02, 5] }] },
        steps: [
          { kind: "input", holdTicks: 1, label: "trigger retry", press: "KeyR", release: true },
          { kind: "wait", waitTicks: 12, release: true },
        ],
        subject: "player",
        target: "web",
        viewport: { height: 720, width: 1280 },
        warmupFrames: 10,
      },
      stepSequence: [
        { kind: "input", holdTicks: 45, label: "move right", press: "KeyD", release: true },
        { kind: "wait", waitTicks: 8, release: true },
        { kind: "input", holdTicks: 1, label: "retry", press: "KeyR", release: true },
      ],
    },
    message: "Machine-readable playtest scenario and assertion DSL schema.",
    parity: {
      description: "Optional web/desktop parity comparison tolerances consumed by paired gameplay parity gates.",
      fields: [
        { description: "Targets to run from the same scenario, usually web and desktop.", name: "parity.targets", type: "Array<web|desktop|bevy>" },
        { description: "Maximum movement distance delta between targets.", name: "parity.compare.movementDistance.maxDelta", type: "number" },
        { description: "Maximum signed movement delta per axis.", name: "parity.compare.axisDelta.x|y|z", type: "number" },
        { description: "Resource dot paths that must match across targets.", name: "parity.compare.resources[]", type: "string" },
        { description: "Minimum shared contact assertion count.", name: "parity.compare.contacts.minSharedCount", type: "number" },
        { description: "Animation evidence required on selected targets.", name: "parity.compare.animation[]", type: "{ entity: string, clip?: string, requiredOn?: string[] }" },
      ],
    },
    schema: "threenative.playtest-schema",
    setup: {
      description: "Optional initial runtime Transform overrides applied before warmup and baseline sampling.",
      fields: [
        { description: "Entity id to reposition before the playtest baseline sample.", name: "setup.entities[].entity", type: "string" },
        { description: "Initial Transform.position tuple.", name: "setup.entities[].position", type: "[number, number, number]" },
        { description: "Initial Transform.rotation quaternion.", name: "setup.entities[].rotation", type: "[number, number, number, number]" },
        { description: "Initial Transform.scale tuple.", name: "setup.entities[].scale", type: "[number, number, number]" },
      ],
    },
    steps: [
      {
        description: "A playtest step presses a KeyboardEvent.code or pointer button for fixed ticks, or uses kind wait for an explicit no-input interval.",
        fields: [
          { description: "Optional explicit step kind. wait never synthesizes a keyboard key.", name: "kind", type: "input | wait" },
          { description: "KeyboardEvent.code or pointer button to press, for example KeyW, Space, or pointer.0.", name: "press", type: "string" },
          { description: "Frames to hold the key before release.", name: "holdFrames", type: "positive integer" },
          { description: "Exact fixed simulation ticks to hold the key. Browser proofs step the paused runtime directly when supported.", name: "holdTicks", type: "positive integer" },
          { description: "Whether to release the pressed key after holdFrames. Defaults to true.", name: "release", type: "boolean" },
          { description: "Frames to wait without new input.", name: "waitFrames", type: "positive integer" },
          { description: "Fixed simulation ticks to wait without input.", name: "waitTicks", type: "positive integer" },
          { description: "Human-readable step label.", name: "label", type: "string" },
        ],
      },
    ],
    timing: {
      fixedDeltaSeconds: 1 / 60,
      relation: "holdTicks and waitTicks count exact fixed-update ticks through the paused runtime proof hook. holdFrames/waitFrames retain rendered-frame compatibility behavior; older runtimes fall back to rendered frames.",
      ticksPerRenderedFrame: 1,
    },
  };
}

function renderHumanSchema(payload: IPlaytestSchemaPayload): string {
  const assertions = payload.assertions.map((entry) => `  ${entry.kind}: ${entry.description}`).join("\n");
  return `${payload.message}\n\nAssertions:\n${assertions}\n\nTiming:\n  ${payload.timing.relation}\n\nParity:\n  ${payload.parity.description}\n\nUse --json for field definitions and examples.\n`;
}
