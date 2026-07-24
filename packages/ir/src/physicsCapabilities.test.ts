import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { combinePhysicsSurfaceValues, PHYSICS_CAPABILITY_DESCRIPTORS, PHYSICS_CAPABILITY_LIMITS, PHYSICS_INVARIANT_REGISTRY, PHYSICS_OBSERVATION_TOLERANCES, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, PHYSICS_PHASE3_OUTCOME_TOLERANCES, PHYSICS_PHASE3_VEHICLE_TOLERANCES, PHYSICS_SCRIPT_SERVICE_DESCRIPTORS, physicsDescriptorDrift, physicsPromotionReadinessDrift } from "./physicsCapabilities.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("physics observation tolerances should expose a versioned evidence owner", () => {
  assert.match(PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelCompression.absolute <= 0.008);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelNormalLoad.relative <= 0.35);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelChassisAngularVelocity.absolute <= 0.0045);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelChassisPosition.absolute <= 0.125);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelChassisRotation.absolute <= 0.003);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelChassisVelocity.absolute <= 0.08);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelChassisSpeed.absolute <= 0.02);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelContactDistance.absolute <= 0.003);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelContactPoint.absolute <= 0.13);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelContactNormal.absolute <= 0.007);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelVisualPosition.absolute <= 0.13);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSpinAngle.absolute <= 0.02);
  assert.ok(PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSteeringAngle.absolute <= 0.001);
});

test("Phase 3 drivetrain tolerances should derive from the versioned invariant registry", () => {
  assert.equal(PHYSICS_PHASE3_VEHICLE_TOLERANCES, PHYSICS_INVARIANT_REGISTRY.phase3VehicleComparison.vehicle);
  assert.equal(PHYSICS_PHASE3_OUTCOME_TOLERANCES, PHYSICS_INVARIANT_REGISTRY.phase3VehicleComparison.outcome);
  assert.ok(PHYSICS_PHASE3_VEHICLE_TOLERANCES.engineRpm.absolute < 500);
  assert.ok(PHYSICS_PHASE3_OUTCOME_TOLERANCES.longitudinalProgress.absolute < 5);
});

test("physics causal invariants should have one versioned cross-adapter owner", () => {
  assert.equal(PHYSICS_INVARIANT_REGISTRY.schema, "threenative.physics-invariant-registry");
  assert.match(PHYSICS_INVARIANT_REGISTRY.version, /^\d+\.\d+\.\d+$/);
  assert.equal(PHYSICS_INVARIANT_REGISTRY.staticLoad.settleSteps + PHYSICS_INVARIANT_REGISTRY.staticLoad.sampleWindowSteps, 600);
  assert.ok(PHYSICS_INVARIANT_REGISTRY.staticLoad.minTotalNormalLoadWeightRatio > 0);
  assert.ok(PHYSICS_INVARIANT_REGISTRY.staticLoad.maxTotalNormalLoadWeightRatio > 1);
  assert.ok(PHYSICS_INVARIANT_REGISTRY.staticLoad.maxRideHeightSpan > 0);
  assert.equal(PHYSICS_INVARIANT_REGISTRY.braking.initialSpeed * PHYSICS_INVARIANT_REGISTRY.braking.maxFinalSpeedRatio, 4);
  assert.equal(PHYSICS_INVARIANT_REGISTRY.braking.ticks * PHYSICS_INVARIANT_REGISTRY.braking.fixedDelta, 0.5);
});

test("vehicle speed observation has descriptor-owned Y-up ground-plane semantics", () => {
  const descriptor = PHYSICS_CAPABILITY_DESCRIPTORS.find((candidate) => candidate.component === "VehicleController");
  assert.equal(descriptor?.observationSemantics?.speed, "Y-up ground-plane linear-velocity magnitude; excludes vertical velocity");
});

test("physics surface combine should use deterministic Unity-style rule priority", () => {
  assert.equal(combinePhysicsSurfaceValues(0.5, "average", 0.8, "minimum"), 0.5);
  assert.equal(combinePhysicsSurfaceValues(0.5, "multiply", 0.8, "minimum"), 0.4);
  assert.equal(combinePhysicsSurfaceValues(0.5, "maximum", 0.8, "multiply"), 0.8);
});

