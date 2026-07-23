import { runAdvancedPhysicsBenchmark } from "@threenative/runtime-web-three/advancedPhysicsBenchmark";

const report = await runAdvancedPhysicsBenchmark();
process.stdout.write(`${JSON.stringify(report)}\n`);
