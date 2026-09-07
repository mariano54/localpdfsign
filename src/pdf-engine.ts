import { PDF, P12Signer, ops } from "@libpdf/core";
import { Certificate } from "pkijs";
import { fromBER } from "asn1js";
import { imageMatrix, pngBytes } from "./model";
import type { ExportRequest } from "./model";
export async function exportPdf(request: ExportRequest) {
  const pdf = await PDF.load(request.bytes);
  if (pdf.isEncrypted)
    throw new Error(
      "Password-protected PDFs are not supported. Save an unencrypted copy first.",
    );
  if (
    pdf
      .getForm()
      ?.getSignatureFields()
      .some((field) => field.isSigned())
  )
    throw new Error(
      "This PDF already has a digital signature. To protect it, this version cannot modify an already signed document. Start with the unsigned original.",
    );
  const pages = pdf.getPages();
  const images = new Map<string, ReturnType<typeof pdf.embedPng>>();
  for (const placement of request.placements) {
    const page = pages[placement.page - 1],
      geometry = request.geometries[placement.page];
    if (!page || !geometry)
      throw new Error("A signature page could not be found.");
    let image = images.get(placement.image);
    if (!image) {
      image = pdf.embedPng(pngBytes(placement.image));
      images.set(placement.image, image);
    }
    // Keep transform and paint in the same content stream. LibPDF isolates
    // individual drawing calls, so a transform cannot span separate calls.
    const imageName = page.registerImage(image);
    page.drawOperators([
      ops.pushGraphicsState(),
      ops.concatMatrix(...imageMatrix(placement, geometry)),
      ops.paintXObject(imageName),
      ops.popGraphicsState(),
    ]);
  }
  if (request.certificate) {
    let signer: P12Signer;
    try {
      signer = await P12Signer.create(request.certificate, request.password, {
        buildChain: false,
      });
    } catch {
      throw new Error(
        "Could not unlock this certificate. Check the password and use a supported RSA or EC .p12/.pfx file.",
      );
    }
    const cert = new Certificate({
        schema: fromBER(signer.certificate).result,
      }),
      now = new Date();
    if (now < cert.notBefore.value || now > cert.notAfter.value)
      throw new Error(
        "This certificate is outside its validity dates. Choose a currently valid certificate.",
      );
    // B-B and buildChain:false are deliberate: no timestamp, issuer, OCSP, or CRL network calls.
    const signed = await pdf.sign({
      signer,
      level: "B-B",
      digestAlgorithm: "SHA-256",
      reason: "Document signed locally using LocalPDFSign",
      signingTime: now,
    });
    return signed.bytes;
  }
  return pdf.save();
}
