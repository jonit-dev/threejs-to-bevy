import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { generatorCommand } from "./sourceDocuments.js";
import type { IBlenderGeneratorDependencies } from "../blender/runBlenderGenerator.js";
import type { IExternalToolStatus } from "../externalTools/manager.js";
import type { IRunImg2ThreejsGeneratorResult } from "../img2threejs/runImg2ThreejsGenerator.js";

const execFileAsync = promisify(execFile);

test("generator run executes project-local TypeScript generator through authoring facade", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-generator-run-"));
  try {
    await mkdir(join(root, "src", "generators"), { recursive: true });
    await writeFile(
      join(root, "src", "generators", "arena.ts"),
      `export async function generateArena({ project }) {
  return project.transaction()
    .operation("scene.create", { sceneId: "arena" })
    .operation("scene.add_prefab", { sceneId: "arena", prefabId: "player.prefab", primitive: "box", color: "#3b82f6" })
    .operation("scene.add_entity", { sceneId: "arena", entityId: "player", prefabId: "player.prefab" })
    .operation("scene.set_transform", { sceneId: "arena", entityId: "player", position: [1, 2, 3] })
    .commit();
}
`,
      "utf8",
    );
    const record = await generatorCommand([
      "record",
      "arena.layout",
      "--module",
      "src/generators/arena.ts",
      "--export",
      "generateArena",
      "--outputs",
      "content/scenes/arena.scene.json",
      "--overwrite-policy",
      "manual",
      "--project",
      root,
      "--json",
    ]);
    const run = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
      prefabs: Array<{ id: string; primitive?: string }>;
    };
    const provenance = JSON.parse(await readFile(join(root, "content", "generators", "arena.layout.generator.json"), "utf8")) as {
      inputHash?: string;
      lastRun?: { filesWritten?: string[]; operations?: Array<{ name: string }> };
      outputHash?: string;
    };
    const payload = JSON.parse(run.stdout) as {
      inputHash?: string;
      operations: Array<{ name: string }>;
      outputHash?: string;
    };

    assert.equal(record.exitCode, 0);
    assert.equal(run.exitCode, 0);
    assert.deepEqual(scene.prefabs, [{ color: "#3b82f6", id: "player.prefab", primitive: "box" }]);
    assert.deepEqual(scene.entities[0], { id: "player", prefab: "player.prefab", transform: { position: [1, 2, 3] } });
    assert.deepEqual(payload.operations.map((operation) => operation.name), ["scene.create", "scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
    assert.match(payload.inputHash ?? "", /^sha256:/);
    assert.match(payload.outputHash ?? "", /^sha256:/);
    assert.equal(provenance.inputHash, payload.inputHash);
    assert.equal(provenance.outputHash, payload.outputHash);
    assert.deepEqual(provenance.lastRun?.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(provenance.lastRun?.operations?.map((operation) => operation.name), ["scene.create", "scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects manual output conflicts before executing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-generator-conflict-"));
  try {
    await mkdir(join(root, "src", "generators"), { recursive: true });
    await writeFile(
      join(root, "src", "generators", "arena.ts"),
      `export async function generateArena({ project }) {
  return project.transaction()
    .operation("scene.create", { sceneId: "arena" })
    .commit();
}
`,
      "utf8",
    );
    await generatorCommand([
      "record",
      "arena.layout",
      "--module",
      "src/generators/arena.ts",
      "--export",
      "generateArena",
      "--outputs",
      "content/scenes/arena.scene.json",
      "--overwrite-policy",
      "manual",
      "--project",
      root,
      "--json",
    ]);
    const firstRun = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    await writeFile(join(root, "content", "scenes", "arena.scene.json"), "{\"manual\":true}\n", "utf8");
    const conflict = await generatorCommand(["run", "arena.layout", "--project", root, "--json"]);
    const payload = JSON.parse(conflict.stdout) as { diagnostics: Array<{ code: string }> };

    assert.equal(firstRun.exitCode, 0);
    assert.equal(conflict.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_GENERATOR_OUTPUT_CONFLICT");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run returns install fix when Blender is missing without source writes", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const before = await readFile(join(root, "content", "generators", "robot.generator.json"), "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { toolStatus: async () => ({ ...readyBlenderStatus(), code: "TN_EXTERNAL_TOOL_MISSING", ready: false, source: "missing" }) },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; suggestion?: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_EXTERNAL_TOOL_MISSING");
    assert.match(payload.diagnostics[0]?.suggestion ?? "", /tn tool install blender --accept-download/);
    assert.equal((payload.diagnostics[0] as { fix?: { snippet?: string } }).fix?.snippet, "tn tool install blender --accept-download --json");
    assert.equal(await readFile(join(root, "content", "generators", "robot.generator.json"), "utf8"), before);
    assert.deepEqual((await readdir(join(root, "content"))).sort(), ["generators"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects malformed Blender outputs before tool dispatch", async () => {
  const root = await createBlenderGeneratorProject();
  let toolStatusCalls = 0;
  try {
    const provenancePath = join(root, "content", "generators", "robot.generator.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    provenance.outputs = "assets/generated/robot.glb";
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { toolStatus: async () => { toolStatusCalls += 1; return readyBlenderStatus(); } },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ path?: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(toolStatusCalls, 0);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.path === "/outputs"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects output traversal before tool dispatch or escaped writes", async () => {
  const root = await createBlenderGeneratorProject();
  let toolStatusCalls = 0;
  try {
    const provenancePath = join(root, "content", "generators", "robot.generator.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    provenance.outputs = ["../escaped.glb"];
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { toolStatus: async () => { toolStatusCalls += 1; return readyBlenderStatus(); } },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; path?: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(toolStatusCalls, 0);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_BLENDER_OUTPUT_PATH_INVALID" && diagnostic.path === "/outputs/0"), true);
    await assert.rejects(readFile(join(root, "..", "escaped.glb")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects recipe traversal before tool dispatch", async () => {
  const root = await createBlenderGeneratorProject();
  let toolStatusCalls = 0;
  try {
    const provenancePath = join(root, "content", "generators", "robot.generator.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as Record<string, unknown>;
    provenance.recipe = "content/generators/../outside.recipe.json";
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { toolStatus: async () => { toolStatusCalls += 1; return readyBlenderStatus(); } },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; path?: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(toolStatusCalls, 0);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID" && diagnostic.path === "/recipe"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("owned runner converts authored array offsets and mirror axes from Y-up to Blender Z-up", async () => {
  const runnerPath = join(import.meta.dirname, "..", "blender", "runner.py");
  const harness = String.raw`
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
names = {"vec3", "position_to_blender", "authored_axis_to_blender", "add_modifier"}
selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
scope = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), sys.argv[1], "exec"), scope)
class Modifiers:
    def new(self, **_kwargs):
        return type("Modifier", (), {})()
class Object:
    def __init__(self):
        self.modifiers = Modifiers()
def run(row):
    obj = Object()
    created = obj.modifiers.new
    holder = {}
    def capture(**kwargs):
        holder["value"] = created(**kwargs)
        return holder["value"]
    obj.modifiers.new = capture
    scope["add_modifier"](obj, row, {})
    value = holder["value"]
    return getattr(value, "constant_offset_displace", None), getattr(value, "use_axis", None)
print(json.dumps({
    "arrayY": run({"kind": "array", "count": 2, "offset": [0, 2, 0]})[0],
    "arrayZ": run({"kind": "array", "count": 2, "offset": [0, 0, 3]})[0],
    "mirrorY": run({"kind": "mirror", "axis": "y"})[1],
    "mirrorZ": run({"kind": "mirror", "axis": "z"})[1],
}, sort_keys=True))
`;
  const { stdout } = await execFileAsync("python3", ["-c", harness, runnerPath]);
  assert.deepEqual(JSON.parse(stdout), {
    arrayY: [0, -0, 2],
    arrayZ: [0, -3, 0],
    mirrorY: [false, false, true],
    mirrorZ: [false, true, false],
  });
});

test("owned runner restores the bind pose and mutes overlapping NLA strips before export", async () => {
  const runnerPath = join(import.meta.dirname, "..", "blender", "runner.py");
  const harness = String.raw`
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "restore_animation_baselines"]
scope = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), sys.argv[1], "exec"), scope)
class Track:
    def __init__(self):
        self.mute = False
class AnimationData:
    def __init__(self):
        self.action = "flight.rudder-right"
        self.nla_tracks = [Track(), Track()]
class Object:
    def __init__(self, pose):
        self.animation_data = AnimationData()
        self.matrix_basis = pose
class Scene:
    frame_start = 0
    def __init__(self):
        self.frame = 90
    def frame_set(self, frame):
        self.frame = frame
rudder = Object("deflected-right")
flaps = Object("deployed")
scene = Scene()
scope["restore_animation_baselines"](
    scene,
    {"rudder": rudder, "flaps": flaps},
    {"rudder": {"matrix_basis": "neutral-rudder"}, "flaps": {"matrix_basis": "neutral-flaps"}},
)
print(json.dumps({
    "actions": [rudder.animation_data.action, flaps.animation_data.action],
    "frame": scene.frame,
    "muted": [[track.mute for track in obj.animation_data.nla_tracks] for obj in [rudder, flaps]],
    "poses": [rudder.matrix_basis, flaps.matrix_basis],
}, sort_keys=True))
`;
  const { stdout } = await execFileAsync("python3", ["-c", harness, runnerPath]);
  assert.deepEqual(JSON.parse(stdout), {
    actions: [null, null],
    frame: 0,
    muted: [[true, true], [true, true]],
    poses: ["neutral-rudder", "neutral-flaps"],
  });
});

test("owned runner applies bounded source material factors without replacing the material", async () => {
  const runnerPath = join(import.meta.dirname, "..", "blender", "runner.py");
  const harness = String.raw`
import ast, json, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "override_source_material"]
scope = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), sys.argv[1], "exec"), scope)
class Input:
    def __init__(self, value):
        self.default_value = value
        self.links = [object()]
class Inputs(dict):
    pass
class Links:
    def remove(self, link):
        for socket in node.inputs.values():
            if link in socket.links:
                socket.links.remove(link)
class Nodes:
    def __init__(self, node):
        self.node = node
    def get(self, name):
        return self.node if name == "Principled BSDF" else None
class Material:
    def __init__(self):
        self.diffuse_color = [1, 1, 1, 1]
        self.metallic = 1
        self.roughness = 1
        self.use_backface_culling = False
        self.use_nodes = True
        global node
        node = type("Node", (), {
            "inputs": Inputs({
                "Base Color": Input([1, 1, 1, 1]),
                "Metallic": Input(1),
                "Roughness": Input(1),
            }),
        })()
        self.node_tree = type("Tree", (), {"links": Links(), "nodes": Nodes(node)})()
material = Material()
class Materials:
    def get(self, name):
        return material if name == "Paint" else None
scope["bpy"] = type("Bpy", (), {"data": type("Data", (), {"materials": Materials()})()})()
scope["override_source_material"]({"id": "Paint", "metallic": 0, "roughness": 0.65})
node = material.node_tree.nodes.get("Principled BSDF")
print(json.dumps({
    "color": material.diffuse_color,
    "metallic": material.metallic,
    "metallicLinks": len(node.inputs["Metallic"].links),
    "metallicSocket": node.inputs["Metallic"].default_value,
    "roughness": material.roughness,
    "roughnessLinks": len(node.inputs["Roughness"].links),
    "roughnessSocket": node.inputs["Roughness"].default_value,
}, sort_keys=True))
`;
  const { stdout } = await execFileAsync("python3", ["-c", harness, runnerPath]);
  assert.deepEqual(JSON.parse(stdout), {
    color: [1, 1, 1, 1],
    metallic: 0,
    metallicLinks: 0,
    metallicSocket: 0,
    roughness: 0.65,
    roughnessLinks: 0,
    roughnessSocket: 0.65,
  });
});

test("generator run invokes hardened Blender and atomically registers sorted animation clips", async () => {
  const root = await createBlenderGeneratorProject();
  const invocations: Array<{ args: readonly string[]; cwd?: string; env?: NodeJS.ProcessEnv; executable: string; timeoutMs: number }> = [];
  try {
    const dependencies = successfulBlenderDependencies(invocations);
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { inputHash: string; inspection: { counts: { animations: number; triangles: number } }; outputHash: string };
    const asset = JSON.parse(await readFile(join(root, "content", "assets", "robot.assets.json"), "utf8")) as {
      assets: Array<{ animationGraph: { initialState: string; states: Array<{ id: string }> }; animations: Array<{ id: string; sourceClip: string }>; source: string }>;
    };
    const jobPath = invocations[0]?.args.at(-1) ?? "";
    assert.equal(result.exitCode, 0);
    assert.match(jobPath, /tn-blender-generator-[^/]+\/job\.json$/);
    assert.deepEqual(invocations[0]?.args, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", dependencies.runnerPath, "--", "--job", jobPath]);
    assert.equal(invocations[0]?.executable, "/managed/blender");
    assert.equal(invocations[0]?.timeoutMs, 120_000);
    assert.match(invocations[0]?.cwd ?? "", /tn-blender-generator-/);
    assert.deepEqual(Object.keys(invocations[0]?.env ?? {}).sort(), Object.keys(invocations[0]?.env ?? {}).filter((name) => ["HOME", "LANG", "LC_ALL", "PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "WINDIR"].includes(name)).sort());
    assert.match(payload.inputHash, /^sha256:/);
    assert.match(payload.outputHash, /^sha256:/);
    assert.deepEqual(asset.assets[0]?.animations, [
      { id: "idle", loop: true, sourceClip: "idle" },
      { id: "wave", loop: true, sourceClip: "wave" },
    ]);
    assert.deepEqual(asset.assets[0]?.animationGraph.states.map((state) => state.id), ["idle", "wave"]);
    assert.equal(asset.assets[0]?.animationGraph.initialState, "idle");
    assert.equal(asset.assets[0]?.source, "generator:robot");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run passes a contained source GLB to Blender and hashes its bytes", async () => {
  const root = await createBlenderGeneratorProject();
  const invocations: Array<{ sourcePath?: string }> = [];
  try {
    await mkdir(join(root, "assets", "source"), { recursive: true });
    const sourcePath = join(root, "assets", "source", "aircraft.glb");
    await writeFile(sourcePath, "source-glb-v1", "utf8");
    const recipePath = join(root, "content", "generators", "robot.recipe.json");
    const recipe = JSON.parse(await readFile(recipePath, "utf8")) as Record<string, unknown>;
    delete recipe.materials;
    delete recipe.parts;
    recipe.source = "assets/source/aircraft.glb";
    recipe.operations = [{
      axis: "x",
      kind: "split-by-axis",
      negative: "propeller.left",
      node: "Propeller",
      positive: "propeller.right",
      threshold: 0,
    }];
    recipe.animations = [{
      id: "propeller.spin",
      duration: 1,
      loop: true,
      tracks: [{ node: "propeller.left", property: "rotation", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0, 360] }] }],
    }];
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
    const dependencies = successfulBlenderDependencies([]);
    dependencies.inspect = async (path) => path === sourcePath
      ? { ...validInspection(path), animationClips: [], dependencies: [{ embedded: true, exists: true, kind: "buffer" }], namedNodes: ["Propeller"] }
      : { ...validInspection(path), animationClips: [{ channels: 1, name: "propeller.spin", samplers: 1 }] };
    dependencies.runProcess = async (_executable, args) => {
      const jobPath = args.at(-1)!;
      const job = JSON.parse(await readFile(jobPath, "utf8")) as { outputPath: string; resultPath: string; sourcePath?: string };
      invocations.push({ sourcePath: job.sourcePath });
      await writeFile(job.outputPath, "deterministic-glb", "utf8");
      await writeFile(job.resultPath, `${JSON.stringify({ animations: ["propeller.spin"], nodes: ["propeller.left", "propeller.right"], ok: true })}\n`, "utf8");
      return { exitCode: 0, stderr: "", stdout: "THREENATIVE_RESULT", timedOut: false };
    };

    const first = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    await writeFile(sourcePath, "source-glb-v2", "utf8");
    const second = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const firstPayload = JSON.parse(first.stdout) as { inputHash: string };
    const secondPayload = JSON.parse(second.stdout) as { inputHash: string };

    assert.equal(first.exitCode, 0, first.stdout);
    assert.equal(second.exitCode, 0, second.stdout);
    assert.deepEqual(invocations, [{ sourcePath }, { sourcePath }]);
    assert.notEqual(secondPayload.inputHash, firstPayload.inputHash);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run preserves prior output and provenance when Blender exits non-zero", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const output = join(root, "assets", "generated", "robot.glb");
    await mkdir(join(root, "assets", "generated"), { recursive: true });
    await writeFile(output, "accepted-output", "utf8");
    const provenancePath = join(root, "content", "generators", "robot.generator.json");
    const before = await readFile(provenancePath, "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { ...successfulBlenderDependencies([]), runProcess: async () => ({ exitCode: 7, stderr: "bounded failure", stdout: "", timedOut: false }) },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(await readFile(output, "utf8"), "accepted-output");
    assert.equal(await readFile(provenancePath, "utf8"), before);
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), ["robot.glb"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run bounds oversized Blender failure logs", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: {
        ...successfulBlenderDependencies([]),
        runProcess: async () => ({ exitCode: 9, stderr: `discarded-prefix-${"x".repeat(160 * 1024)}-bounded-tail`, stdout: "", timedOut: false }),
      },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; message: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_GENERATION_FAILED");
    assert.ok((payload.diagnostics[0]?.message.length ?? Number.POSITIVE_INFINITY) < 129 * 1024);
    assert.doesNotMatch(payload.diagnostics[0]?.message ?? "", /discarded-prefix/);
    assert.match(payload.diagnostics[0]?.message ?? "", /bounded-tail$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects malformed owned-runner JSON without accepting output", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const dependencies = successfulBlenderDependencies([]);
    dependencies.runProcess = async (_executable, args) => {
      const job = JSON.parse(await readFile(args.at(-1)!, "utf8")) as { outputPath: string; resultPath: string };
      await writeFile(job.outputPath, "unaccepted-glb", "utf8");
      await writeFile(job.resultPath, "{not-json\n", "utf8");
      return { exitCode: 0, stderr: "", stdout: "", timedOut: false };
    };
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_RESULT_INVALID");
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), []);
    assert.deepEqual((await readdir(join(root, "content"))).sort(), ["generators"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run cleans staging and preserves source when Blender times out", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], {
      blenderDependencies: { ...successfulBlenderDependencies([]), runProcess: async () => ({ exitCode: null, stderr: "", stdout: "", timedOut: true }) },
    });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_GENERATION_TIMEOUT");
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects staged GLB over polygon budget before registration", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const dependencies = successfulBlenderDependencies([]);
    dependencies.inspect = async (path) => validInspection(path, { triangles: 50_001 });
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_OUTPUT_BUDGET_EXCEEDED");
    assert.deepEqual((await readdir(join(root, "content"))).sort(), ["generators"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects staged GLB over output byte budget before registration", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const dependencies = successfulBlenderDependencies([]);
    dependencies.inspect = async (path) => ({ ...validInspection(path), file: { byteSize: 1_000_001, path } });
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; message: string }> };
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_OUTPUT_BUDGET_EXCEEDED");
    assert.match(payload.diagnostics[0]?.message ?? "", /maxOutputBytes/);
    assert.deepEqual((await readdir(join(root, "content"))).sort(), ["generators"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rejects an invalid staged GLB before registration", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const dependencies = successfulBlenderDependencies([]);
    dependencies.inspect = async (path) => ({
      code: "TN_ASSET_INSPECT_FAILED",
      counts: { animations: 0, materials: 0, meshes: 0, triangles: 0 },
      diagnostics: [{ code: "TN_ASSET_GLTF_INVALID", message: "Staged output is not a valid GLB.", severity: "error" }],
      file: { byteSize: 17, path },
    });
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_ASSET_GLTF_INVALID");
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), []);
    assert.deepEqual((await readdir(join(root, "content"))).sort(), ["generators"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run rolls back promoted output and source when asset registration fails", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const output = join(root, "assets", "generated", "robot.glb");
    const assetFile = join(root, "content", "assets", "robot.assets.json");
    await mkdir(join(root, "assets", "generated"), { recursive: true });
    await mkdir(join(root, "content", "assets"), { recursive: true });
    await writeFile(output, "previous-accepted-output", "utf8");
    await writeFile(assetFile, "{malformed-owned-document\n", "utf8");
    const provenancePath = join(root, "content", "generators", "robot.generator.json");
    const provenanceBefore = await readFile(provenancePath, "utf8");
    const result = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: successfulBlenderDependencies([]) });
    const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };
    assert.equal(result.exitCode, 1);
    assert.equal(payload.diagnostics[0]?.code, "TN_BLENDER_REGISTRATION_FAILED");
    assert.equal(await readFile(output, "utf8"), "previous-accepted-output");
    assert.equal(await readFile(assetFile, "utf8"), "{malformed-owned-document\n");
    assert.equal(await readFile(provenancePath, "utf8"), provenanceBefore);
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), ["robot.glb"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator run reproduces semantic inspection and hashes for unchanged recipe and provider", async () => {
  const root = await createBlenderGeneratorProject();
  try {
    const dependencies = successfulBlenderDependencies([]);
    const first = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const second = await generatorCommand(["run", "robot", "--project", root, "--json"], { blenderDependencies: dependencies });
    const firstPayload = JSON.parse(first.stdout) as { inputHash: string; inspection: unknown; outputHash: string };
    const secondPayload = JSON.parse(second.stdout) as { inputHash: string; inspection: unknown; outputHash: string };
    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 0);
    assert.equal(secondPayload.inputHash, firstPayload.inputHash);
    assert.equal(secondPayload.outputHash, firstPayload.outputHash);
    assert.deepEqual(secondPayload.inspection, firstPayload.inspection);
    assert.deepEqual((await readdir(join(root, "assets", "generated"))).sort(), ["robot.glb"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generator record-blender writes a bounded inline recipe without running Blender", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-record-blender-"));
  try {
    const recipe = { schema: "threenative.blender-recipe", version: "0.1.0", id: "prop.crate", budgets: { maxOutputBytes: 1_000_000, maxPolygons: 10_000 }, parts: [{ id: "body", primitive: "cube" }] };
    const result = await generatorCommand(["record-blender", "prop.crate", "--recipe", JSON.stringify(recipe), "--project", root, "--json"]);
    assert.equal(result.exitCode, 0);
    const writtenRecipe = JSON.parse(await readFile(join(root, "content/generators/prop.crate.recipe.json"), "utf8")) as typeof recipe;
    assert.equal(writtenRecipe.schema, recipe.schema);
    assert.equal(writtenRecipe.version, recipe.version);
    assert.equal(writtenRecipe.id, recipe.id);
    assert.deepEqual(writtenRecipe.parts, recipe.parts);
    assert.equal(writtenRecipe.budgets.maxOutputBytes, recipe.budgets.maxOutputBytes);
    assert.equal(writtenRecipe.budgets.maxPolygons, recipe.budgets.maxPolygons);
    const provenance = JSON.parse(await readFile(join(root, "content/generators/prop.crate.generator.json"), "utf8")) as { provider?: string; recipe?: string };
    assert.equal(provenance.provider, "blender");
    assert.equal(provenance.recipe, "content/generators/prop.crate.recipe.json");
    await assert.rejects(readFile(join(root, "assets/generated/prop.crate.glb")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should rerun recorded img2threejs provenance through the shared provider runner", async () => {
  const root = await createImg2ThreejsGeneratorProject();
  let calls = 0;
  try {
    const result = await generatorCommand(["run", "prop.radio", "--project", root, "--json"], {
      img2ThreejsRunner: async (projectPath, generatorId) => {
        calls += 1;
        assert.equal(projectPath, root);
        assert.equal(generatorId, "prop.radio");
        return img2ThreejsSentinelResult(projectPath);
      },
    });
    const payload = JSON.parse(result.stdout) as Record<string, unknown> & { inspection: { bounds: { size: number[] }; counts: { triangles: number } }; nextCommands: string[] };
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(calls, 1);
    assert.equal(payload.code, "TN_GENERATOR_RUN_OK");
    assert.equal(payload.command, "generator run");
    assert.equal(payload.outputHash, `sha256:${"b".repeat(64)}`);
    assert.equal(payload.inspection.counts.triangles, 12);
    assert.deepEqual(payload.inspection.bounds.size, [1.4, 0.82, 0.38]);
    assert.deepEqual(payload.nextCommands, [
      "tn asset inspect assets/generated/prop.radio.glb --json",
      "tn model-test assets/generated/prop.radio.glb --angles 0,90,180,270 --json",
      "tn build",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve Blender and TypeScript generator behavior", async () => {
  const typescriptRoot = await mkdtemp(join(tmpdir(), "tn-generator-preserve-typescript-"));
  const blenderRoot = await createBlenderGeneratorProject();
  try {
    await mkdir(join(typescriptRoot, "src/generators"), { recursive: true });
    await writeFile(join(typescriptRoot, "src/generators/preserve.ts"), `export async function preserve({ project }) { return project.transaction().operation("scene.create", { sceneId: "preserved" }).commit(); }\n`);
    const record = await generatorCommand(["record", "preserve", "--module", "src/generators/preserve.ts", "--export", "preserve", "--outputs", "content/scenes/preserved.scene.json", "--project", typescriptRoot, "--json"]);
    const typescriptRun = await generatorCommand(["run", "preserve", "--project", typescriptRoot, "--json"]);
    const blenderRun = await generatorCommand(["run", "robot", "--project", blenderRoot, "--json"], { blenderDependencies: { toolStatus: async () => ({ ...readyBlenderStatus(), code: "TN_EXTERNAL_TOOL_MISSING", ready: false, source: "missing" }) } });
    assert.equal(record.exitCode, 0);
    assert.equal(typescriptRun.exitCode, 0, typescriptRun.stdout);
    assert.equal((JSON.parse(typescriptRun.stdout) as { code: string }).code, "TN_GENERATOR_RUN_OK");
    assert.equal((JSON.parse(blenderRun.stdout) as { diagnostics: Array<{ code: string }> }).diagnostics[0]?.code, "TN_EXTERNAL_TOOL_MISSING");
  } finally {
    await Promise.all([rm(typescriptRoot, { force: true, recursive: true }), rm(blenderRoot, { force: true, recursive: true })]);
  }
});

async function createBlenderGeneratorProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-blender-generator-"));
  await mkdir(join(root, "content", "generators"), { recursive: true });
  const recipe = {
    schema: "threenative.blender-recipe", version: "0.1.0", id: "robot",
    materials: [{ id: "paint", baseColor: [0.1, 0.4, 0.9], metallic: 0.1, roughness: 0.5 }],
    parts: [{ id: "body", primitive: "cube", material: "paint", position: [0, 1, 0], scale: [0.8, 1.2, 0.4] }, { id: "arm", primitive: "cylinder", material: "paint", position: [0.7, 1.5, 0], rotation: [0, 0, 90], scale: [0.2, 0.8, 0.2] }],
    operations: [{ kind: "parent", parent: "body", child: "arm" }],
    animations: [
      { id: "wave", duration: 1, loop: true, tracks: [{ node: "arm", property: "rotation", keyframes: [{ time: 0, value: [0, 0, -30] }, { time: 0.5, value: [0, 0, 30] }, { time: 1, value: [0, 0, -30] }] }] },
      { id: "idle", duration: 1, loop: true, tracks: [{ node: "body", property: "position", keyframes: [{ time: 0, value: [0, 1, 0] }, { time: 0.5, value: [0, 1.05, 0] }, { time: 1, value: [0, 1, 0] }] }] },
    ],
    budgets: { maxAnimations: 4, maxKeyframesPerTrack: 16, maxMaterials: 4, maxModifiersPerPart: 4, maxOutputBytes: 1_000_000, maxParts: 16, maxPolygons: 50_000, maxSegments: 32, maxTracksPerAnimation: 16 },
  };
  const provenance = { schema: "threenative.generator-provenance", version: "0.1.0", id: "robot", provider: "blender", providerVersion: "4.5.11", recipe: "content/generators/robot.recipe.json", outputs: ["assets/generated/robot.glb"], overwritePolicy: "replace" };
  await writeFile(join(root, "content", "generators", "robot.recipe.json"), `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
  await writeFile(join(root, "content", "generators", "robot.generator.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  return root;
}

async function createImg2ThreejsGeneratorProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-img2threejs-generator-"));
  await mkdir(join(root, "content/generators"), { recursive: true });
  const sha = `sha256:${"a".repeat(64)}`;
  const provenance = {
    acceptedPasses: [{ evidence: [{ path: "artifacts/img2threejs/prop.radio/review.png", sha256: sha }], id: "blockout", reviewHash: sha }],
    budgets: { maxMaterials: 8, maxOutputBytes: 2_000_000, maxTextures: 8, maxTriangles: 20_000, timeoutMs: 10_000 },
    export: "createPropRadioModel",
    id: "prop.radio",
    inputHash: sha,
    module: "src/generators/createPropRadioModel.ts",
    outputs: ["assets/generated/prop.radio.glb"],
    overwritePolicy: "replace",
    provider: "img2threejs",
    providerVersion: "1.2.0",
    recipe: "content/generators/prop.radio.img2threejs.json",
    schema: "threenative.generator-provenance",
    sculptSpec: "content/generators/prop.radio.sculpt-spec.json",
    sourceHashes: { factory: sha, recipe: sha, resources: [], sculptSpec: sha, sourceImage: sha, validationReport: sha },
    sourceImage: "content/references/prop.radio.png",
    upstream: { commit: "e8ff28a6ae0cb534c7b2ebc15cb3f06709262d5b", internalForkTree: "3f410de76c9a7ae53875abe7b47f99edf3beb2a6", repository: "https://github.com/hoainho/img2threejs", skillVersion: "1.2.0" },
    version: "0.1.0",
  };
  await writeFile(join(root, "content/generators/prop.radio.generator.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  return root;
}

function img2ThreejsSentinelResult(projectPath: string): IRunImg2ThreejsGeneratorResult {
  return {
    code: "TN_IMG2THREEJS_RUN_OK",
    diagnostics: [],
    filesWritten: ["assets/generated/prop.radio.glb", "content/assets/prop.radio.assets.json", "content/generators/prop.radio.generator.json"],
    generatorId: "prop.radio",
    inputHash: `sha256:${"a".repeat(64)}`,
    inspection: {
      bounds: { center: [0, 0, 0], max: [0.7, 0.41, 0.19], min: [-0.7, -0.41, -0.19], size: [1.4, 0.82, 0.38], source: "accessor-min-max" },
      code: "TN_ASSET_INSPECT_OK",
      counts: { accessors: 3, animations: 0, buffers: 1, images: 1, materials: 2, meshes: 2, nodes: 4, scenes: 1, textures: 1, triangles: 12 },
      diagnostics: [],
      file: { byteSize: 9_340, path: "assets/generated/prop.radio.glb", type: "glb" },
      message: "Asset inspection completed.",
    },
    message: "Generated and registered 'assets/generated/prop.radio.glb'.",
    ok: true,
    outputHash: `sha256:${"b".repeat(64)}`,
    projectPath,
    proofFiles: ["artifacts/img2threejs/prop.radio/reload-proof/hash/source.png"],
    validation: { issues: { messages: [], numErrors: 0, numHints: 0, numInfos: 0, numWarnings: 0 } },
    visualMetrics: { meanNormalizedRgbDelta: 0, passed: true, silhouetteIou: 1, ssim: 1, thresholds: { meanNormalizedRgbDelta: 3 / 255, silhouetteIou: 0.995, ssim: 0.98 } },
  };
}

function readyBlenderStatus(): IExternalToolStatus {
  return {
    artifact: { archive: "tar.xz", archiveFile: "blender.tar.xz", executablePath: "blender", expectedBytes: 1, host: "linux-x64", sha256: "0".repeat(64), url: "https://download.blender.org/blender.tar.xz" },
    cachePath: "/managed", code: "TN_EXTERNAL_TOOL_READY", executablePath: "/managed/blender", id: "blender",
    license: { name: "GPL", url: "https://developer.blender.org/docs/license/" }, ready: true, source: "managed", sourceUrl: "https://download.blender.org/source/", version: "4.5.11",
  };
}

function successfulBlenderDependencies(invocations: Array<{ args: readonly string[]; cwd?: string; env?: NodeJS.ProcessEnv; executable: string; timeoutMs: number }>): Partial<IBlenderGeneratorDependencies> {
  return {
    inspect: async (path) => validInspection(path),
    now: () => new Date("2026-07-13T12:00:00.000Z"),
    runnerPath: join(import.meta.dirname, "..", "blender", "runner.py"),
    toolStatus: async () => readyBlenderStatus(),
    uniqueId: () => "test-run",
    runProcess: async (executable, args, options) => {
      invocations.push({ args, executable, ...options });
      const jobPath = args.at(-1)!;
      const job = JSON.parse(await readFile(jobPath, "utf8")) as { outputPath: string; resultPath: string };
      await writeFile(job.outputPath, "deterministic-glb", "utf8");
      await writeFile(job.resultPath, `${JSON.stringify({ animations: ["idle", "wave"], nodes: ["arm", "body"], ok: true })}\n`, "utf8");
      return { exitCode: 0, stderr: "", stdout: "THREENATIVE_RESULT", timedOut: false };
    },
  };
}

function validInspection(path: string, counts: { triangles?: number } = {}) {
  return {
    animationClips: [{ channels: 1, name: "idle", samplers: 1 }, { channels: 1, name: "wave", samplers: 1 }],
    code: "TN_ASSET_INSPECT_OK" as const,
    counts: { animations: 2, materials: 1, meshes: 2, triangles: counts.triangles ?? 48 },
    diagnostics: [], file: { byteSize: 17, path },
  };
}
