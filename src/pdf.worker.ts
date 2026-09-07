import { exportPdf } from "./pdf-engine";
import type { ExportRequest } from "./model";
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  try {
    const bytes = await exportPdf(request);
    self.postMessage({ bytes }, { transfer: [bytes.buffer as ArrayBuffer] });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The PDF could not be saved. Try a different document.",
    });
  } finally {
    request.bytes.fill(0);
    request.certificate?.fill(0);
    request.password = "";
  }
};
