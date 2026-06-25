import { useEffect, useMemo, type ReactNode } from "react";
import { Box, Camera, FolderOpen, Gamepad2, Image, Lightbulb, MessageSquare, Mountain, PackagePlus, Pause, Play, Save, Settings, Square, Trash2 } from "lucide-react";
import type { IEditorGamepadViewerSnapshot } from "@threenative/ir";

import type { IEditorAdapterInput, IEditorAddComponentDefinition, IEditorAssetRow, IEditorModalActionDefinition, IEditorPropertyRow, IEditorShellModel } from "./adapters/editorModel.js";
import { createEditorShellModel, EDITOR_MODAL_ACTION_DEFINITIONS } from "./adapters/editorModel.js";
import { PanelShell } from "./components/layout/PanelShell.js";
import { HierarchyPanel } from "./components/panels/HierarchyPanel.js";
import { InspectorPanel } from "./components/panels/InspectorPanel.js";
import { EditorViewport3d, type EditorViewportGizmoMode, type IViewportTransform } from "./preview/EditorViewport3d.js";
import { useEditorStore, type EditorModal } from "./state/editorStore.js";

export interface IEditorAppProps {
  model?: IEditorAdapterInput | IEditorShellModel;
  onAddComponent?: (definition: IEditorAddComponentDefinition) => void;
  onAddObject?: (action: IEditorModalActionDefinition) => void;
  onBuildPreview?: () => void;
  onCreateScene?: () => void;
  onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void;
  onMoveRow?: (draggedId: string, targetId: string) => void;
  onSaveScene?: () => void;
  onSelectRow?: (id: string) => void;
  onTransformObject?: (rowId: string, transform: IViewportTransform) => void;
  toolbarSlot?: ReactNode;
}

const EDITOR_GIZMO_MODE_BUTTONS: Array<{ key: "E" | "R" | "W"; label: string; mode: EditorViewportGizmoMode }> = [
  { key: "W", label: "Move", mode: "translate" },
  { key: "E", label: "Rotate", mode: "rotate" },
  { key: "R", label: "Scale", mode: "scale" },
];

const PLAYBACK_UNAVAILABLE_REASON = "Playback controls require a promoted preview runtime state operation before they are enabled.";
const DELETE_ACTION = modalActionDefinition("delete.selection");
const SETTINGS_ACTION = modalActionDefinition("settings.editor");

