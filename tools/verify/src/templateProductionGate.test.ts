import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runTemplateProductionGate } from "./templateProductionGate.js";

const completeAgentGamePlan = `# Agent Game Plan

## Playable Loop

Plan controls, objective, progression, fail/retry path, scoring, and feedback.

## High-Value Surface Inventory

| Surface | Source owner | Asset/source plan | Fallback blocker |
| --- | --- | --- | --- |
| Player/hero | content/scenes/rally.scene.json | catalog | |
| Obstacle/enemy/vehicle | content/scenes/rally.scene.json | catalog | |
| Reward/interactable | content/scenes/rally.scene.json | catalog | |
| World/environment | content/scenes/rally.scene.json | catalog | |
| UI/HUD | content/ui/hud.ui.json | native UI | |
| Audio feedback | content/assets/rally.assets.json | source | |

## UI Approach

Use native ThreeNative UI for portable HUD and React webview UI for screen-space
panels such as inventories. React webview UI cannot attach to a 3D element.

## Asset Sourcing Plan

\`\`\`bash
tn asset source search --game-category <category> --format glb --direct-only --json
tn asset source get <asset-source-id> --json
\`\`\`

Record source URL, provenance URL, origin, license evidence, review status,
downloaded date, conversion notes, and fallback notes.
`;

