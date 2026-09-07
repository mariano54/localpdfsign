import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { PDF } from "@libpdf/core";
import { exportPdf } from "../src/pdf-engine";
import { imageMatrix, formatDate } from "../src/model";
import type { Placement } from "../src/model";
let dir: string, certificate: Uint8Array, bytes: Uint8Array;
const mark: Placement = {
  id: "test",
  page: 1,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.1,
  label: "Signature",
  image:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQtDf9DwACjwGNZ0UujQAAAABJRU5ErkJggg==",
};
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "localpdfsign-test-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-sha256",
      "-days",
      "2",
      "-nodes",
      "-subj",
      "/CN=LocalPDFSign Test",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "openssl",
    [
      "pkcs12",
      "-export",
      "-out",
      join(dir, "certificate.p12"),
      "-inkey",
      join(dir, "key.pem"),
      "-in",
      join(dir, "cert.pem"),
      "-passout",
      "pass:test-only",
    ],
    { stdio: "ignore" },
  );
  certificate = new Uint8Array(readFileSync(join(dir, "certificate.p12")));
  const pdf = PDF.create();
  const page = pdf.addPage({ width: 600, height: 800 });
  page.drawText("Original document content", { x: 50, y: 700, size: 20 });
  pdf.addPage({ width: 600, height: 800 });
  bytes = await pdf.save();
});
afterAll(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});
describe("placement and dates", () => {
  it.each([
    {
      width: 600,
      height: 800,
      transform: [1, 0, 0, -1, 0, 800],
      expected: [180, 0, 0, 80, 60, 560],
    },
    {
      width: 800,
      height: 600,
      transform: [0, 1, 1, 0, 0, 0],
      expected: [0, 240, -60, 0, 180, 80],
    },
    {
      width: 600,
      height: 800,
      transform: [-1, 0, 0, 1, 600, 0],
      expected: [-180, 0, 0, -80, 540, 240],
    },
    {
      width: 800,
      height: 600,
      transform: [0, -1, -1, 0, 800, 600],
      expected: [0, -240, 60, 0, 420, 720],
    },
    {
      width: 600,
      height: 800,
      transform: [1, 0, 0, -1, -20, 830],
      expected: [180, 0, 0, 80, 80, 590],
    },
  ])("maps rotated/cropped page $transform", ({ expected, ...g }) => {
    imageMatrix(mark, g).forEach((n, i) => expect(n).toBeCloseTo(expected[i]));
  });
  it("uses the selected local calendar date without UTC shifting", () => {
    expect(formatDate("2026-09-07", "long")).toBe("Sep 7, 2026");
    expect(formatDate("2026-09-07", "eu")).toBe("07/09/2026");
    expect(formatDate("2026-09-07", "us")).toBe("09/07/2026");
  });
});
describe("PDF output", () => {
  it("retains document pages and embeds a visible signature", async () => {
    const output = await exportPdf({
      bytes,
      placements: [mark],
      geometries: {
        1: { width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] },
      },
      password: "",
    });
    const pdf = await PDF.load(output);
    expect(pdf.getPages()).toHaveLength(2);
    expect(new TextDecoder().decode(output)).toContain("/Subtype /Image");
  });
  it("creates a CMS signature OpenSSL verifies, detects tampering, and makes no network requests", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network forbidden"));
    const output = await exportPdf({
      bytes,
      placements: [],
      geometries: {},
      certificate,
      password: "test-only",
    });
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
    const text = Buffer.from(output).toString("latin1"),
      match = text.match(
        /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/,
      );
    expect(match).toBeTruthy();
    const [start, length, secondStart, secondLength] = match!
      .slice(1)
      .map(Number);
    expect(start).toBe(0);
    expect(secondStart + secondLength).toBe(output.length);
    const content = Buffer.concat([
      output.subarray(start, start + length),
      output.subarray(secondStart, secondStart + secondLength),
    ]);
    const hex = text
      .slice(length, secondStart)
      .match(/<([0-9a-fA-F\s]+)>/)![1]
      .replace(/\s/g, "");
    writeFileSync(join(dir, "signature.der"), Buffer.from(hex, "hex"));
    writeFileSync(join(dir, "content.bin"), content);
    const args = [
      "cms",
      "-verify",
      "-binary",
      "-inform",
      "DER",
      "-in",
      join(dir, "signature.der"),
      "-content",
      join(dir, "content.bin"),
      "-noverify",
      "-out",
      join(dir, "verified.bin"),
    ];
    expect(spawnSync("openssl", args).status).toBe(0);
    content[20] ^= 1;
    writeFileSync(join(dir, "content.bin"), content);
    expect(spawnSync("openssl", args).status).not.toBe(0);
    await expect(
      exportPdf({
        bytes: output,
        placements: [],
        geometries: {},
        password: "",
      }),
    ).rejects.toThrow("already has a digital signature");
  });
  it("fails closed for the wrong certificate password", async () => {
    await expect(
      exportPdf({
        bytes,
        placements: [],
        geometries: {},
        certificate,
        password: "wrong",
      }),
    ).rejects.toThrow("Could not unlock");
  });
  it("rejects a placement whose page is missing", async () => {
    await expect(
      exportPdf({
        bytes,
        placements: [{ ...mark, page: 99 }],
        geometries: {},
        password: "",
      }),
    ).rejects.toThrow("page could not be found");
  });
});
