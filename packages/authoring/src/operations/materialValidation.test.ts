import assert from "node:assert/strict";
import test from "node:test";

import type { IAuthoringDiagnostic } from "../diagnostics.js";
import { validateMaterialDeclaration } from "./materialValidation.js";

test("should accept unlit material kind", () => {
  const diagnostics: IAuthoringDiagnostic[] = [];
  validateMaterialDeclaration(diagnostics, "content/materials/board.materials.json", "/materials/0", {
    color: "#ffffff",
    id: "mat.board",
    kind: "unlit",
  });
  assert.deepEqual(diagnostics, []);
});
