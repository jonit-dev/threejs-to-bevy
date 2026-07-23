// Generated from @threenative/authoring operation descriptors. Do not edit by hand.

export type AuthoringJsonValue = boolean | number | string | null | AuthoringJsonValue[] | { [key: string]: AuthoringJsonValue };
export type AuthoringJsonObject = { [key: string]: AuthoringJsonValue };
export type AuthoringVector3 = readonly [number, number, number];

export interface DistributionSetAppArgs {
  "appId": string;
  "displayName": string;
  "version"?: string;
  "buildNumber"?: number;
  "icons"?: string;
  "splash"?: string;
  "privacyPolicyUrl"?: string;
}

export interface DistributionSetTargetArgs {
  "platform": "web" | "windows" | "macos" | "linux" | "android" | "ios";
  "runtime": "web" | "bevy" | "webview";
  "formats": readonly ("static" | "zip" | "pwa" | "archive" | "nsis" | "app" | "dmg" | "tar" | "appimage" | "aab" | "apk" | "xcarchive" | "ipa")[];
  "architecture"?: "x86_64" | "arm64" | "universal" | "simulator";
  "capabilities"?: readonly ("camera" | "microphone" | "network" | "storage" | "gamepad" | "vibration")[];
  "channel"?: "development" | "direct" | "store";
  "minimumOs"?: string;
}

export interface ArchetypeApplyArgs {
  "archetype": string;
  "actorId": string;
  "asset"?: string;
  "sceneId"?: string;
  "speed"?: number;
  "sprintSpeed"?: number;
}

export interface ArchetypeUpdateArgs {
  "actorId": string;
  "set"?: AuthoringJsonObject;
}

export interface ArchetypeListArgs {
}

export interface AssetAddArgs {
  "assetId": string;
  "type": string;
  "path"?: string;
  "width"?: number;
  "height"?: number;
  "usage"?: string;
  "format"?: string;
  "sampleCount"?: number;
  "file"?: string;
}

export interface AudioCreateArgs {
  "audioDocId": string;
}

export interface AudioAddSoundArgs {
  "audioDocId": string;
  "soundId": string;
  "asset": string;
}

export interface EnvironmentCreateArgs {
  "environmentId": string;
}

export interface EnvironmentSetSkyboxArgs {
  "environmentId": string;
  "asset": string;
  "mode"?: string;
}

export interface EnvironmentSetMapArgs {
  "environmentId": string;
  "asset": string;
}

export interface EnvironmentSetVolumetricsArgs {
  "environmentId": string;
  "volumetrics": AuthoringJsonObject;
}

export interface EnvironmentSetLightProbeArgs {
  "environmentId": string;
  "probeId": string;
  "probe": AuthoringJsonObject;
}

export interface EnvironmentSetPathArgs {
  "environmentId": string;
  "path": AuthoringJsonValue;
}

export interface EnvironmentSetTerrainArgs {
  "environmentId": string;
  "terrainId"?: string;
  "heightMode"?: string;
  "heightmap"?: string;
  "bounds"?: AuthoringJsonObject;
}

export interface EnvironmentSetWalkabilityArgs {
  "environmentId": string;
  "walkability": AuthoringJsonValue;
}

export interface EnvironmentSetSourceAssetLodArgs {
  "environmentId": string;
  "sourceAssetId": string;
  "lod": AuthoringJsonValue;
}

export interface GeneratorRecordArgs {
  "generatorId": string;
  "modulePath": string;
  "exportName": string;
  "outputs": readonly string[];
  "overwritePolicy"?: string;
  "inputHash"?: string;
  "outputHash"?: string;
}

export interface GeneratorRecordBlenderArgs {
  "generatorId": string;
  "recipe"?: AuthoringJsonObject;
  "recipePath"?: string;
  "output": string;
  "overwritePolicy"?: "manual" | "replace" | "skip";
  "providerVersion"?: string;
  "requestedBudgets"?: AuthoringJsonObject;
}

