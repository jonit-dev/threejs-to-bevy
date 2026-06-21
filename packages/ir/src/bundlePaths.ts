export interface BundlePathValidationResult {
  message?: string;
  ok: boolean;
}

const URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Checks whether a path is safe to use inside a portable bundle.
 *
 * Bundle paths must be non-empty POSIX-relative paths with no URL scheme,
 * absolute prefix, empty segment, current directory, or parent directory.
 */
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

/**
 * Throws when a bundle path is not portable.
 *
 * Use this in emitters and authoring tools when invalid paths should stop
 * generation immediately instead of returning a diagnostic object.
 */
export function assertBundleRelativePath(path: string): void {
  const result = validateBundleRelativePath(path);
  if (!result.ok) {
    throw new Error(result.message ?? `Invalid bundle path '${path}'.`);
  }
}