test("vehicle limited-slip activation delta is descriptor-owned across adapters", async () => {
  assert.equal(PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta, 0.05);
  const [web, native] = await Promise.all([
    readFile(resolve(root, "packages/runtime-web-three/src/physicsVehicle.ts"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs"), "utf8"),
  ]);
  assert.match(web, /PHYSICS_CAPABILITY_LIMITS\.vehicleLimitedSlipActivationDelta/);
  assert.match(native, /LIMITED_SLIP_ACTIVATION_DELTA: f32 = 0\.05/);
});

test("vehicle grounded coupling grace is descriptor-owned across adapters", async () => {
  assert.equal(PHYSICS_CAPABILITY_LIMITS.vehicleGroundedCouplingGraceTicks, 1);
  const [web, native] = await Promise.all([
    readFile(resolve(root, "packages/runtime-web-three/src/physicsVehicle.ts"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs"), "utf8"),
  ]);
  assert.match(web, /PHYSICS_CAPABILITY_LIMITS\.vehicleGroundedCouplingGraceTicks/);
  assert.match(native, /GROUNDED_COUPLING_GRACE_TICKS: u32 = 1/);
});

test("vehicle shaft direction epsilon is descriptor-owned across adapters", async () => {
  assert.equal(PHYSICS_CAPABILITY_LIMITS.vehicleShaftDirectionEpsilon, 0.0001);
  const [web, native] = await Promise.all([
    readFile(resolve(root, "packages/runtime-web-three/src/physicsVehicle.ts"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs"), "utf8"),
  ]);
  assert.match(web, /PHYSICS_CAPABILITY_LIMITS\.vehicleShaftDirectionEpsilon/);
  assert.match(native, /SHAFT_DIRECTION_EPSILON: f32 = 0\.0001/);
});

test("should fail descriptor drift when an adapter consumer is absent", () => {
  const services = PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.map((descriptor) => descriptor.service);
  const bevyServices = PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.filter((descriptor) => (descriptor.adapters as readonly string[]).includes("bevy")).map((descriptor) => descriptor.service);
  const webServices = PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.filter((descriptor) => (descriptor.adapters as readonly string[]).includes("web")).map((descriptor) => descriptor.service);
  const runtimeFields = PHYSICS_CAPABILITY_DESCRIPTORS.flatMap((descriptor) => descriptor.runtimeFields.map((field) => `${descriptor.component}.${field}`));
  const consumers = {
    authoringOperations: ["physics.aerodynamics.add", "physics.compound.add", "physics.destructible.add", "physics.joint.add", "physics.vehicle.add", "physics.wheel.add", "physics.wind.add", "scene.set_component"],
    bevyComponents: ["AerodynamicBody", "WindVolume", "CompoundCollider", "Destructible", "PhysicsJoint", "PhysicsSurface", "TireModel", "WheelAssembly", "VehicleController"],
    bevyFields: runtimeFields,
    bevyHostServices: bevyServices,
    bevyRuntimeServices: bevyServices,
    bevyVisualComponents: ["WheelAssembly"],
    compilerComponents: ["AerodynamicBody", "WindVolume", "Destructible", "PhysicsJoint", "PhysicsSurface", "TireModel", "WheelAssembly", "VehicleController"],
    cookbookEntries: ["advanced-physics-aerodynamics", "advanced-physics-destruction"],
    fixtures: ["advanced-physics-aerodynamics", "advanced-physics-destruction", "advanced-physics-drivetrain", "advanced-physics-foundation", "advanced-physics-joints", "advanced-physics-wheels"],
    gates: ["advanced-physics-aerodynamics", "advanced-physics-destruction", "advanced-physics-drivetrain", "advanced-physics-joints", "advanced-physics-wheels", "physics-self-verification"],
    irComponents: ["AerodynamicBody", "WindVolume", "CompoundCollider", "Destructible", "PhysicsJoint", "PhysicsSurface", "TireModel", "WheelAssembly", "VehicleController"],
    irServices: services,
    sdkServices: services,
    sdkComponents: ["aerodynamicBody", "aerodynamicSurface", "thruster", "windVolume", "destructible", "physicsJoint", "physicsSurface", "tireModel", "wheelAssembly", "wheelControlInput", "vehicleController", "vehicleControllerInputs"],
    stdlibContexts: PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.map((descriptor) => descriptor.context),
    webComponents: ["AerodynamicBody", "WindVolume", "CompoundCollider", "Destructible", "PhysicsJoint", "PhysicsSurface", "TireModel", "WheelAssembly", "VehicleController"],
    webFields: runtimeFields,
    webHostServices: webServices,
    webRuntimeServices: webServices,
    webVisualComponents: ["WheelAssembly"],
  };

  assert.deepEqual(physicsDescriptorDrift(consumers), []);
  assert.ok(
    physicsDescriptorDrift({ ...consumers, bevyVisualComponents: [] }).includes("WheelAssembly missing bevyVisualComponents:WheelAssembly"),
    "removing native WheelAssembly visual consumption must fail the intended descriptor diagnostic",
  );
  assert.ok(
    physicsDescriptorDrift({ ...consumers, bevyFields: consumers.bevyFields.filter((field) => field !== "Destructible.impactFilter") })
      .includes("Destructible missing bevyFields:Destructible.impactFilter"),
    "removing one native public-field consumer must fail descriptor drift",
  );
  assert.ok(
    physicsDescriptorDrift({ ...consumers, cookbookEntries: consumers.cookbookEntries.filter((entry) => entry !== "advanced-physics-destruction") })
      .includes("Destructible missing cookbookEntries:advanced-physics-destruction"),
    "removing a descriptor-owned cookbook entry must fail descriptor drift",
  );
  for (const [group, values] of Object.entries(consumers)) {
    for (const value of values) {
      const drifted = { ...consumers, [group]: values.filter((candidate) => candidate !== value) };
      const baselineRequiresConsumer = physicsDescriptorDrift({ ...consumers, [group]: [] }).some((diagnostic) => diagnostic.includes(` missing ${group}:`));
      if (!baselineRequiresConsumer) continue;
      assert.ok(
        physicsDescriptorDrift(drifted).some((diagnostic) => diagnostic.endsWith(`missing ${group}:${value}`)),
        `removing ${group}:${value} must cause descriptor drift`,
      );
    }
  }
});

test("physics descriptors should match checked-in public contract adapter fixture and gate consumers", async () => {
  const [webPhysics, webJoints, webDestruction, webVehicle, webAerodynamics, sharedAerodynamics, webContext, webEffects, nativeMatrix, nativeBridge, nativeContext, nativeEffects, nativeLoader, nativePhysics, nativeJoints, nativeDestruction, nativeVehicle, nativeAerodynamics, nativeLib, authoring, compilerPhysics, irTypes, irSystems, sdkPhysics, sdkSystems, stdlibContext, foundationGate, wheelGate, drivetrainGate, aerodynamicsGate, jointsGate, destructionGate, catalogSource] = await Promise.all([
    readFile(resolve(root, "packages/runtime-web-three/src/physics.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/physicsJoints.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/physicsDestruction.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/physicsVehicle.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/physicsAerodynamics.ts"), "utf8"),
    readFile(resolve(root, "packages/ir/src/aerodynamicViability.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/systems/context.ts"), "utf8"),
    readFile(resolve(root, "packages/runtime-web-three/src/systems/effects.ts"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/scripting_host_matrix.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.js"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/systems_context.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/systems_effects.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_loader/src/types.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_joints.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_destruction.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_vehicle.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/physics_aerodynamics.rs"), "utf8"),
    readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/src/lib.rs"), "utf8"),
    readFile(resolve(root, "packages/authoring/src/operationRegistry.ts"), "utf8"),
    readFile(resolve(root, "packages/compiler/src/emit/physics.ts"), "utf8"),
    readFile(resolve(root, "packages/ir/src/types.ts"), "utf8"),
    readFile(resolve(root, "packages/ir/src/systems.ts"), "utf8"),
    readFile(resolve(root, "packages/sdk/src/physics.ts"), "utf8"),
    readFile(resolve(root, "packages/sdk/src/ecs/system.ts"), "utf8"),
    readFile(resolve(root, "packages/script-stdlib/src/script-context.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/physicsSelfVerification.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/advancedPhysicsWheels.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/advancedPhysicsDrivetrain.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/advancedPhysicsAerodynamics.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/advancedPhysicsJoints.ts"), "utf8"),
    readFile(resolve(root, "tools/verify/src/advancedPhysicsDestruction.ts"), "utf8"),
    readFile(resolve(root, "packages/ir/fixtures/conformance/fixture-catalog.json"), "utf8"),
  ]);
  const webAerodynamicRuntime = `${webAerodynamics}\n${sharedAerodynamics}`;
  const catalog = JSON.parse(catalogSource) as { fixtures: Array<{ aggregateGate: string; bundlePath: string; canonicalId: string }> };
  const cookbookEntries = (await readdir(resolve(root, "docs/cookbook")))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3));
  for (const descriptor of PHYSICS_CAPABILITY_DESCRIPTORS) {
    if (!("fixture" in descriptor)) continue;
    const fixture = catalog.fixtures.find((candidate) => candidate.canonicalId === descriptor.fixture);
    assert.ok(fixture, `fixture catalog must enroll ${descriptor.fixture}`);
    await access(resolve(root, fixture.bundlePath, "manifest.json"));
    await access(resolve(root, fixture.bundlePath, "world.ir.json"));
  }
  const services = PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.map((descriptor) => descriptor.service);
  const mutationServices = new Set<string>(PHYSICS_SCRIPT_SERVICE_DESCRIPTORS.filter((descriptor) => descriptor.mutation).map((descriptor) => descriptor.service));
  const fixtures = catalog.fixtures.map((fixture) => fixture.canonicalId);
  const gates = catalog.fixtures
    .map((fixture) => fixture.aggregateGate.replace(/^verify:/, ""))
    .filter((candidate) => foundationGate.includes(`const gate = "${candidate}"`) || wheelGate.includes(`const gate = "${candidate}"`) || drivetrainGate.includes(`conformance/${candidate}/game.bundle`) || aerodynamicsGate.includes(`conformance/${candidate}/game.bundle`) || jointsGate.includes(`conformance/${candidate}/game.bundle`) || destructionGate.includes(`conformance/${candidate}/game.bundle`));
  const nativeVisualSyncCount = nativeLib.match(/sync_physics_vehicle_visuals/g)?.length ?? 0;
  const webRuntimeSources: Readonly<Record<string, string>> = {
    AerodynamicBody: webAerodynamicRuntime,
    WindVolume: webAerodynamicRuntime,
    CompoundCollider: webPhysics,
    Destructible: webDestruction,
    PhysicsJoint: webJoints,
    PhysicsSurface: webVehicle,
    TireModel: webVehicle,
    WheelAssembly: webVehicle,
    VehicleController: webVehicle,
  };
  const nativeRuntimeSources: Readonly<Record<string, string>> = {
    AerodynamicBody: nativeAerodynamics,
    WindVolume: nativeAerodynamics,
    CompoundCollider: nativePhysics,
    Destructible: nativeDestruction,
    PhysicsJoint: nativeJoints,
    PhysicsSurface: nativeVehicle,
    TireModel: nativeVehicle,
    WheelAssembly: nativeVehicle,
    VehicleController: nativeVehicle,
  };
  const snakeCase = (value: string): string => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const consumedFields = (adapter: "bevy" | "web"): string[] => PHYSICS_CAPABILITY_DESCRIPTORS.flatMap((descriptor) => descriptor.runtimeFields
    .filter((field) => {
      const source = adapter === "web" ? webRuntimeSources[descriptor.component] : nativeRuntimeSources[descriptor.component];
      const token = adapter === "web" ? field : snakeCase(field);
      const occurrences = source?.match(new RegExp(`\\b${token}\\b`, "g"))?.length ?? 0;
      return occurrences >= (adapter === "bevy" && descriptor.component === "Destructible" ? 2 : 1);
    })
    .map((field) => `${descriptor.component}.${field}`));
  const consumers = {
    authoringOperations: [
      ...(authoring.includes("portablePhysicsComponentOperationEntries") ? ["physics.aerodynamics.add", "physics.compound.add", "physics.destructible.add", "physics.joint.add", "physics.vehicle.add", "physics.wheel.add"] : []),
      ...(authoring.includes('descriptor("physics.wind.add"') ? ["physics.wind.add"] : []),
      ...(authoring.includes('descriptor("scene.set_component"') ? ["scene.set_component"] : []),
    ],
    bevyComponents: [
      ...(nativeLoader.includes("pub aerodynamic_body: Option<AerodynamicBodyComponent>") && nativeAerodynamics.includes("aerodynamic_body") ? ["AerodynamicBody"] : []),
      ...(nativeLoader.includes("pub wind_volume: Option<WindVolumeComponent>") && nativeAerodynamics.includes("wind_volume") ? ["WindVolume"] : []),
      ...(nativeLoader.includes("pub compound_collider: Option<CompoundColliderComponent>") && nativePhysics.includes("compound_collider") ? ["CompoundCollider"] : []),
      ...(nativeDestruction.includes("pub struct Destructible") && nativeDestruction.includes("pub struct DestructionRuntime") ? ["Destructible"] : []),
      ...(nativeLoader.includes("pub physics_joint: Option<PhysicsJointComponent>") && nativeJoints.includes("PhysicsJointComponent") ? ["PhysicsJoint"] : []),
      ...(nativeLoader.includes("pub physics_surface: Option<PhysicsSurfaceComponent>") && nativeVehicle.includes("physics_surface") ? ["PhysicsSurface"] : []),
      ...(nativeLoader.includes("pub tire_model: Option<TireModelComponent>") && nativeVehicle.includes("tire_model") ? ["TireModel"] : []),
      ...(nativeLoader.includes("pub wheel_assembly: Option<WheelAssemblyComponent>") && nativeVehicle.includes("wheel_assembly") ? ["WheelAssembly"] : []),
      ...(nativeLoader.includes("pub vehicle_controller: Option<VehicleControllerComponent>") && nativeVehicle.includes("vehicle_controller") ? ["VehicleController"] : []),
    ],
    bevyFields: consumedFields("bevy"),
    bevyHostServices: services.filter((service) => nativeMatrix.includes(`\"${service}\"`) && nativeBridge.includes(`\"${service}\"`)),
    bevyRuntimeServices: services.filter((service) => mutationServices.has(service) ? nativeEffects.includes(`\"${service}\"`) : nativeContext.includes(`\"${service}\"`)),
    bevyVisualComponents: nativeVehicle.includes("observe_physics_vehicle_visuals") && nativeLib.includes("fn sync_physics_vehicle_visuals(") && nativeVisualSyncCount >= 2 ? ["WheelAssembly"] : [],
    compilerComponents: PHYSICS_CAPABILITY_DESCRIPTORS.filter((descriptor) => "compilerComponent" in descriptor && compilerPhysics.includes(`components.${descriptor.component}`)).map((descriptor) => descriptor.component),
    cookbookEntries,
    fixtures,
    gates,
    irComponents: PHYSICS_CAPABILITY_DESCRIPTORS.filter((descriptor) => irTypes.includes(`${descriptor.component}?: I`)).map((descriptor) => descriptor.component),
    irServices: services.filter((service) => irSystems.includes(`| "${service}"`)),
    sdkServices: services.filter((service) => sdkSystems.includes(`| "${service}"`)),
    sdkComponents: PHYSICS_CAPABILITY_DESCRIPTORS.flatMap((descriptor) => "sdkHelpers" in descriptor ? descriptor.sdkHelpers.filter((helper) => sdkPhysics.includes(`function ${helper}(`)) : []),
    stdlibContexts: PHYSICS_SCRIPT_SERVICE_DESCRIPTORS
      .filter((descriptor) => descriptor.context.endsWith(".setInputs") ? stdlibContext.includes(`${descriptor.context.split(".").at(-2)}:`) && stdlibContext.includes("setInputs(") : stdlibContext.includes(`${descriptor.context.slice("ctx.physics.".length)}(`))
      .map((descriptor) => descriptor.context),
    webComponents: [
      ...(webAerodynamicRuntime.includes("components.AerodynamicBody") ? ["AerodynamicBody"] : []),
      ...(webAerodynamicRuntime.includes("components.WindVolume") ? ["WindVolume"] : []),
      ...(webPhysics.includes("const compound = entity.components.CompoundCollider") && webPhysics.includes("compoundColliderDescs(compound)") ? ["CompoundCollider"] : []),
      ...(webDestruction.includes("IPhysicsDestructibleComponent") && webDestruction.includes("registerPhysicsDestructible") ? ["Destructible"] : []),
      ...(webJoints.includes("entity.components.PhysicsJoint") && webJoints.includes("createImpulseJoint") ? ["PhysicsJoint"] : []),
      ...(webVehicle.includes("components.PhysicsSurface") ? ["PhysicsSurface"] : []),
      ...(webVehicle.includes("components.TireModel") ? ["TireModel"] : []),
      ...(webVehicle.includes("components.WheelAssembly") ? ["WheelAssembly"] : []),
      ...(webVehicle.includes("components.VehicleController") ? ["VehicleController"] : []),
    ],
    webFields: consumedFields("web"),
    webHostServices: services.filter((service) => webContext.includes(`\"${service}\"`)),
    webRuntimeServices: services.filter((service) => mutationServices.has(service) ? webEffects.includes(`\"${service}\"`) : webContext.includes(`\"${service}\"`)),
    webVisualComponents: webVehicle.includes("observePhysicsVehicleVisuals") && webVehicle.includes("updatePhysicsVehicleVisuals") ? ["WheelAssembly"] : [],
  };
  const drift = physicsDescriptorDrift(consumers);
  assert.deepEqual(drift, []);
  const readinessRequirements = { authoringOperation: "physics.vehicle.add", component: "VehicleController", fixture: "advanced-physics-drivetrain", gate: "advanced-physics-drivetrain", sdkHelpers: ["vehicleController", "vehicleControllerInputs"], service: "physics.vehicle.setInputs" };
  assert.deepEqual(physicsPromotionReadinessDrift(readinessRequirements, consumers), []);
  for (const group of ["irComponents", "authoringOperations", "compilerComponents", "sdkComponents", "webComponents", "bevyComponents", "fixtures", "gates", "irServices", "sdkServices", "stdlibContexts", "webHostServices", "webRuntimeServices", "bevyHostServices", "bevyRuntimeServices"] as const) {
    const value = group === "authoringOperations"
      ? "physics.vehicle.add"
      : group === "sdkComponents"
        ? "vehicleController"
        : group === "fixtures" || group === "gates"
          ? "advanced-physics-drivetrain"
          : group === "stdlibContexts"
            ? "ctx.physics.vehicle.setInputs"
            : group.endsWith("Components")
              ? "VehicleController"
              : "physics.vehicle.setInputs";
    const withoutConsumer = { ...consumers, [group]: consumers[group].filter((candidate) => candidate !== value) };
    assert.ok(
      physicsPromotionReadinessDrift(readinessRequirements, withoutConsumer).some((diagnostic) => diagnostic.endsWith(`missing ${group}:${value}`)),
      `removing prospective ${group}:${value} must block VehicleController promotion readiness`,
    );
  }
  const withoutInputHelper = { ...consumers, sdkComponents: consumers.sdkComponents.filter((candidate) => candidate !== "vehicleControllerInputs") };
  assert.ok(physicsPromotionReadinessDrift(readinessRequirements, withoutInputHelper).includes("VehicleController missing sdkComponents:vehicleControllerInputs"));
  const nativeWithoutSyncCall = nativeLib.replace("sync_physics_vehicle_visuals", "removed_visual_sync");
  const withoutNativePresentationSync = { ...consumers, bevyVisualComponents: nativeVehicle.includes("observe_physics_vehicle_visuals") && nativeLib.includes("fn sync_physics_vehicle_visuals(") && (nativeWithoutSyncCall.match(/sync_physics_vehicle_visuals/g)?.length ?? 0) >= 2 ? ["WheelAssembly"] : [] };
  assert.ok(physicsDescriptorDrift(withoutNativePresentationSync).includes("WheelAssembly missing bevyVisualComponents:WheelAssembly"));
});
