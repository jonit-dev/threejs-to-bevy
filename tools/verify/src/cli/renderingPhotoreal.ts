import { runPhotorealRenderingGate } from "../renderingPhotoreal.js";

const metricsIndex = process.argv.indexOf("--metrics");
const metricsPath = metricsIndex === -1 ? undefined : process.argv[metricsIndex + 1];
const result = await runPhotorealRenderingGate({ metricsPath });

process.stdout.write(`${JSON.stringify({
  code: result.ok ? "TN_VERIFY_RENDERING_PHOTOREAL_OK" : "TN_VERIFY_RENDERING_PHOTOREAL_FAILED",
  diagnostics: result.diagnostics,
  ok: result.ok,
  reportPath: result.artifacts.reportPath,
}, null, 2)}\n`);
process.exitCode = result.ok ? 0 : 1;