export interface GeneratorRecordImg2threejsArgs {
  "generatorId": string;
  "recipePath": string;
  "output": string;
  "overwritePolicy"?: "manual" | "replace" | "skip";
}

export interface SceneCreateArgs {
  "sceneId": string;
  "file"?: string;
}

export interface ScenePlacementAddArgs {
  "sceneId": string;
  "placementId": string;
  "placement": AuthoringJsonObject;
}

export interface ScenePlacementInspectArgs {
  "sceneId": string;
  "placementId": string;
  "expand"?: boolean;
}

export interface ScenePlacementMigrateArgs {
  "sceneId": string;
  "placementId": string;
  "placement": AuthoringJsonObject;
}

export interface ScenePlacementApplyArgs {
  "sceneId": string;
  "placementId": string;
  "placement": AuthoringJsonObject;
}

export interface InputAddActionArgs {
  "inputDocId": string;
  "actionId": string;
  "keys": readonly string[];
}

export interface InputAddAxisArgs {
  "inputDocId": string;
  "axisId": string;
  "negativeKeys": readonly string[];
  "positiveKeys": readonly string[];
  "value"?: string;
}

export interface InputSetControlsArgs {
  "inputDocId": string;
  "profileId": string;
  "rows": readonly AuthoringJsonObject[];
}

export interface InputSetOverrideArgs {
  "inputDocId": string;
  "actionOrAxisId": string;
  "axisSlot"?: string;
  "control": string;
  "deadzone"?: number;
  "device": string;
  "modifiers"?: readonly string[];
  "profileId": string;
  "scale"?: number;
  "updatedAt"?: string;
}

export interface MaterialCreateArgs {
  "materialId": string;
}

export interface MaterialSetArgs {
  "materialId": string;
  "alphaCutoff"?: number;
  "alphaMode"?: "opaque" | "mask" | "blend";
  "baseColorTexture"?: string;
  "clearcoat"?: number;
  "clearcoatRoughness"?: number;
  "clearcoatRoughnessTexture"?: string;
  "clearcoatTexture"?: string;
  "color"?: string;
  "emissive"?: string;
  "emissiveIntensity"?: number;
  "emissiveTexture"?: string;
  "metallicRoughnessTexture"?: string;
  "metalness"?: number;
  "normalTexture"?: string;
  "occlusionTexture"?: string;
  "opacity"?: number;
  "roughness"?: number;
  "shader"?: AuthoringJsonObject;
  "transmission"?: number;
  "transmissionTexture"?: string;
}

export interface MeshCreatePrimitiveArgs {
  "meshId": string;
  "kind": string;
  "size"?: readonly number[];
  "file"?: string;
}

export interface MeshCreateCustomArgs {
  "meshId": string;
  "attributes": readonly AuthoringJsonObject[];
  "indices"?: readonly number[];
  "storage"?: string;
}

export interface PrefabCreateArgs {
  "prefabId": string;
}

export interface PrefabAddComponentArgs {
  "prefabId": string;
  "componentKind": string;
  "value": AuthoringJsonObject;
}

export interface PrefabSetDefaultsArgs {
  "prefabId": string;
  "componentKind": string;
  "value": AuthoringJsonObject;
}

export interface ProjectCreateArgs {
  "projectId": string;
  "authoringVersion"?: string;
  "sourceRoots"?: readonly string[];
  "buildTargets"?: readonly string[];
  "file"?: string;
}

export interface ResourcesCreateArgs {
  "resourcesDocId": string;
}

export interface ResourcesAddArgs {
  "resourcesDocId": string;
  "resourceId": string;
  "path"?: string;
  "value"?: AuthoringJsonValue;
}

export interface ResourcesSetArgs {
  "resourcesDocId": string;
  "resourceId": string;
  "path"?: string;
  "value"?: AuthoringJsonValue;
}

export interface FlowCreateArgs {
  "flowId": string;
  "initial": string;
  "scene"?: string;
}

export interface FlowAddStateArgs {
  "flowId": string;
  "stateId": string;
  "actions"?: readonly AuthoringJsonObject[];
}

