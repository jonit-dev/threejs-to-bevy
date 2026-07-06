import { runPackageTests } from "@threenative/verify-tools/runTests";

process.exitCode = runPackageTests(new URL("..", import.meta.url).pathname, { buildCommand: ["true"] });
