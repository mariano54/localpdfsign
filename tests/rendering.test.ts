import { describe, it, expect } from "vitest";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { PDF } from "@libpdf/core";
import { exportPdf } from "../src/pdf-engine";
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

describe("rendered export positions", () => {
  it.each([0, 90, 180, 270] as const)(
    "places a visible mark at the selected screen position on a %s° page",
    async (rotation) => {
      const pdf = PDF.create();
      const page = pdf.addPage({ width: 600, height: 800 });
      page.setRotation(rotation);
      const bytes = await pdf.save();
      const inputTask = pdfjs.getDocument({ data: bytes.slice() });
      const input = await inputTask.promise;
      const originalPage = await input.getPage(1);
      const viewport = originalPage.getViewport({ scale: 1 });
      const image = createCanvas(32, 16);
      const imageContext = image.getContext("2d");
      imageContext.fillStyle = "#193f35";
      imageContext.fillRect(0, 0, 32, 16);
      const signed = await exportPdf({
        bytes,
        placements: [
          {
            id: "mark",
            page: 1,
            x: 0.2,
            y: 0.3,
            width: 0.2,
            height: 0.1,
            label: "Signature",
            image: image.toDataURL("image/png"),
          },
        ],
        geometries: {
          1: {
            width: viewport.width,
            height: viewport.height,
            transform: [...viewport.transform],
          },
        },
        password: "",
      });
      const outputTask = pdfjs.getDocument({ data: signed });
      const output = await outputTask.promise;
      const outputPage = await output.getPage(1);
      const result = createCanvas(viewport.width, viewport.height);
      await outputPage.render({
        canvas: result as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const pixel = result
        .getContext("2d")
        .getImageData(
          Math.round(viewport.width * 0.3),
          Math.round(viewport.height * 0.35),
          1,
          1,
        ).data;
      expect(Array.from(pixel)).toEqual([25, 63, 53, 255]);
      const outside = result.getContext("2d").getImageData(10, 10, 1, 1).data;
      expect(Array.from(outside)).toEqual([255, 255, 255, 255]);
      await inputTask.destroy();
      await outputTask.destroy();
    },
  );
});