export interface FlowAddTransitionArgs {
  "flowId": string;
  "transitionId": string;
  "from": string;
  "to": string;
  "trigger": AuthoringJsonObject;
  "actions"?: readonly AuthoringJsonObject[];
}

export interface SequenceCreateArgs {
  "sequenceId": string;
  "duration": number;
  "skippable"?: boolean;
}

export interface SequenceAddTrackArgs {
  "sequenceId": string;
  "trackId": string;
  "kind": string;
  "entity"?: string;
}

export interface SequenceAddKeyArgs {
  "sequenceId": string;
  "trackId": string;
  "time": number;
  "value"?: AuthoringJsonValue;
  "easing"?: string;
}

export interface SchemaCreateArgs {
  "schemaDocId": string;
  "kind": string;
}

export interface SchemaSetArgs {
  "schemaDocId": string;
  "schemaId": string;
  "kind": string;
  "fields": AuthoringJsonObject;
}

export interface RuntimeCreateArgs {
  "runtimeId": string;
  "renderProfile"?: string;
}

export interface RuntimeSetWindowArgs {
  "runtimeId": string;
  "height"?: number;
  "title"?: string;
  "width"?: number;
}

export interface RuntimeSetRenderingArgs {
  "runtimeId": string;
  "ambientOcclusionEnabled"?: boolean;
  "ambientOcclusionIntensity"?: number;
  "ambientOcclusionMode"?: "screen-space";
  "ambientOcclusionQuality"?: "low" | "medium" | "high";
  "ambientOcclusionRadius"?: number;
  "antialias"?: "none" | "msaa2" | "msaa4" | "msaa8" | "fxaa" | "taa" | "smaa";
  "bloomEnabled"?: boolean;
  "bloomIntensity"?: number;
  "bloomThreshold"?: number;
  "motionBlurEnabled"?: boolean;
  "motionBlurShutterAngle"?: number;
  "renderProfile"?: "parity" | "balanced" | "cinematic" | "stylized";
  "renderLookBloomIntensity"?: number;
  "renderLookContrast"?: number;
  "renderLookEnvironmentIntensity"?: number;
  "renderLookExposure"?: number;
  "renderLookSaturation"?: number;
  "renderLookShadowQuality"?: "off" | "low" | "medium" | "high";
  "renderPath"?: "forward";
  "screenSpaceGlobalIlluminationEnabled"?: boolean;
  "screenSpaceGlobalIlluminationIntensity"?: number;
  "screenSpaceGlobalIlluminationQuality"?: "low" | "medium" | "high";
  "screenSpaceGlobalIlluminationRadius"?: number;
  "screenSpaceReflectionsEnabled"?: boolean;
  "screenSpaceReflectionsQuality"?: "low" | "medium" | "high";
  "screenSpaceReflectionsRoughnessLimit"?: number;
}

export interface TargetSetProfileArgs {
  "targetProfileId": string;
  "targets": readonly string[];
  "budgets"?: AuthoringJsonObject;
  "performance"?: AuthoringJsonObject;
}

export interface SceneAddEntityArgs {
  "sceneId": string;
  "entityId": string;
  "prefabId"?: string;
}

export interface SceneRemoveEntityArgs {
  "sceneId": string;
  "entityId": string;
}

export interface SceneRemoveUiNodeArgs {
  "sceneId": string;
  "uiNodeId": string;
}

export interface SceneRemoveResourceArgs {
  "sceneId": string;
  "resourceId": string;
}

export interface SceneAddPrefabInstanceArgs {
  "sceneId": string;
  "instanceId": string;
  "prefabId": string;
  "position"?: AuthoringVector3;
  "rotation"?: AuthoringVector3;
  "scale"?: AuthoringVector3;
  "components"?: AuthoringJsonObject;
  "replace"?: boolean;
}

export interface SceneAddPrefabInstancesArgs {
  "sceneId": string;
  "prefabId": string;
  "positions": AuthoringJsonValue;
  "prefix"?: string;
  "components"?: AuthoringJsonObject;
}

