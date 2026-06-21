export interface IPreviewSelectionTarget {
  runtimeId: string;
  sourceEntityId: string;
}

export function resolvePreviewSelection(
  sourceEntityId: string,
  provenance: { entities?: Array<{ runtimeId: string; sourceEntityId: string }> } | undefined,
): IPreviewSelectionTarget | undefined {
  return provenance?.entities?.find((entity) => entity.sourceEntityId === sourceEntityId);
}
