import type { IEditorInspectorSnapshot } from "@threenative/ir";

export interface IEditorInspectorPanelModel {
  assetPreview: { assets: string[]; selected?: string };
  gamepadViewer: { connected: number; devices: string[] };
  hierarchy: IEditorInspectorSnapshot["hierarchy"];
  properties: IEditorInspectorSnapshot["editableProperties"];
  sceneViewer: { gizmoCount: number; rootNodeCount: number };
  tabs: string[];
}

export function renderEditorInspectorPanels(
  snapshot: IEditorInspectorSnapshot,
  options: { connectedGamepads?: readonly string[]; selectedAsset?: string } = {},
): IEditorInspectorPanelModel {
  const devices = [...(options.connectedGamepads ?? [])].sort((left, right) => left.localeCompare(right));
  return {
    assetPreview: {
      assets: [...snapshot.assetRefs],
      ...(options.selectedAsset === undefined ? {} : { selected: options.selectedAsset }),
    },
    gamepadViewer: {
      connected: devices.length,
      devices,
    },
    hierarchy: snapshot.hierarchy,
    properties: snapshot.editableProperties,
    sceneViewer: {
      gizmoCount: snapshot.hierarchy.reduce((count, node) => count + node.components.length, 0),
      rootNodeCount: snapshot.hierarchy.length,
    },
    tabs: ["hierarchy", "properties", "sceneViewer", "assetPreview", "gamepadViewer"],
  };
}
