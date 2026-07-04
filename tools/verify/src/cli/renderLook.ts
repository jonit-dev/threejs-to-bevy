import { runRenderLookGate } from "../renderLook.js";

const metricsIndex = process.argv.indexOf("--metrics");
const metricsPath = metricsIndex === -1 ? undefined : process.argv[metricsIndex + 1];
const result = await runRenderLookGate({ metricsPath });

process.stdout.write(`${JSON.stringify({
  code: result.ok ? "TN_VERIFY_RENDER_LOOK_OK" : "TN_VERIFY_RENDER_LOOK_FAILED",
  contactSheetPath: result.contactSheetPath,
  diagnostics: result.diagnostics,
  ok: result.ok,
  reportPath: result.reportPath,
}, null, 2)}\n`);
process.exitCode = result.ok ? 0 : 1;