export interface SceneLayoutTenPinArgs {
  "sceneId": string;
  "prefabId": string;
  "prefix"?: string;
  "origin"?: AuthoringVector3;
  "spacing"?: number;
  "replace"?: boolean;
}

export interface SceneAddGroupArgs {
  "sceneId": string;
  "groupId": string;
  "name"?: string;
  "position"?: AuthoringVector3;
}

export interface SceneAddPrefabArgs {
  "sceneId": string;
  "prefabId": string;
  "primitive"?: string;
  "color"?: string;
  "asset"?: string;
}

export interface SceneAddTagArgs {
  "sceneId": string;
  "entityId": string;
  "tag": string;
}

export interface SceneAddResourceArgs {
  "sceneId": string;
  "resourceId": string;
  "path"?: string;
  "value"?: AuthoringJsonValue;
}

export interface SceneAddUiNodeArgs {
  "sceneId": string;
  "uiNodeId": string;
}

export interface SceneSetTransformArgs {
  "sceneId": string;
  "entityId": string;
  "position"?: AuthoringVector3;
  "rotation"?: AuthoringVector3;
  "scale"?: AuthoringVector3;
}

export interface SceneSetCameraArgs {
  "sceneId": string;
  "cameraId": string;
  "mode": "third-person-follow" | "perspective" | "orthographic";
  "targetId": string;
  "fovY"?: number;
  "near"?: number;
  "far"?: number;
  "size"?: number;
}

export interface SceneSetComponentArgs {
  "sceneId": string;
  "entityId": string;
  "componentKind": string;
  "value": AuthoringJsonObject;
}

export interface SceneSetStylizedNatureArgs {
  "sceneId": string;
  "entityId": string;
  "size"?: number;
  "density"?: string;
  "grassCount"?: number;
  "treeCount"?: number;
  "pathWidth"?: number;
  "windStrength"?: number;
  "groundColor"?: string;
  "grassRootColor"?: string;
  "grassTipColor"?: string;
  "barkColor"?: string;
  "leafColor"?: string;
  "pathColor"?: string;
}

export interface SceneSetStylizedSparklesArgs {
  "sceneId": string;
  "entityId": string;
  "count"?: number;
  "radius"?: number;
  "height"?: number;
  "color"?: string;
  "secondaryColor"?: string;
  "size"?: number;
  "speed"?: number;
  "seed"?: number;
}

export interface SceneSetRippleWaterArgs {
  "sceneId": string;
  "entityId": string;
  "size"?: number;
  "color"?: string;
  "foamColor"?: string;
  "opacity"?: number;
  "rippleScale"?: number;
  "speed"?: number;
  "waveStrength"?: number;
}

export interface SceneSetCameraComponentArgs {
  "sceneId": string;
  "entityId": string;
  "mode"?: "third-person-follow" | "perspective" | "orthographic";
  "targetId"?: string;
  "fovY"?: number;
  "near"?: number;
  "far"?: number;
  "size"?: number;
}

export interface SceneSetLightArgs {
  "sceneId": string;
  "entityId": string;
  "kind"?: "ambient" | "directional" | "point" | "spot";
  "intensity"?: number;
  "color"?: string;
  "range"?: number;
  "angle"?: number;
  "shadowBias"?: number;
  "shadowNormalBias"?: number;
}

export interface SceneSetLifecycleArgs {
  "sceneId": string;
  "kind"?: string;
  "activation"?: string;
  "initial"?: boolean;
}

export interface SceneSetPrefabArgs {
  "sceneId": string;
  "prefabId": string;
  "asset"?: string;
  "color"?: string;
  "primitive"?: string;
}

export interface SceneSetMeshRendererArgs {
  "sceneId": string;
  "entityId": string;
  "mesh": string;
  "material": string;
  "visible"?: boolean;
  "castShadow"?: boolean;
  "receiveShadow"?: boolean;
}

