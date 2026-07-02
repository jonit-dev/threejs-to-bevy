# Paper Plane Postmaster

Steer a paper plane across rooftop mail tables, collect stamps, deliver them to mailboxes, avoid gust fans, and land back on the green mat.

Proof entry points:

```bash
node ../../packages/cli/dist/index.js build --project . --json
node ../../packages/cli/dist/index.js playtest --project . --entity player --press KeyD --frames 30 --expect-moved --expect-axis x --json
node ../../packages/cli/dist/index.js game qa --project . --run-proof --json
node ../../packages/cli/dist/index.js game release --project . --json
```

