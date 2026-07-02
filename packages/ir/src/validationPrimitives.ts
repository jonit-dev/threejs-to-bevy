import type { IIrDiagnostic } from "./validate.js";

export function isNumberTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateOptionalFiniteNumber(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    diagnostics.push({ code, message: "Local data numeric setting bounds must be finite numbers.", path });
  }
}

export function validatePositiveVec3(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0)) {
    diagnostics.push({
      code,
      message: "Expected a three-component positive finite numeric vector.",
      path,
    });
  }
}

export function validateFiniteVec3(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    diagnostics.push({
      code,
      message: "Expected a three-component finite numeric vector.",
      path,
    });
  }
}

export function validateVec3(value: readonly number[], path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    diagnostics.push({
      code: "TN_IR_VEC3_INVALID",
      message: "Expected a three-component finite numeric vector.",
      path,
    });
  }
}

export function validateFiniteVec3Range(value: unknown, minimum: number, maximum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item < minimum || item > maximum)) {
    diagnostics.push({
      code,
      message: `Expected a three-component finite numeric vector with each value between ${minimum} and ${maximum}.`,
      path,
      severity: "error",
      suggestion: "Keep authored primitive body velocities inside the portable solver range.",
    });
  }
}

export function validateBooleanVec3(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "boolean")) {
    diagnostics.push({
      code,
      message: "Expected a three-component boolean vector.",
      path,
      severity: "error",
      suggestion: "Use [enableX, enableY, enableZ] boolean values.",
    });
  }
}

export function validatePositiveFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({
      code,
      message: "Expected a positive finite number.",
      path,
    });
  }
}

export function validateFiniteNumber(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push({
      code,
      message: "Expected a finite number.",
      path,
    });
  }
}

export function validateFiniteMinimum(value: unknown, minimum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    diagnostics.push({
      code,
      message: `Expected a finite number greater than or equal to ${minimum}.`,
      path,
    });
  }
}

export function validateFiniteRange(value: unknown, minimum: number, maximum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code,
      message: `Expected a finite number between ${minimum} and ${maximum}.`,
      path,
    });
  }
}

export function validateIntegerRange(value: unknown, minimum: number, maximum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code,
      message: `Expected an integer between ${minimum} and ${maximum}.`,
      path,
      severity: "error",
      suggestion: "Use a bounded deterministic solver iteration count.",
    });
  }
}

export function validateUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      diagnostics.push({
        code,
        message: `Duplicate id '${item.id}'.`,
        path: `${path}/${index}/id`,
        severity: "error",
        suggestion: `Rename or remove the duplicate '${item.id}' entry so IDs are unique within this section.`,
      });
    }
    seen.add(item.id);
  });
}