export interface SceneSetRenderLayersArgs {
  "sceneId": string;
  "entityId": string;
  "layers": readonly string[];
}

export interface SceneSetRigidBodyArgs {
  "sceneId": string;
  "entityId": string;
  "kind"?: "dynamic" | "kinematic" | "static";
  "mass"?: number;
  "damping"?: number;
  "gravityScale"?: number;
}

export interface PhysicsCompoundAddArgs {
  "sceneId": string;
  "entityId": string;
  "collider": AuthoringJsonObject;
}

export interface PhysicsCompoundSetArgs {
  "sceneId": string;
  "entityId": string;
  "collider": AuthoringJsonObject;
}

export interface PhysicsCompoundRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsCompoundInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsCompoundValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsWheelAddArgs {
  "sceneId": string;
  "entityId": string;
  "assembly": AuthoringJsonObject;
}

export interface PhysicsWheelSetArgs {
  "sceneId": string;
  "entityId": string;
  "assembly": AuthoringJsonObject;
}

export interface PhysicsWheelRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsWheelInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsWheelValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsVehicleAddArgs {
  "sceneId": string;
  "entityId": string;
  "controller": AuthoringJsonObject;
}

export interface PhysicsVehicleSetArgs {
  "sceneId": string;
  "entityId": string;
  "controller": AuthoringJsonObject;
}

export interface PhysicsVehicleRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsVehicleInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsVehicleValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsAerodynamicsAddArgs {
  "sceneId": string;
  "entityId": string;
  "body": AuthoringJsonObject;
}

export interface PhysicsAerodynamicsSetArgs {
  "sceneId": string;
  "entityId": string;
  "body": AuthoringJsonObject;
}

export interface PhysicsAerodynamicsRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsAerodynamicsInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsAerodynamicsValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsJointAddArgs {
  "sceneId": string;
  "entityId": string;
  "joint": AuthoringJsonObject;
}

export interface PhysicsJointSetArgs {
  "sceneId": string;
  "entityId": string;
  "joint": AuthoringJsonObject;
}

export interface PhysicsJointRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsJointInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsJointValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsDestructibleAddArgs {
  "sceneId": string;
  "entityId": string;
  "destructible": AuthoringJsonObject;
}

export interface PhysicsDestructibleSetArgs {
  "sceneId": string;
  "entityId": string;
  "destructible": AuthoringJsonObject;
}

export interface PhysicsDestructibleRemoveArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsDestructibleInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsDestructibleValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsWindAddArgs {
  "sceneId": string;
  "entityId": string;
  "volume": AuthoringJsonObject;
}

export interface PhysicsWindInspectArgs {
  "sceneId": string;
  "entityId": string;
}

export interface PhysicsWindValidateArgs {
  "sceneId": string;
  "entityId": string;
}

export interface SceneSetSpawnerArgs {
  "sceneId": string;
  "entityId": string;
  "prefab": string;
  "mode"?: string;
  "enabled"?: boolean;
  "interval"?: number;
  "waveSize"?: number;
  "maxAlive"?: number;
  "maxTotal"?: number;
  "jitterSeed"?: number;
  "area"?: AuthoringJsonObject;
  "despawnPolicy"?: AuthoringJsonObject;
}

export interface SceneSetColliderArgs {
  "sceneId": string;
  "entityId": string;
  "kind"?: "box" | "capsule" | "cylinder" | "mesh" | "sphere";
  "size"?: AuthoringVector3;
  "center"?: AuthoringVector3;
  "radius"?: number;
  "height"?: number;
  "trigger"?: boolean;
}

export interface SceneSetCharacterControllerArgs {
  "sceneId": string;
  "entityId": string;
  "moveXAxis"?: string;
  "moveZAxis"?: string;
  "speed"?: number;
  "blocking"?: boolean;
  "grounding"?: "none" | "raycast";
  "slopeLimit"?: number;
  "stepOffset"?: number;
}

