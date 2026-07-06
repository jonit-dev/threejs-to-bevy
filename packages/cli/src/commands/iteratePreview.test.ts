import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { withIteratePreview } from "./iteratePreview.js";

test("should free the port when a later step throws", async () => {
  const server = createServer((_request, response) => {
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo | null;
  if (address === null) {
    throw new Error("server did not expose a TCP address");
  }
  const port = address.port;

  await assert.rejects(
    withIteratePreview("bundle", async () => {
      throw new Error("capture failed");
    }, async () => ({
      close: async () => {
        server.close();
        await once(server, "close");
      },
      url: `http://127.0.0.1:${port}`,
    })),
    /capture failed/,
  );

  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve());
    });
  });
});
