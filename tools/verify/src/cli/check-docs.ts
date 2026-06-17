import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkDocs, formatDocsReport } from "../docs.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const json = process.argv.includes("--json");

const result = await checkDocs(repoRoot);
if (json) {
  process.stdout.write(`${JSON.stringify({ code: result.ok ? "TN_DOCS_OK" : "TN_DOCS_FAILED", ...result }, null, 2)}\n`);
} else {
  process.stdout.write(formatDocsReport(result));
}
process.exitCode = result.ok ? 0 : 1;

if (import.meta.url !== fileURLToPath(import.meta.url)) {
  // noop for bundlers
}
