export interface BundlePathValidationResult {
  message?: string;
  ok: boolean;
}

const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function validateBundleRelativePath(path: string): BundlePathValidationResult {
  if (path.length === 0) {
    return { ok: false, message: "Bundle path must be non-empty." };
  }
  if (URL_SCHEME.test(path)) {
    return { ok: false, message: `Bundle path '${path}' must not be a URL.` };
  }
  if (path.startsWith("/") || path.startsWith("\\")) {
    return { ok: false, message: `Bundle path '${path}' must be relative.` };
  }
  if (path.includes("\\")) {
    return { ok: false, message: `Bundle path '${path}' must use POSIX separators.` };
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return { ok: false, message: `Bundle path '${path}' must not contain empty, current, or parent segments.` };
  }
  return { ok: true };
}

export function assertBundleRelativePath(path: string): void {
  const result = validateBundleRelativePath(path);
  if (!result.ok) {
    throw new Error(result.message ?? `Invalid bundle path '${path}'.`);
  }
}