test("should reject a starter without the shared env example", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-env-"));
  try {
    const templatePath = join(root, "templates/structured-source-starter");
    await mkdir(templatePath, { recursive: true });
    await writeFile(join(templatePath, ".gitignore"), ".env\n.env.local\n.env.*.local\n!.env.example\n");

    const result = await runTemplateProductionGate({ root, templates: ["structured-source-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_ENV_EXAMPLE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects maintained starters without game-production scripts and metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-"));
  try {
    const templatePath = join(root, "templates/structured-source-starter");
    await mkdir(templatePath, { recursive: true });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        build: "tn build",
        "game:qa": "tn game qa --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify({
      schema: "threenative.project",
      template: "structured-source-starter",
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "No production loop yet.\n");
    await writeFile(join(templatePath, "AGENTS.md"), "No production loop yet.\n");

    const result = await runTemplateProductionGate({ root, templates: ["structured-source-starter"] });
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as { status: string };

    assert.equal(result.ok, false);
    assert.equal(report.status, "fail");
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_SCRIPT_MISSING" && diagnostic.path?.endsWith("package.json")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_QA_PROOF_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_METADATA_INCOMPLETE" && diagnostic.path?.endsWith("threenative.config.json")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_AGENT_METADATA_INCOMPLETE" && diagnostic.path?.endsWith("threenative.config.json")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_DOCS_INCOMPLETE" && diagnostic.path?.endsWith("AGENTS.md")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_AGENT_PLAN_MISSING" && diagnostic.path?.endsWith("AGENT_GAME_PLAN.md")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_AGENT_PLAN_REFERENCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects maintained starters without catalog-first planning worksheet", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-plan-"));
  try {
    const templatePath = join(root, "templates/structured-source-starter");
    await mkdir(templatePath, { recursive: true });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"arena\" --project . --json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify(completeProductionConfig("structured-source-starter"), null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Start with AGENT_GAME_PLAN.md, then run iterate, game:plan, game:improve, game:qa, and game:release.\n");
    await mkdir(join(templatePath, "docs"), { recursive: true });
    await writeFile(join(templatePath, "docs/API-CARD.md"), "# API Card\nScriptContext\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Before creating or substantially changing the game, run tn game plan. Open AGENT_GAME_PLAN.md only when the compact plan is insufficient. Read docs/API-CARD.md first. After changes, run pnpm run iterate as the default repair loop. Use compact stdout before deep logs, then use game:plan, game:improve, game:qa, and game:release.\n");
    await writeFile(join(templatePath, "AGENT_GAME_PLAN.md"), "Plan first, then get models somehow.\n");

    const result = await runTemplateProductionGate({ root, templates: ["structured-source-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_AGENT_PLAN_ASSET_CATALOG_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require starter scenario proof commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-scenario-proof-"));
  try {
    const templatePath = join(root, "templates/racing-kit-rally-starter");
    await mkdir(templatePath, { recursive: true });
    const config = completeProductionConfig("racing-kit-rally-starter");
    const production = config.production as { proofCommands: string[] };
    production.proofCommands = production.proofCommands.map((command) =>
      command.includes("tn playtest") ? "tn playtest --project . --entity player.car --press KeyW --frames 60 --expect-moved --json" : command,
    );
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"rally\" --project . --json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify(config, null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Start with AGENT_GAME_PLAN.md, then run iterate, game:plan, game:improve, game:qa, and game:release for the production loop.\n");
    await mkdir(join(templatePath, "docs"), { recursive: true });
    await writeFile(join(templatePath, "docs/API-CARD.md"), "# API Card\nScriptContext\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Open AGENT_GAME_PLAN.md as the first game-creation action. Read docs/API-CARD.md first. Probe tn game providers, then use tn audio generate-sfx when available or a local/catalog/procedural offline fallback. After changes, run pnpm run iterate as the default repair loop. Use compact playtest reports before deep logs, then use game:plan, game:improve, game:qa, and game:release before calling a game done.\n");
    await writeFile(join(templatePath, "AGENT_GAME_PLAN.md"), completeAgentGamePlan);

    const result = await runTemplateProductionGate({ root, templates: ["racing-kit-rally-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_PRODUCTION_METADATA_INCOMPLETE" && diagnostic.message.includes("playtest scenario")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require iterate as the starter repair loop", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-iterate-first-"));
  try {
    const templatePath = join(root, "templates/structured-source-starter");
    await mkdir(join(templatePath, "docs"), { recursive: true });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"arena\" --project . --json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify(completeProductionConfig("structured-source-starter"), null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Start with AGENT_GAME_PLAN.md, then run iterate, game:plan, game:improve, game:qa, and game:release for the production loop.\n");
    await writeFile(join(templatePath, "docs/API-CARD.md"), "# API Card\nScriptContext\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Open AGENT_GAME_PLAN.md as the first game-creation action. Read docs/API-CARD.md first. Run validate, build, and playtest individually. Use compact playtest reports before deep logs, then game:plan, game:improve, game:qa, and game:release.\n");
    await writeFile(join(templatePath, "AGENT_GAME_PLAN.md"), completeAgentGamePlan);

    const result = await runTemplateProductionGate({ root, templates: ["structured-source-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_ITERATE_FIRST_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject instructions that point agents at deep frame logs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-deep-logs-"));
  try {
    const templatePath = join(root, "templates/structured-source-starter");
    await mkdir(join(templatePath, "docs"), { recursive: true });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"arena\" --project . --json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify(completeProductionConfig("structured-source-starter"), null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Start with AGENT_GAME_PLAN.md, then run iterate, game:plan, game:improve, game:qa, and game:release for the production loop.\n");
    await writeFile(join(templatePath, "docs/API-CARD.md"), "# API Card\nScriptContext\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Open AGENT_GAME_PLAN.md as the first game-creation action. Read docs/API-CARD.md first. After changes, run pnpm run iterate as the default repair loop. Read effect-log.json and observations.json after every playtest, then game:plan, game:improve, game:qa, and game:release.\n");
    await writeFile(join(templatePath, "AGENT_GAME_PLAN.md"), completeAgentGamePlan);

    const result = await runTemplateProductionGate({ root, templates: ["structured-source-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_COMPACT_REPORT_GUIDANCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts maintained starters with production scripts metadata and instructions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-pass-"));
  try {
    const templatePath = join(root, "templates/racing-kit-rally-starter");
    await mkdir(templatePath, { recursive: true });
    await mkdir(join(root, "templates/_shared"), { recursive: true });
    await writeFile(join(root, "templates/_shared/.env.example"), "# Optional local tooling credential. Never expose to client code.\nELEVENLABS_API_KEY=\n");
    await writeFile(join(templatePath, ".gitignore"), ".env\n.env.local\n.env.*.local\n!.env.example\n");
    await writeTemplateManifest(templatePath, "racing-kit-rally-starter");
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"rally\" --project . --json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify(completeProductionConfig("racing-kit-rally-starter"), null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Start with AGENT_GAME_PLAN.md, then run iterate, game:plan, game:improve, game:qa, and game:release for the production loop.\n");
    await mkdir(join(templatePath, "docs"), { recursive: true });
    await writeFile(join(templatePath, "docs/API-CARD.md"), "# API Card\nScriptContext\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Open AGENT_GAME_PLAN.md as the first game-creation action. Read docs/API-CARD.md first. Probe tn game providers, then use tn audio generate-sfx when available or a local/catalog/procedural offline fallback. After changes, run pnpm run iterate as the default repair loop. Use compact playtest reports before deep logs, then use game:plan, game:improve, game:qa, and game:release before calling a game done.\n");
    await writeFile(join(templatePath, "AGENT_GAME_PLAN.md"), completeAgentGamePlan);

    const result = await runTemplateProductionGate({ root, templates: ["racing-kit-rally-starter"] });

    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects maintained starters when template manifest expectations drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-manifest-drift-"));
  try {
    const templatePath = join(root, "templates/racing-kit-rally-starter");
    await mkdir(templatePath, { recursive: true });
    await writeTemplateManifest(templatePath, "wrong-name", {
      generatedFiles: ["missing-generated-file.md"],
      packageScripts: ["iterate"],
      proofCommandIds: ["build", "made-up-proof"],
    });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        iterate: "tn iterate --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify({ production: { proofCommands: ["tn build --project . --json"] } }, null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "No production loop yet.\n");
    await writeFile(join(templatePath, "AGENTS.md"), "No production loop yet.\n");

    const result = await runTemplateProductionGate({ root, templates: ["racing-kit-rally-starter"] });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_MANIFEST_NAME_DRIFT"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_MANIFEST_GENERATED_FILE_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_MANIFEST_PROOF_UNKNOWN"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_TEMPLATE_MANIFEST_SCRIPT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function completeProductionConfig(template: string): Record<string, unknown> {
  return {
    production: {
      controls: ["keyboard.KeyW"],
      failRetry: "Reset the run.",
      objective: "Reach checkpoints.",
      playableLoop: "Accelerate through checkpoints.",
      proofCommands: [
        "tn authoring validate --project . --json",
        "tn build --project . --json",
        "tn playtest --project . --scenario playtests/rally-throttle.playtest.json --stable-artifacts --json",
        "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
        "tn game score --project . --json",
        "tn game qa --project . --run-proof --json",
        "tn game release --project . --json",
      ],
      agent: {
        highValueSurfaces: [
          { id: "playerHero", provenanceStatus: "source", sourcePath: "content/scenes/rally.scene.json", summary: "Vehicle hero source." },
        ],
        proofCommands: [
          "tn authoring validate --project . --json",
          "tn build --project . --json",
        ],
        scriptModules: [
          { exportName: "rallySystem", module: "src/scripts/rally.ts", ownsState: ["GameState"], referencedBy: ["content/systems/rally.systems.json"] },
        ],
        sourceShape: {
          scene: ["content/scenes/rally.scene.json"],
          scripts: ["src/scripts/rally.ts"],
          systems: ["content/systems/rally.systems.json"],
          ui: ["content/ui/hud.ui.json"],
        },
        uiStates: [
          { id: "gameplay", sourcePath: "content/ui/hud.ui.json" },
        ],
      },
    },
    schema: "threenative.project",
    template,
  };
}

async function writeTemplateManifest(
  templatePath: string,
  name: string,
  overrides: Partial<{
    generatedFiles: string[];
    packageScripts: string[];
    proofCommandIds: string[];
  }> = {},
): Promise<void> {
  await writeFile(join(templatePath, "threenative.template.json"), `${JSON.stringify({
    generatedFiles: overrides.generatedFiles ?? [
      "AGENTS.md",
      "README.md",
      "AGENT_GAME_PLAN.md",
      "docs/API-CARD.md",
      "package.json",
      "threenative.config.json",
    ],
    instructionFiles: [
      "README.md",
      "AGENTS.md",
      "AGENT_GAME_PLAN.md",
      "docs/API-CARD.md",
    ],
    maintained: true,
    name,
    packageScripts: overrides.packageScripts ?? [
      "iterate",
      "game:plan",
      "game:improve",
      "game:score",
      "game:qa",
      "game:release",
    ],
    proofCommandIds: overrides.proofCommandIds ?? [
      "authoring validate",
      "build",
      "playtest scenario",
      "screenshot",
      "score",
      "qa --run-proof",
      "release",
    ],
    schema: "threenative.template.manifest",
    version: "0.1.0",
  }, null, 2)}\n`);
}