export interface SceneSetVisibilityArgs {
  "sceneId": string;
  "entityId": string;
  "visible"?: boolean;
}

export interface SceneRemoveComponentArgs {
  "sceneId": string;
  "entityId": string;
  "componentKind": string;
}

export interface SceneSetResourceArgs {
  "sceneId": string;
  "resourceId": string;
  "path"?: string;
  "value"?: AuthoringJsonValue;
}

export interface SceneAttachScriptArgs {
  "sceneId": string;
  "systemId": string;
  "modulePath": string;
  "exportName": string;
  "source"?: string;
}

export interface SceneBindUiArgs {
  "sceneId": string;
  "uiNodeId": string;
  "resourcePath": string;
}

export interface UiCreateArgs {
  "uiDocId": string;
}

export interface UiAddTextArgs {
  "uiDocId": string;
  "nodeId": string;
  "text": string;
}

export interface UiAddNodeArgs {
  "uiDocId": string;
  "nodeId": string;
  "type": string;
  "action"?: string;
  "label"?: string;
  "src"?: string;
  "text"?: string;
  "value"?: number;
}

export interface UiAddComponentArgs {
  "uiDocId": string;
  "nodeId": string;
  "componentId": string;
  "props"?: AuthoringJsonObject;
}

export interface UiApplyRecipeArgs {
  "uiDocId": string;
  "recipe": string;
  "recipeId"?: string;
  "actions"?: AuthoringJsonObject;
  "bindings"?: AuthoringJsonObject;
  "props"?: AuthoringJsonObject;
}

export interface UiRemoveComponentArgs {
  "uiDocId": string;
  "nodeId": string;
}

export interface UiSetLayoutArgs {
  "uiDocId": string;
  "nodeId": string;
  "justify"?: string;
  "align"?: string;
  "top"?: number;
  "height"?: number;
  "width"?: number;
}

export interface UiBindArgs {
  "uiDocId": string;
  "nodeId": string;
  "resourcePath": string;
}

export interface UiSetStyleArgs {
  "uiDocId": string;
  "nodeId": string;
  "backgroundColor"?: string;
  "borderColor"?: string;
  "borderRadius"?: number;
  "borderWidth"?: number;
  "color"?: string;
  "fontSize"?: number;
  "fontWeight"?: string;
  "opacity"?: number;
  "textAlign"?: string;
  "textDecoration"?: string;
  "wrap"?: boolean;
}

export interface SystemCreateArgs {
  "systemId": string;
  "schedule": string;
}

export interface SystemAttachScriptArgs {
  "systemId": string;
  "modulePath": string;
  "exportName": string;
  "file"?: string;
}

export interface SystemSetMetadataArgs {
  "systemId": string;
  "file"?: string;
  "after"?: readonly string[];
  "before"?: readonly string[];
  "commands"?: readonly AuthoringJsonObject[];
  "eventReads"?: readonly string[];
  "eventWrites"?: readonly string[];
  "queries"?: readonly AuthoringJsonObject[];
  "reads"?: readonly string[];
  "resourceReads"?: readonly string[];
  "resourceWrites"?: readonly string[];
  "schedule"?: string;
  "services"?: readonly string[];
  "writes"?: readonly string[];
}

