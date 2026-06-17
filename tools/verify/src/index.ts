import { resolveScriptAlias, formatDeprecationDiagnostic } from "./legacyAliases.js";

export { checkDocs, formatDocsReport } from "./docs.js";
export { loadFixtureCatalog, resolveFixtureId, listCurrentFixtures } from "./conformance.js";
export { runLegacyScriptAlias, resolveScriptAlias, formatDeprecationDiagnostic, listDeprecatedScriptAliases } from "./legacyAliases.js";
export { runReleaseGate } from "./release.js";
export {
  runCommand,
  runStep,
  stepFailureDiagnostic,
  summarize,
  type CommandOptions,
  type CommandResult,
  type StepSummary,
  type VerificationDiagnostic,
  type VerificationReport,
} from "./runner.js";
export { runPackageTests } from "./runTests.js";

export function printScriptAliasWarning(scriptName: string): void {
  const resolution = resolveScriptAlias(scriptName);
  if (resolution.deprecated) {
    process.stderr.write(formatDeprecationDiagnostic(resolution));
  }
}