export function EditorApp({ model: input, onAddComponent, onAddObject, onBuildPreview, onCreateScene, onEditProperty, onMoveRow, onSaveScene, onSelectRow, onTransformObject, toolbarSlot }: IEditorAppProps) {
  const modal = useEditorStore((state) => state.modal);
  const gizmoMode = useEditorStore((state) => state.gizmoMode);
  const setGizmoMode = useEditorStore((state) => state.setGizmoMode);
  const browserGamepads = useEditorStore((state) => state.browserGamepads);
  const setBrowserGamepads = useEditorStore((state) => state.setBrowserGamepads);
  const openModal = useEditorStore((state) => state.openModal);
  const closeModal = useEditorStore((state) => state.closeModal);
  const model = useMemo(() => createEditorShellModel(input), [input]);
  const objectCount = countTreeRows(model.hierarchy);
  const statusMessage = model.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "Needs attention" : "Ready";
  const gamepadDevices = mergeGamepadDevices(model.gamepadViewer.devices, browserGamepads);
  const connectedGamepads = gamepadDevices.filter((device) => device.status === "connected");
  const gamepadStatus = connectedGamepads.length > 0
    ? `${connectedGamepads.length} Connected`
    : model.gamepadViewer.controls.length > 0
      ? `${model.gamepadViewer.controls.length} Declared`
      : "No Controls";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }
      const mode = gizmoModeFromKey(event.key);
      if (mode === undefined) {
        return;
      }
      event.preventDefault();
      setGizmoMode(mode);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setGizmoMode]);
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return;
    }
    const updateGamepads = () => {
      const devices = Array.from(navigator.getGamepads())
        .filter((gamepad): gamepad is Gamepad => gamepad !== null)
        .map((gamepad) => ({
          axes: gamepad.axes.length,
          buttons: gamepad.buttons.length,
          id: gamepad.id,
          index: gamepad.index,
          mapping: gamepad.mapping || "unknown",
          status: "connected" as const,
        }));
      setBrowserGamepads(devices);
    };
    const handleConnectionChange = () => updateGamepads();
    window.addEventListener("gamepadconnected", handleConnectionChange);
    window.addEventListener("gamepaddisconnected", handleConnectionChange);
    updateGamepads();
    const interval = window.setInterval(updateGamepads, 500);
    return () => {
      window.removeEventListener("gamepadconnected", handleConnectionChange);
      window.removeEventListener("gamepaddisconnected", handleConnectionChange);
      window.clearInterval(interval);
    };
  }, [setBrowserGamepads]);
  return (
    <main className="tn-editor-shell">
      <header className="tn-editor-menubar" aria-label="Main menu">
        {["File", "Edit", "GameObject", "Window", "Settings"].map((item) => (
          <button key={item} type="button">{item}</button>
        ))}
      </header>

      <header className="tn-editor-topbar">
        <div className="tn-editor-brand">
          <div className="tn-editor-brand__mark" aria-hidden="true"><Box size={15} /></div>
          <div>
            <strong>ThreeNative</strong>
            <span>Editor v0.1.0</span>
          </div>
        </div>
        <div className="tn-editor-topbar__divider" />
        <div className="tn-editor-badges" aria-label="Project status">
          <span className="tn-editor-badge tn-editor-badge--cyan">{objectCount} Objects</span>
          <span className={`tn-editor-badge tn-editor-badge--${model.status === "error" ? "red" : "green"}`}>{statusMessage}</span>
          <span className="tn-editor-badge tn-editor-badge--cyan"><Gamepad2 size={13} /> {gamepadStatus}</span>
          <span className="tn-editor-badge tn-editor-badge--purple">Scene: {model.projectName}</span>
        </div>
        <div className="tn-editor-playback" aria-label="Playback controls">
          <button className="tn-editor-icon-button tn-editor-icon-button--play" disabled title={PLAYBACK_UNAVAILABLE_REASON} type="button"><Play size={16} /></button>
          <button className="tn-editor-icon-button" disabled title={PLAYBACK_UNAVAILABLE_REASON} type="button"><Pause size={15} /></button>
          <button className="tn-editor-icon-button tn-editor-icon-button--stop" disabled title={PLAYBACK_UNAVAILABLE_REASON} type="button"><Square size={14} /></button>
        </div>
        <div className="tn-editor-topbar__actions">
          {toolbarSlot}
          <div className="tn-editor-action-icons" aria-label="Editor actions">
            <button className="tn-editor-action-icons__add" onClick={() => openModal("addObject")} title="Add" type="button"><Box size={15} /> <span>Add</span></button>
            <button onClick={() => openModal("save")} title="Save" type="button"><Save size={16} /></button>
            <button onClick={() => openModal("newScene")} title="New scene" type="button"><FolderOpen size={16} /></button>
            <button aria-label="Delete" onClick={() => openModal("delete")} title={DELETE_ACTION.readOnlyReason} type="button"><Trash2 size={16} /></button>
            <button aria-label="Settings" onClick={() => openModal("settings")} title={SETTINGS_ACTION.readOnlyReason} type="button"><Settings size={16} /></button>
            <button onClick={() => openModal("build")} title="Build preview" type="button"><Image size={16} /></button>
          </div>
        </div>
      </header>

      <div className="tn-editor-workspace">
        <aside className="tn-editor-left-rail">
          <PanelShell title="Hierarchy" meta={`${model.hierarchy.length}`}>
            <HierarchyPanel rows={model.hierarchy} selectedRowId={model.selectedRowId} onMoveRow={onMoveRow} onSelectRow={onSelectRow} />
          </PanelShell>
          <PanelShell title="Inspector" meta={`${model.inspector.length}`}>
            <InspectorPanel onAddComponent={() => openModal("addComponent")} onEditProperty={onEditProperty} rows={model.inspector} />
          </PanelShell>
        </aside>
        <section className="tn-editor-preview" aria-label="Preview">
          <EditorViewport3d environment={model.environment} gizmoMode={gizmoMode} objects={model.sceneObjects} selectedRowId={model.selectedRowId} onSelectObject={onSelectRow} onTransformObject={onTransformObject} />
          <div className="tn-editor-viewport-label">
            <span />
            <strong>Viewport</strong>
            <small>Entity {model.selectedRowId === undefined ? "-" : model.selectedRowId.split(":").pop()}</small>
          </div>
          <div className="tn-editor-gizmo-switcher" aria-label="Gizmo mode">
            {EDITOR_GIZMO_MODE_BUTTONS.map((button) => (
              <button
                aria-pressed={gizmoMode === button.mode}
                className={gizmoMode === button.mode ? "tn-editor-gizmo-switcher__active" : undefined}
                key={button.mode}
                onClick={() => setGizmoMode(button.mode)}
                title={`${button.label} gizmo mode`}
                type="button"
              >
                {button.label} <kbd>{button.key}</kbd>
              </button>
            ))}
          </div>
          {gamepadDevices.length > 0 || model.gamepadViewer.controls.length > 0 ? (
            <div className="tn-editor-gamepad-overlay" aria-label="Gamepad inspection">
              <GamepadViewerPanel controls={model.gamepadViewer.controls} devices={gamepadDevices} requiredControls={model.gamepadViewer.requiredControls} />
            </div>
          ) : null}
          {model.status === "empty" ? (
            <div className="tn-editor-preview__message">
              <h1>Preview</h1>
              <p>No project data loaded.</p>
            </div>
          ) : null}
        </section>
        <aside className="tn-editor-right-rail">
          <div className="tn-editor-ai-channel" aria-label="AI chat channel">
            <button className="tn-editor-ai-channel__toggle" title="Collapse AI chat" type="button">&lt;</button>
            <button className="tn-editor-ai-channel__tab" onClick={() => openModal("chat")} title="AI chat" type="button">
              <MessageSquare aria-hidden="true" size={16} />
              <span>AI</span>
            </button>
          </div>
          <PanelShell title="Assets" meta={`${model.assets.length}`}>
            {model.assets.length === 0 ? (
              <p className="tn-editor-empty">No assets loaded.</p>
            ) : (
              <ul className="tn-editor-list">
                {model.assets.map((asset) => (
                  <li key={asset.id}>
                    <span>{asset.label}</span>
                    <small>{asset.kind ?? asset.access}</small>
                  </li>
                ))}
              </ul>
            )}
          </PanelShell>
          <PanelShell title="Diagnostics" meta={`${model.diagnostics.length}`}>
            {model.diagnostics.length === 0 ? (
              <p className="tn-editor-empty">No diagnostics.</p>
            ) : (
              <ul className="tn-editor-list">
                {model.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.code}:${diagnostic.path ?? diagnostic.file ?? diagnostic.message}:${index}`}>
                    <span>{diagnostic.message}</span>
                    <small>{diagnostic.code}</small>
                  </li>
                ))}
              </ul>
            )}
          </PanelShell>
          <PanelShell title="Gamepad" meta={`${gamepadDevices.length}`}>
            <GamepadViewerPanel controls={model.gamepadViewer.controls} devices={gamepadDevices} requiredControls={model.gamepadViewer.requiredControls} />
          </PanelShell>
        </aside>
      </div>
      <footer className="tn-editor-statusbar">
        <span><i className="tn-editor-status-dot" /> {statusMessage}</span>
        <span>60 FPS</span>
        <span>128MB</span>
        <span>WebGL</span>
        <span>Gamepad: <strong>{gamepadStatus}</strong></span>
        <span className="tn-editor-statusbar__spacer" />
        <span>{model.lod.mode.toUpperCase()} {model.lod.precision.toUpperCase()}</span>
        <span>TERRAIN</span>
        <span>LOD: <strong>{model.lod.selected}</strong></span>
        <span>Triangles: <strong>{formatNumber(model.lod.loadedTriangles)}</strong> / {formatNumber(model.lod.triangleCount)} / {formatNumber(model.lod.budget)} {model.lod.loading ? "(Loading)" : "(Good)"}</span>
        <span>{objectCount} Entities</span>
        {model.statusItems.map((item) => <span key={item.id}>{item.label}: {item.value}</span>)}
      </footer>
      <EditorModalView
        addComponentDefinitions={model.addComponentDefinitions}
        attachedComponents={[...new Set(model.inspector.map((row) => row.component).filter((component): component is string => component !== undefined))]}
        assets={model.assets}
        modal={modal}
        onAddObject={(action) => {
          closeModal();
          onAddObject?.(action);
        }}
        onAddComponent={(definition) => {
          closeModal();
          onAddComponent?.(definition);
        }}
        onBuildPreview={() => {
          closeModal();
          onBuildPreview?.();
        }}
        onClose={closeModal}
        onCreateScene={() => {
          closeModal();
          onCreateScene?.();
        }}
        onSaveScene={() => {
          closeModal();
          onSaveScene?.();
        }}
      />
    </main>
  );
}

function GamepadViewerPanel({
  controls,
  devices,
  requiredControls,
}: {
  controls: readonly IEditorGamepadViewerSnapshot["controls"][number][];
  devices: readonly IEditorGamepadViewerSnapshot["devices"][number][];
  requiredControls: readonly string[];
}) {
  const connected = devices.filter((device) => device.status === "connected");
  return (
    <div className="tn-editor-gamepad-viewer">
      <div className="tn-editor-gamepad-viewer__summary">
        <Gamepad2 aria-hidden="true" size={16} />
        <span>{connected.length > 0 ? `${connected.length} connected` : `${controls.length} declared controls`}</span>
      </div>
      {devices.length === 0 ? (
        <p className="tn-editor-empty">No gamepad controls declared.</p>
      ) : (
        <ul className="tn-editor-list">
          {devices.map((device) => (
            <li key={`${device.status}:${device.index ?? "declared"}:${device.id}`}>
              <span>{device.id}</span>
              <small>{gamepadDeviceLabel(device)}</small>
            </li>
          ))}
        </ul>
      )}
      {controls.length > 0 ? (
        <small className="tn-editor-gamepad-viewer__controls">
          {controls.map((control) => `${control.owner}:${control.control}`).join(", ")}
        </small>
      ) : null}
      {requiredControls.length > 0 ? (
        <small className="tn-editor-gamepad-viewer__required">Required: {requiredControls.join(", ")}</small>
      ) : null}
    </div>
  );
}

function gamepadDeviceLabel(device: IEditorGamepadViewerSnapshot["devices"][number]): string {
  if (device.status === "connected") {
    return `${device.mapping ?? "unknown"} mapping, ${device.buttons ?? 0} buttons, ${device.axes ?? 0} axes`;
  }
  return device.status;
}

function mergeGamepadDevices(
  declaredDevices: readonly IEditorGamepadViewerSnapshot["devices"][number][],
  connectedDevices: readonly IEditorGamepadViewerSnapshot["devices"][number][],
): IEditorGamepadViewerSnapshot["devices"] {
  if (connectedDevices.length > 0) {
    return [...connectedDevices].sort(compareGamepadDevices);
  }
  return [...declaredDevices].sort(compareGamepadDevices);
}

function compareGamepadDevices(left: IEditorGamepadViewerSnapshot["devices"][number], right: IEditorGamepadViewerSnapshot["devices"][number]): number {
  return `${left.status}:${left.index ?? -1}:${left.id}`.localeCompare(`${right.status}:${right.index ?? -1}:${right.id}`);
}

function gizmoModeFromKey(key: string): EditorViewportGizmoMode | undefined {
  switch (key.toLowerCase()) {
    case "e":
      return "rotate";
    case "r":
      return "scale";
    case "w":
      return "translate";
    default:
      return undefined;
  }
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function EditorModalView({
  addComponentDefinitions,
  assets,
  attachedComponents,
  modal,
  onAddComponent,
  onAddObject,
  onBuildPreview,
  onClose,
  onCreateScene,
  onSaveScene,
}: {
  addComponentDefinitions: IEditorShellModel["addComponentDefinitions"];
  assets: readonly IEditorAssetRow[];
  attachedComponents: readonly string[];
  modal: EditorModal;
  onAddComponent: (definition: IEditorAddComponentDefinition) => void;
  onAddObject: (action: IEditorModalActionDefinition) => void;
  onBuildPreview: () => void;
  onClose: () => void;
  onCreateScene: () => void;
  onSaveScene: () => void;
}) {
  if (modal === undefined) {
    return null;
  }
  if (modal === "addObject") {
    const actionById = new Map(EDITOR_MODAL_ACTION_DEFINITIONS.map((action) => [action.id, action]));
    const primitive = actionById.get("add.primitive_sphere");
    const empty = actionById.get("add.empty_entity");
    const camera = actionById.get("add.camera");
    const light = actionById.get("add.light");
    const terrain = actionById.get("add.terrain");
    const customGlb = actionById.get("add.custom_glb");
    const modelAssets = assets.filter((asset) => asset.path !== undefined && (asset.path.endsWith(".glb") || asset.path.endsWith(".gltf") || asset.kind === "model"));
    return (
      <ModalFrame onClose={onClose} title="Add Object">
        <div className="tn-editor-modal-grid">
          {primitive === undefined ? null : <button onClick={() => onAddObject(primitive)} title={primitive.operationName} type="button"><PackagePlus size={16} /> Primitive Sphere</button>}
          {empty === undefined ? null : <button disabled={empty.readOnly} onClick={() => onAddObject(empty)} title={empty.readOnly ? empty.readOnlyReason : empty.operationName} type="button"><Box size={16} /> Empty Entity</button>}
          {camera === undefined ? null : <button disabled={camera.readOnly} onClick={() => onAddObject(camera)} title={camera.readOnly ? camera.readOnlyReason : camera.operationName} type="button"><Camera size={16} /> Camera</button>}
          {light === undefined ? null : <button disabled={light.readOnly} onClick={() => onAddObject(light)} title={light.readOnly ? light.readOnlyReason : light.operationName} type="button"><Lightbulb size={16} /> Light</button>}
          {terrain === undefined ? null : <button disabled={terrain.readOnly} onClick={() => onAddObject(terrain)} title={terrain.readOnly ? terrain.readOnlyReason : terrain.operationName} type="button"><Mountain size={16} /> Terrain</button>}
          {customGlb === undefined
            ? null
            : modelAssets.length === 0
              ? <button disabled title={customGlb.readOnlyReason} type="button"><FolderOpen size={16} /> Custom GLB</button>
              : modelAssets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => onAddObject({ ...customGlb, assetPath: asset.path, featureStatus: "enabled", label: asset.label, operationName: "scene.add_prefab", readOnly: false, readOnlyReason: undefined })}
                    title={asset.path}
                    type="button"
                  >
                    <FolderOpen size={16} /> {asset.label}
                  </button>
                ))}
        </div>
      </ModalFrame>
    );
  }
  if (modal === "addComponent") {
    return (
      <ModalFrame onClose={onClose} title="Add Component">
        <div className="tn-editor-modal-grid">
          {addComponentDefinitions.map((definition) => (
            <button
              disabled={definition.readOnlyReason !== undefined || attachedComponents.includes(definition.component) || definition.incompatibleWith.some((component) => attachedComponents.includes(component))}
              key={definition.component}
              onClick={() => onAddComponent(definition)}
              title={`Pack: ${definition.pack}; defaults: ${JSON.stringify(definition.defaults)}${definition.readOnlyReason === undefined ? "" : `; ${definition.readOnlyReason}`}`}
              type="button"
            >
              <PackagePlus size={16} /> {definition.component}
            </button>
          ))}
        </div>
      </ModalFrame>
    );
  }
  if (modal === "save") {
    return (
      <ModalFrame onClose={onClose} title="Save Scene">
        <p>Persist structured source documents for the current project.</p>
        <button className="tn-editor-modal-primary" onClick={onSaveScene} type="button">Save</button>
      </ModalFrame>
    );
  }
  if (modal === "newScene") {
    return (
      <ModalFrame onClose={onClose} title="New Scene">
        <p>Create a source-backed scene seeded with Main Camera, Directional Light, and Ambient Light.</p>
        <button className="tn-editor-modal-primary" onClick={onCreateScene} type="button">Create Scene</button>
      </ModalFrame>
    );
  }
  if (modal === "build") {
    return (
      <ModalFrame onClose={onClose} title="Build Preview">
        <p>Build the current source project into the editor preview bundle.</p>
        <button className="tn-editor-modal-primary" onClick={onBuildPreview} type="button">Build</button>
      </ModalFrame>
    );
  }
  if (modal === "chat") {
    return (
      <ModalFrame onClose={onClose} title="AI Chat">
        <textarea aria-label="AI chat message" placeholder="Ask the editor agent..." readOnly />
      </ModalFrame>
    );
  }
  return (
    <ModalFrame onClose={onClose} title={modal === "settings" ? "Settings" : "Delete"}>
      <p>{modal === "settings" ? SETTINGS_ACTION.readOnlyReason : DELETE_ACTION.readOnlyReason}</p>
    </ModalFrame>
  );
}

function modalActionDefinition(id: IEditorModalActionDefinition["id"]): IEditorModalActionDefinition {
  const action = EDITOR_MODAL_ACTION_DEFINITIONS.find((candidate) => candidate.id === id);
  if (action === undefined) {
    throw new Error(`Missing editor modal action definition ${id}`);
  }
  return action;
}

function ModalFrame({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="tn-editor-modal-backdrop" role="presentation">
      <section aria-label={title} className="tn-editor-modal" role="dialog">
        <header>
          <strong>{title}</strong>
          <button aria-label={`Close ${title}`} onClick={onClose} type="button">x</button>
        </header>
        <div className="tn-editor-modal__body">{children}</div>
      </section>
    </div>
  );
}

function countTreeRows(rows: readonly { children?: readonly unknown[] }[]): number {
  return rows.reduce((total, row) => total + 1 + countTreeRows((row.children ?? []) as readonly { children?: readonly unknown[] }[]), 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
