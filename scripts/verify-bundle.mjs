import { Worker } from "node:worker_threads";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { PDF } from "@libpdf/core";
// Execute the production worker bundle in an isolated worker runtime, not Vite's source loader.
const name = readdirSync("dist/assets").find((name) =>
  /^pdf\.worker-[\w-]+\.js$/.test(name),
);
if (!name) throw new Error("Production export worker was not emitted.");
const url = pathToFileURL(resolve("dist/assets", name)).href;
const pdf = PDF.create();
pdf
  .addPage({ width: 600, height: 800 })
  .drawText("Production bundle check", { x: 50, y: 700 });
const bytes = await pdf.save();
const worker = new Worker(
  `
const {parentPort} = require('node:worker_threads');
globalThis.self = globalThis;
globalThis.postMessage = message => parentPort.postMessage(message);
globalThis.fetch = () => {throw new Error('Network forbidden');};
import(${JSON.stringify(url)}).then(() => {
 parentPort.on('message', data => globalThis.onmessage({data}));
 parentPort.postMessage({ready: true});
});
`,
  { eval: true },
);
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Production worker timed out")),
      15000,
    );
    worker.on("error", reject);
    worker.on("message", (message) => {
      if (message.ready) {
        worker.postMessage({
          bytes,
          placements: [],
          geometries: {},
          password: "",
        });
        return;
      }
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error));
      else if (
        !message.bytes ||
        !new TextDecoder()
          .decode(message.bytes.subarray(0, 5))
          .startsWith("%PDF-")
      )
        reject(new Error("Worker did not produce a PDF"));
      else resolve();
    });
  });
  console.log("Production worker exported a valid PDF without network access.");
} finally {
  await worker.terminate();
}
