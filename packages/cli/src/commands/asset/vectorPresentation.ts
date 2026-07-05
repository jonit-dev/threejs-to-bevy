export function rotateXZ(point: [number, number], yawRadians: number): [number, number] {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return [round(cos * point[0] + sin * point[1]), round(-sin * point[0] + cos * point[1])];
}

export function formatVec(vec: readonly number[]): string {
  return `[${vec.map((value) => round(value)).join(", ")}]`;
}

export function formatVec2(vec: readonly [number, number]): string {
  return `[${vec.map((value) => round(value)).join(", ")}]`;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
