export { startWebPreview, type IWebPreviewServer } from "./devServer.js";
export {
  createWebAudioElementSink,
  createWebAudioRuntime,
  traceWebAudioSupport,
  traceWebAudioLifecycle,
  type IWebAudioCommand,
  type IWebAudioElement,
  type IWebAudioElementSink,
  type IWebAudioLifecycleTrace,
  type IWebAudioRuntime,
  type IWebAudioSink,
  type IWebAudioSupportTrace,
} from "./audio.js";
export { loadBundle, validateAndLoadBundle, WebBundleValidationError, type IWebBundle } from "./loadBundle.js";
export { reportWebConformance } from "./conformance.js";
export { applyEnvironmentBookmark, createEnvironmentRuntime, loadEnvironmentAssetInstances, observeEnvironmentScene, traceEnvironmentContent, type IEnvironmentObservation, type IEnvironmentRuntime } from "./environment.js";
export { buildInstancingPlan, type IInstancingGroup, type IInstancingPlan } from "./instancing.js";
export { collectPerformanceSummary, summarizeFrameTimings, type IFrameTimingSummary, type IPerformanceMetricSummary } from "./performanceMetrics.js";
export { renderDebugOverlay, type IWebDebugCounter, type IWebDebugDrawPrimitive, type IWebDebugOverlayInput, type IWebDebugOverlayModel, type IWebDebugOverlayRow } from "./debugOverlay.js";
export { renderEditorInspectorPanels, type IEditorInspectorPanelModel } from "./editor/inspector.js";
export { applyAtmosphereProfile, observeAtmosphereProfile, type IAtmosphereObservation } from "./rendering.js";
export { createGameLoopState, runGameFrame, setPaused, type IGameLoopState } from "./gameLoop.js";
export { createInteractionRuntimeState, runInteractionFixedTick, type IInteractionRuntimeState, type IInteractionTickResult, type IInteractionTrace } from "./interactions.js";
export { applySceneServiceEffects, createSceneLifecycleManager, traceSceneLifecycle, type ISceneLifecycleManager, type ISceneLifecycleOperation, type ISceneLifecycleRuntimeState, type ISceneLifecycleTraceEvent } from "./sceneManager.js";
export { traceRenderTransition, type IRenderTransitionDiagnostic, type IRenderTransitionTrace, type IRenderTransitionTraceInput } from "./renderTransitions.js";
export { buildEditorGizmoOverlay, createAxisGizmo, createWireBoxGizmo, createWireSphereGizmo, gizmoToBufferGeometry, type EditorGizmoKind, type IEditorGizmoOverlay, type IGizmoGeometry, type IGizmoLine } from "./gizmoGeometry.js";
export { applyPersistedBindingOverrides, attachInputListeners, createInputState, createTouchGestureRecognizer, loadPersistedBindingOverrides, persistBindingOverride, rebindInput, reportGamepadCapabilities, savePersistedBindingOverrides, type IControlsSettingsStorage, type IGamepadCapabilityReport, type IInputRebindDiagnostic, type IInputRebindResult, type InputRebindTarget, type ITouchGestureEvent, type ITouchGestureFrame, type ITouchGesturePoint, type ITouchGestureRecognizer, type IWebInputState, type IWebInputStateOptions } from "./input.js";
export { traceCharacterControllers, type ICharacterTraceInput, type ICharacterTraceObservation } from "./character.js";
export { queryNavigationPath, traceNavigationPaths, type INavigationPathRequest, type INavigationPathResult } from "./navigation.js";
export { createFirstPersonState, updateFirstPersonController, type IFirstPersonControllerState } from "./firstPerson.js";
export { traceGameFlow, type IGameFlowTraceAction, type IGameFlowTraceFrame, type IGameFlowTraceInput } from "./gameFlow.js";
export { traceSequences, type ISequenceTraceFrame, type ISequenceTraceInput, type ISequenceTraceObservation } from "./sequences.js";
export { hasKinematicMovers, stepKinematicMovers, type IKinematicMoverObservation } from "./kinematicMover.js";
export { resetPatrolState, stepPatrols, type IPatrolObservation } from "./patrol.js";
export { resetStateMachines, stepStateMachines, type IStateMachineObservation } from "./stateMachines.js";
export { createCountdownRuntimeState, resetCountdowns, stepCountdowns, type ICountdownObservation, type ICountdownRuntimeState } from "./countdowns.js";
export { hasSpawners, stepSpawners, type ISpawnerObservation } from "./spawner.js";
export { resolveWebAssets, traceAssetLoadSynchronization, type IAssetLoadTrace, type IAssetLoadTraceAsset, type IAssetLoadTraceGltfScene, type IResolvedWebAsset } from "./assets.js";
export { advanceAnimationPlayback, mapWorld, syncMeshRendererMaterials, syncTransforms, traceEmissiveBloomContributions, type IRuntimeDiagnostic, type IThreeWorld, type IWebEmissiveBloomObservation } from "./mapWorld.js";
export { selectMeshLodLevel, traceWebMeshLod, updateWebMeshLod, type IWebMeshLodSelection } from "./meshLod.js";
export { aabbIntersectsAabb, meshAabb, meshBoundingSphere, sampleMeshPoints, sphereIntersectsSphere, type IAabb, type IBoundingSphere } from "./meshBounds.js";
export { ease, sampleCatmullRom, sampleCubicBezier, sampleLine, sampleQuadraticBezier, type EasingKind } from "./pathSampling.js";
export { stepPhysics, tracePhysicsJoints, traceRigidBodyPrimitive, type IPhysicsEventPayload, type IPhysicsJointObservation, type IRigidBodyTraceInput, type IRigidBodyTraceObservation } from "./physics.js";
export { createPhysicsSensorRuntimeState, tracePhysicsSensors, type IPhysicsSensorAdvanceOptions, type IPhysicsSensorEvent, type IPhysicsSensorRuntimeState, type IPhysicsSensorTraceInput } from "./sensors.js";
export { interpolateQuat, interpolateTransform, interpolateVec3, smoothDampVec3, type ITransformSample } from "./transformInterpolation.js";
export { resolveWalkableMovement, type IWalkabilityResolution } from "./walkability.js";
export { renderUi, type IRenderedUi, type IRenderedUiNode } from "./ui/renderUi.js";
export { createWebDragPickingRecognizer, resolveTopPickingTarget, type IWebDragPickingEvent, type IWebDragPickingFrame, type IWebDragPickingRecognizer, type IWebPickingDebugOverlayReport, type IWebPickingTarget, type IWebPickingVec2, type IWebPickingVec3 } from "./picking/drag.js";
export { traceUiNavigation, type IUiNavigationTrace, type IUiNavigationTraceInput } from "./ui/navigation.js";
export { traceUiAttachments, type IUiAttachmentProjectionTrace } from "./ui/attachments.js";
export { traceUiEffects, type IUiEffectTrace } from "./ui/effects.js";
export { traceWebUiTextEdit, type IUiTextEditFrame, type IUiTextEditTrace, type UiTextEditOperation } from "./ui/textInputTrace.js";
export { createUiDomOverlay, type IUiDomOverlay } from "./ui/domOverlay.js";
export { createUiAccessibilitySnapshot, createUiDebugOverlayReport, type IUiAccessibilitySnapshot, type IUiAccessibilitySnapshotNode, type IUiDebugOverlayReport } from "./ui/debugOverlay.js";
export { reportWebUiParityBehavior, type IUiParityBehaviorReport } from "./ui/parityEvidence.js";
export { createRenderedParticleObjects, renderLoadedBundle, type IRenderResult, type IWebRuntimePerformanceSnapshot } from "./render.js";
export { renderBundle } from "./renderBundle.js";
export {
  createSystemContext,
  componentHookObservations,
  evaluateStates,
  propagateObserverEvent,
  applyCommands,
  type IComponentHookObservation,
  type IObserverPropagationStep,
  type ISystemContext,
} from "./systems/context.js";
export { applySystemEffects, validateSystemEffects, type ISystemEffects } from "./systems/effects.js";
export { createRuntimeWriteLedger, type IRuntimeWriteLedger, type IRuntimeWriteRecordInput } from "./systems/writeAudit.js";
export { createSystemEffectLog, serializeSystemEffectLog, stableSystemEffectLog, type ISystemEffectLog, type ISystemEffectLogEntry } from "./systems/log.js";
export {
  createWebPersistenceService,
  type IPersistenceLoadResult,
  type IPersistenceSaveRecord,
  type IPersistenceSaveResult,
  type IWebPersistenceService,
} from "./systems/services/persistence.js";
export { loadSystemModule } from "./systems/moduleLoader.js";
export { runSchedule, type ISystemModule, type ISystemRunResult, type SystemFunction } from "./systems/runner.js";
export {
  AnimationRuntimeController,
  advanceAnimationPlaybackState,
  sampleTransformAnimations,
  traceAnimationGraphs,
  type IAnimationRuntimeState,
  type IAnimationPlaybackState,
  type IAnimationTraceInput,
  type IAnimationTraceObservation,
  type ITransformAnimationSample,
} from "./animation.js";
export {
  traceAnimationPhysicsResiduals,
  type IAnimationMaskObservation,
  type IAnimationPhysicsResidualReport,
  type ICrowdObservation,
  type IMorphTargetObservation,
  type IOffMeshLinkObservation,
} from "./animationPhysicsResiduals.js";
export {
  traceInputUiPolish,
  type IInputUiPolishDiagnostic,
  type IInputUiPolishDisabledUpdate,
  type IInputUiPolishGamepadReport,
  type IInputUiPolishNarration,
  type IInputUiPolishReport,
  type IInputUiPolishRichText,
  type IInputUiPolishScrollObservation,
  type IInputUiPolishTouchEvent,
  type IInputUiPolishVirtualKeyboard,
} from "./inputUiPolish.js";
export {
  tracePersistenceReload,
  type IPersistenceAutosaveObservation,
  type IPersistenceReloadBoundary,
  type IPersistenceReloadDiagnostic,
  type IPersistenceReloadPolicyObservation,
  type IPersistenceReloadReport,
  type IPersistenceRestoreObservation,
  type IPersistenceStorageObservation,
} from "./persistenceReload.js";
export {
  traceProductionHardening,
  type IProductionHardeningReport,
} from "./productionHardening.js";
export {
  traceRenderingResiduals,
  type IRenderingResidualsReport,
} from "./renderingResiduals.js";
export {
  reportWebWindowCatalogPolicy,
  reportWebDisabledEntityQueryParticipation,
  reportWebGeneratedAssetPolicy,
  traceWebQueryCombinations,
  traceWebTextInputEvents,
  type IWebDisabledEntityQueryParticipationReport,
  type IWebGeneratedAssetPolicyReport,
  type IWebQueryCombinationObservation,
  type IWebTextInputEvent,
  type IWebWindowPolicyReport,
} from "./bevyCatalogResiduals.js";
export {
  traceRuntimeGameplayHost,
  type IRuntimeGameplayHostReport,
} from "./runtimeGameplayHost.js";
export {
  traceRuntimeQueryDiffing,
  type IRuntimeQueryDiffingReport,
} from "./runtimeQueryDiffing.js";
export {
  traceRuntimePrefabsHierarchy,
  type IRuntimePrefabsHierarchyReport,
} from "./runtimePrefabsHierarchy.js";
export {
  traceUiPersistenceSettingsFacades,
  type IUiPersistenceSettingsFacadesReport,
} from "./uiPersistenceSettingsFacades.js";
