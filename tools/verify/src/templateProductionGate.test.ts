import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runTemplateProductionGate } from "./templateProductionGate.js";

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
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("accepts maintained starters with production scripts metadata and instructions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-template-production-pass-"));
  try {
    const templatePath = join(root, "templates/racing-kit-rally-starter");
    await mkdir(templatePath, { recursive: true });
    await writeFile(join(templatePath, "package.json"), `${JSON.stringify({
      scripts: {
        "game:improve": "tn game improve --apply-plan artifacts/game-production/plan.json --project . --json",
        "game:plan": "tn game plan --goal \"rally\" --project . --json > artifacts/game-production/plan.json",
        "game:qa": "tn game qa --project . --run-proof --json",
        "game:release": "tn game release --project . --json",
        "game:score": "tn game score --project . --json",
      },
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "threenative.config.json"), `${JSON.stringify({
      production: {
        controls: ["keyboard.KeyW"],
        failRetry: "Reset the run.",
        objective: "Reach checkpoints.",
        playableLoop: "Accelerate through checkpoints.",
        proofCommands: [
          "tn authoring validate --project . --json",
          "tn build --project . --json",
          "tn playtest --project . --entity player.car --press KeyW --frames 60 --expect-moved --json",
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
      template: "racing-kit-rally-starter",
    }, null, 2)}\n`);
    await writeFile(join(templatePath, "README.md"), "Run game:plan, game:improve, game:qa, and game:release for the production loop.\n");
    await writeFile(join(templatePath, "AGENTS.md"), "Use game:plan, game:improve, game:qa, and game:release before calling a game done.\n");

    const result = await runTemplateProductionGate({ root, templates: ["racing-kit-rally-starter"] });

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
