export interface IRuntimeSelectionOverlay {
  bounds?: { max: [number, number, number]; min: [number, number, number] };
  id: string;
  readOnly: true;
}

export function buildSelectionOverlay(input: { bounds?: { max: [number, number, number]; min: [number, number, number] }; id: string }): IRuntimeSelectionOverlay {
  return {
    ...(input.bounds === undefined ? {} : { bounds: input.bounds }),
    id: input.id,
    readOnly: true,
  };
}
