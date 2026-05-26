// tests/e2e/_net-helper.mjs
// Allocate a free TCP port on 127.0.0.1 — same pattern as
// tests/performance/shared.mjs:34. Replaces the fragile hardcoded port
// numbers (39145–39148) previously used by the PDF/CSV regression tests.

import { createServer } from "node:net";

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