export interface AuthoringOperationArgsMap {
  "distribution.set_app": DistributionSetAppArgs;
  "distribution.set_target": DistributionSetTargetArgs;
  "archetype.apply": ArchetypeApplyArgs;
  "archetype.update": ArchetypeUpdateArgs;
  "archetype.list": ArchetypeListArgs;
  "asset.add": AssetAddArgs;
  "audio.create": AudioCreateArgs;
  "audio.add_sound": AudioAddSoundArgs;
  "environment.create": EnvironmentCreateArgs;
  "environment.set_skybox": EnvironmentSetSkyboxArgs;
  "environment.set_map": EnvironmentSetMapArgs;
  "environment.set_volumetrics": EnvironmentSetVolumetricsArgs;
  "environment.set_light_probe": EnvironmentSetLightProbeArgs;
  "environment.set_path": EnvironmentSetPathArgs;
  "environment.set_terrain": EnvironmentSetTerrainArgs;
  "environment.set_walkability": EnvironmentSetWalkabilityArgs;
  "environment.set_source_asset_lod": EnvironmentSetSourceAssetLodArgs;
  "generator.record": GeneratorRecordArgs;
  "generator.record_blender": GeneratorRecordBlenderArgs;
  "generator.record_img2threejs": GeneratorRecordImg2threejsArgs;
  "scene.create": SceneCreateArgs;
  "scene.placement_add": ScenePlacementAddArgs;
  "scene.placement_inspect": ScenePlacementInspectArgs;
  "scene.placement_migrate": ScenePlacementMigrateArgs;
  "scene.placement_apply": ScenePlacementApplyArgs;
  "input.add_action": InputAddActionArgs;
  "input.add_axis": InputAddAxisArgs;
  "input.set_controls": InputSetControlsArgs;
  "input.set_override": InputSetOverrideArgs;
  "material.create": MaterialCreateArgs;
  "material.set": MaterialSetArgs;
  "mesh.create_primitive": MeshCreatePrimitiveArgs;
  "mesh.create_custom": MeshCreateCustomArgs;
  "prefab.create": PrefabCreateArgs;
  "prefab.add_component": PrefabAddComponentArgs;
  "prefab.set_defaults": PrefabSetDefaultsArgs;
  "project.create": ProjectCreateArgs;
  "resources.create": ResourcesCreateArgs;
  "resources.add": ResourcesAddArgs;
  "resources.set": ResourcesSetArgs;
  "flow.create": FlowCreateArgs;
  "flow.add_state": FlowAddStateArgs;
  "flow.add_transition": FlowAddTransitionArgs;
  "sequence.create": SequenceCreateArgs;
  "sequence.add_track": SequenceAddTrackArgs;
  "sequence.add_key": SequenceAddKeyArgs;
  "schema.create": SchemaCreateArgs;
  "schema.set": SchemaSetArgs;
  "runtime.create": RuntimeCreateArgs;
  "runtime.set_window": RuntimeSetWindowArgs;
  "runtime.set_rendering": RuntimeSetRenderingArgs;
  "target.set_profile": TargetSetProfileArgs;
  "scene.add_entity": SceneAddEntityArgs;
  "scene.remove_entity": SceneRemoveEntityArgs;
  "scene.remove_ui_node": SceneRemoveUiNodeArgs;
  "scene.remove_resource": SceneRemoveResourceArgs;
  "scene.add_prefab_instance": SceneAddPrefabInstanceArgs;
  "scene.add_prefab_instances": SceneAddPrefabInstancesArgs;
  "scene.layout_ten_pin": SceneLayoutTenPinArgs;
  "scene.add_group": SceneAddGroupArgs;
  "scene.add_prefab": SceneAddPrefabArgs;
  "scene.add_tag": SceneAddTagArgs;
  "scene.add_resource": SceneAddResourceArgs;
  "scene.add_ui_node": SceneAddUiNodeArgs;
  "scene.set_transform": SceneSetTransformArgs;
  "scene.set_camera": SceneSetCameraArgs;
  "scene.set_component": SceneSetComponentArgs;
  "scene.set_stylized_nature": SceneSetStylizedNatureArgs;
  "scene.set_stylized_sparkles": SceneSetStylizedSparklesArgs;
  "scene.set_ripple_water": SceneSetRippleWaterArgs;
  "scene.set_camera_component": SceneSetCameraComponentArgs;
  "scene.set_light": SceneSetLightArgs;
  "scene.set_lifecycle": SceneSetLifecycleArgs;
  "scene.set_prefab": SceneSetPrefabArgs;
  "scene.set_mesh_renderer": SceneSetMeshRendererArgs;
  "scene.set_render_layers": SceneSetRenderLayersArgs;
  "scene.set_rigid_body": SceneSetRigidBodyArgs;
  "physics.compound.add": PhysicsCompoundAddArgs;
  "physics.compound.set": PhysicsCompoundSetArgs;
  "physics.compound.remove": PhysicsCompoundRemoveArgs;
  "physics.compound.inspect": PhysicsCompoundInspectArgs;
  "physics.compound.validate": PhysicsCompoundValidateArgs;
  "physics.wheel.add": PhysicsWheelAddArgs;
  "physics.wheel.set": PhysicsWheelSetArgs;
  "physics.wheel.remove": PhysicsWheelRemoveArgs;
  "physics.wheel.inspect": PhysicsWheelInspectArgs;
  "physics.wheel.validate": PhysicsWheelValidateArgs;
  "physics.vehicle.add": PhysicsVehicleAddArgs;
  "physics.vehicle.set": PhysicsVehicleSetArgs;
  "physics.vehicle.remove": PhysicsVehicleRemoveArgs;
  "physics.vehicle.inspect": PhysicsVehicleInspectArgs;
  "physics.vehicle.validate": PhysicsVehicleValidateArgs;
  "physics.aerodynamics.add": PhysicsAerodynamicsAddArgs;
  "physics.aerodynamics.set": PhysicsAerodynamicsSetArgs;
  "physics.aerodynamics.remove": PhysicsAerodynamicsRemoveArgs;
  "physics.aerodynamics.inspect": PhysicsAerodynamicsInspectArgs;
  "physics.aerodynamics.validate": PhysicsAerodynamicsValidateArgs;
  "physics.joint.add": PhysicsJointAddArgs;
  "physics.joint.set": PhysicsJointSetArgs;
  "physics.joint.remove": PhysicsJointRemoveArgs;
  "physics.joint.inspect": PhysicsJointInspectArgs;
  "physics.joint.validate": PhysicsJointValidateArgs;
  "physics.destructible.add": PhysicsDestructibleAddArgs;
  "physics.destructible.set": PhysicsDestructibleSetArgs;
  "physics.destructible.remove": PhysicsDestructibleRemoveArgs;
  "physics.destructible.inspect": PhysicsDestructibleInspectArgs;
  "physics.destructible.validate": PhysicsDestructibleValidateArgs;
  "physics.wind.add": PhysicsWindAddArgs;
  "physics.wind.inspect": PhysicsWindInspectArgs;
  "physics.wind.validate": PhysicsWindValidateArgs;
  "scene.set_spawner": SceneSetSpawnerArgs;
  "scene.set_collider": SceneSetColliderArgs;
  "scene.set_character_controller": SceneSetCharacterControllerArgs;
  "scene.set_visibility": SceneSetVisibilityArgs;
  "scene.remove_component": SceneRemoveComponentArgs;
  "scene.set_resource": SceneSetResourceArgs;
  "scene.attach_script": SceneAttachScriptArgs;
  "scene.bind_ui": SceneBindUiArgs;
  "ui.create": UiCreateArgs;
  "ui.add_text": UiAddTextArgs;
  "ui.add_node": UiAddNodeArgs;
  "ui.add_component": UiAddComponentArgs;
  "ui.apply_recipe": UiApplyRecipeArgs;
  "ui.remove_component": UiRemoveComponentArgs;
  "ui.set_layout": UiSetLayoutArgs;
  "ui.bind": UiBindArgs;
  "ui.set_style": UiSetStyleArgs;
  "system.create": SystemCreateArgs;
  "system.attach_script": SystemAttachScriptArgs;
  "system.set_metadata": SystemSetMetadataArgs;
}

export type GeneratedAuthoringOperationName = keyof AuthoringOperationArgsMap;
export type AuthoringOperationArgs<TName extends GeneratedAuthoringOperationName> = AuthoringOperationArgsMap[TName];
export type AuthoringOperationCallArgs<TName extends GeneratedAuthoringOperationName> = {} extends AuthoringOperationArgs<TName>
  ? [args?: AuthoringOperationArgs<TName>]
  : [args: AuthoringOperationArgs<TName>];

