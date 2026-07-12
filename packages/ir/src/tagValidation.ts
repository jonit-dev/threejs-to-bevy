export const MAX_ENTITY_TAGS = 32;
export const MAX_ENTITY_TAG_LENGTH = 64;

export interface ITagValidationDiagnostic {
  code: string;
  message: string;
  path: string;
  severity?: "error" | "warning";
  suggestion?: string;
}

export function validateEntityTags(value: unknown, path: string, diagnostics: ITagValidationDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "TN_IR_ENTITY_TAGS_INVALID",
      message: "Entity tags must be an array of non-empty strings.",
      path,
      severity: "error",
      suggestion: "Use a bounded string array such as tags: ['coin', 'collectible'].",
    });
    return;
  }
  if (value.length > MAX_ENTITY_TAGS) {
    diagnostics.push({
      code: "TN_IR_ENTITY_TAGS_UNBOUNDED",
      message: `Entity tags must contain at most ${MAX_ENTITY_TAGS} values.`,
      path,
      severity: "error",
      suggestion: `Keep entity tags within the portable limit of ${MAX_ENTITY_TAGS}.`,
    });
  }
  const seen = new Set<string>();
  value.forEach((tag, index) => {
    if (typeof tag !== "string" || tag.trim() === "" || tag.length > MAX_ENTITY_TAG_LENGTH || /[\u0000-\u001f\u007f]/u.test(tag)) {
      diagnostics.push({
        code: "TN_IR_ENTITY_TAG_INVALID",
        message: `Entity tag at index ${index} must be a printable string of at most ${MAX_ENTITY_TAG_LENGTH} characters.`,
        path: `${path}/${index}`,
        severity: "error",
        suggestion: "Use short printable tag names without control characters.",
      });
      return;
    }
    if (seen.has(tag)) {
      diagnostics.push({
        code: "TN_IR_ENTITY_TAG_DUPLICATE",
        message: `Entity tag '${tag}' is duplicated.`,
        path: `${path}/${index}`,
        severity: "error",
        suggestion: "Keep each entity tag unique.",
      });
      return;
    }
    seen.add(tag);
  });
}
