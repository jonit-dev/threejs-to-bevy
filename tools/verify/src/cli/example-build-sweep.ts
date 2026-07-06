import { runExampleBuildSweep } from "../exampleBuildSweep.js";

const result = await runExampleBuildSweep();
console.log(JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2));
process.exit(result.ok ? 0 : 1);
