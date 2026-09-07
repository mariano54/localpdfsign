import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Grip,
  KeyRound,
  LockKeyhole,
  PenLine,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { clamp, fonts, formatDate, today } from "./model";
import type { PageGeometry, Placement } from "./model";
import "./fonts.css";
import "./Editor.css";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

async function textImage(text: string, font: string, color: string) {
  await document.fonts.load(`64px "${font}"`, text);
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  ctx.font = `64px "${font}"`;
  const metrics = ctx.measureText(text);
  const left = Math.max(0, metrics.actualBoundingBoxLeft),
    right = Math.max(metrics.width, metrics.actualBoundingBoxRight);
  const ascent = Math.max(1, metrics.actualBoundingBoxAscent),
    descent = Math.max(1, metrics.actualBoundingBoxDescent);
  canvas.width = Math.ceil((left + right + 20) * 2);
  canvas.height = Math.ceil((ascent + descent + 20) * 2);
  ctx.scale(2, 2);
  ctx.font = `64px "${font}"`;
  ctx.fillStyle = color;
  ctx.fillText(text, left + 10, ascent + 10);
  return {
    image: canvas.toDataURL("image/png"),
    ratio: canvas.height / canvas.width,
  };
}
function croppedDrawing(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!,
    { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width,
    top = canvas.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (data[(y * canvas.width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right <= left || bottom <= top)
    throw new Error("Draw your signature in the box first.");
  const output = document.createElement("canvas");
  output.width = right - left + 21;
  output.height = bottom - top + 21;
  output
    .getContext("2d")!
    .drawImage(
      canvas,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
      10,
      10,
      right - left + 1,
      bottom - top + 1,
    );
  return {
    image: output.toDataURL("image/png"),
    ratio: output.height / output.width,
  };
}
export default function Editor({
  file,
  onClose,
}: {
  file: File;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState({ width: 612, height: 792 }),
    [viewWidth, setViewWidth] = useState(650);
  const [rendering, setRendering] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"type" | "draw">("type"),
    [name, setName] = useState(""),
    [font, setFont] = useState(fonts[0]),
    [color, setColor] = useState("#193f35");
  const [date, setDate] = useState(today()),
    [dateFormat, setDateFormat] = useState("long"),
    [placements, setPlacements] = useState<Placement[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState(false),
    [certificate, setCertificate] = useState<File | null>(null),
    [password, setPassword] = useState(""),
    [agreed, setAgreed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const source = useRef<Uint8Array | null>(null),
    geometries = useRef<Record<number, PageGeometry>>({}),
    exportWorker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const strokes = useRef(false),
    drag = useRef<{
      id: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
    } | null>(null),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    let disposed = false;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    file
      .arrayBuffer()
      .then((bytes) => {
        if (disposed) return;
        source.current = new Uint8Array(bytes);
        task = pdfjs.getDocument({
          data: source.current.slice(),
          useSystemFonts: true,
          cMapUrl: `/pdfjs/${pdfjs.version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `/pdfjs/${pdfjs.version}/standard_fonts/`,
          wasmUrl: `/pdfjs/${pdfjs.version}/wasm/`,
          iccUrl: `/pdfjs/${pdfjs.version}/iccs/`,
        });
        return task.promise;
      })
      .then((doc) => {
        if (doc && !disposed) setPdf(doc);
      })
      .catch((err) => {
        if (!disposed) {
          setError(
            err?.name === "PasswordException"
              ? "Password-protected PDFs are not supported. Save an unencrypted copy first."
              : "This PDF could not be opened. It may be damaged or unsupported.",
          );
          setRendering(false);
        }
      });
    return () => {
      disposed = true;
      active.current = false;
      void task?.destroy();
      source.current?.fill(0);
      source.current = null;
      exportWorker.current?.terminate();
      clearTimeout(timer.current);
    };
  }, [file]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setViewWidth(
        Math.min(850, Math.max(180, entries[0].contentRect.width - 48)),
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | undefined;
    // This state mirrors an external asynchronous PDF renderer.
    // oxlint-disable-next-line react/set-state-in-effect
    setRendering(true);
    pdf
      .getPage(page)
      .then(async (p) => {
        if (cancelled || !canvas.current) return;
        const natural = p.getViewport({ scale: 1 });
        geometries.current[page] = {
          width: natural.width,
          height: natural.height,
          transform: [...natural.transform],
        };
        setPageSize({ width: natural.width, height: natural.height });
        const scale = viewWidth / natural.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const view = p.getViewport({ scale: scale * dpr });
        canvas.current.width = Math.floor(view.width);
        canvas.current.height = Math.floor(view.height);
        renderTask = p.render({ canvas: canvas.current, viewport: view });
        await renderTask.promise;
        if (!cancelled) setRendering(false);
      })
      .catch((err) => {
        if (!cancelled && err.name !== "RenderingCancelledException") {
          setError("This page could not be rendered. Try another PDF.");
          setRendering(false);
        }
      });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, viewWidth]);
  // Expose only document-independent navigation to supporting agents; never expose file contents or keys.
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context || !pdf) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "navigate_pdf_page",
            description:
              "Navigate to a page in the locally opened PDF. Does not read or export its contents.",
            inputSchema: {
              type: "object",
              properties: {
                page: { type: "integer", minimum: 1, maximum: pdf.numPages },
              },
              required: ["page"],
              additionalProperties: false,
            },
            execute: (input: unknown) => {
              const n = (input as { page?: unknown })?.page;
              if (
                typeof n !== "number" ||
                !Number.isInteger(n) ||
                n < 1 ||
                n > pdf.numPages
              )
                throw new Error("Invalid page number");
              setPage(n);
              setSelected(null);
              return { page: n };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => controller.abort();
  }, [pdf]);
  function update(id: string, patch: Partial<Placement>) {
    setPlacements((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    setSuccess("");
  }
  async function add(kind: "signature" | "date") {
    if (adding || !pdf || rendering) return;
    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const text = kind === "date" ? formatDate(date, dateFormat) : name.trim();
      if (kind === "signature" && mode === "type" && !text)
        throw new Error("Type your name first.");
      const result =
        kind === "signature" && mode === "draw"
          ? croppedDrawing(drawing.current!)
          : await textImage(text, kind === "date" ? "Arial" : font, color);
      if (!active.current) return;
      const width = kind === "date" ? 0.23 : 0.34,
        height = Math.min(
          0.4,
          ((width * pageSize.width) / pageSize.height) * result.ratio,
        );
      const item: Placement = {
        id: crypto.randomUUID(),
        page,
        x: 0.12,
        y: clamp(
          0.64 + placements.filter((p) => p.page === page).length * 0.07,
          0,
          1 - height,
        ),
        width,
        height,
        image: result.image,
        label: kind === "date" ? "Signing date" : "Signature",
      };
      setPlacements((items) => [...items, item]);
      setSelected(item.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add the signature.",
      );
    } finally {
      setAdding(false);
    }
  }
  function drawStart(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const c = e.currentTarget,
      r = c.getBoundingClientRect(),
      ctx = c.getContext("2d")!;
    c.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokes.current = true;
  }
  function drawMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!strokes.current) return;
    const c = e.currentTarget,
      r = c.getBoundingClientRect(),
      ctx = c.getContext("2d")!;
    ctx.lineTo(
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    );
    ctx.stroke();
  }
  const current = placements.find((p) => p.id === selected);
  async function download() {
    if (!source.current || busy || (!placements.length && !cryptoEnabled))
      return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (!agreed)
        throw new Error("Confirm that you intend to sign this document.");
      if (cryptoEnabled && !certificate)
        throw new Error("Choose your .p12 or .pfx certificate.");
      if (certificate && certificate.size > 5 * 1024 * 1024)
        throw new Error("Choose a certificate smaller than 5 MB.");
      const certBytes =
        cryptoEnabled && certificate
          ? new Uint8Array(await certificate.arrayBuffer())
          : undefined;
      if (!active.current) return;
      const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
        type: "module",
      });
      exportWorker.current = worker;
      const stop = () => {
        worker.terminate();
        exportWorker.current = null;
        clearTimeout(timer.current);
        setBusy(false);
        setPassword("");
      };
      timer.current = setTimeout(() => {
        stop();
        setError("This PDF took too long to process. Try a smaller document.");
      }, 90000);
      worker.onmessage = (
        event: MessageEvent<{ bytes?: Uint8Array; error?: string }>,
      ) => {
        stop();
        if (event.data.error) {
          setError(event.data.error);
          return;
        }
        if (!event.data.bytes) {
          setError("No PDF was produced.");
          return;
        }
        const url = URL.createObjectURL(
            new Blob([event.data.bytes as BlobPart], {
              type: "application/pdf",
            }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = file.name.replace(/\.pdf$/i, "") + "-signed.pdf";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        setSuccess(
          cryptoEnabled
            ? "Your digitally signed PDF is ready. Check its certificate in your PDF reader."
            : "Your signed PDF is ready. Your original file is unchanged.",
        );
      };
      worker.onerror = () => {
        stop();
        setError(
          "The PDF processor could not start. Reload the page and try again.",
        );
      };
      const bytes = source.current.slice();
      worker.postMessage(
        {
          bytes,
          placements,
          geometries: geometries.current,
          certificate: certBytes,
          password: cryptoEnabled ? password : "",
        },
        [bytes.buffer, ...(certBytes ? [certBytes.buffer] : [])],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The PDF could not be saved.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="editor">
      <div className="document-bar">
        <div className="document-title">
          <FileText size={20} />
          <div>
            <strong title={file.name}>{file.name}</strong>
            <span>
              {(file.size / 1024 / 1024).toFixed(1)} MB · Local document
            </span>
          </div>
        </div>
        <div className="document-actions">
          <span className="local-badge">
            <LockKeyhole size={13} />
            Only on this device
          </span>
          <button className="secondary" onClick={onClose}>
            <X />
            Close document
          </button>
        </div>
      </div>
      <div className="workspace">
        <aside className="tools">
          <div className="tools-title">
            <span className="eyebrow">YOUR SIGNING TOOLKIT</span>
            <h2>Make your mark.</h2>
          </div>
          <fieldset disabled={busy || !pdf}>
            <div className="tool-section">
              <label className="section-label">
                <PenLine size={15} />
                Signature
              </label>
              <div className="segments">
                <button
                  className={mode === "type" ? "active" : ""}
                  onClick={() => setMode("type")}
                >
                  <Type size={15} />
                  Type
                </button>
                <button
                  className={mode === "draw" ? "active" : ""}
                  onClick={() => setMode("draw")}
                >
                  <PenLine size={15} />
                  Draw
                </button>
              </div>
              {mode === "type" ? (
                <>
                  <label className="input-label" htmlFor="sign-name">
                    Your name
                  </label>
                  <input
                    id="sign-name"
                    autoComplete="off"
                    maxLength={90}
                    placeholder="e.g. Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <label className="input-label" htmlFor="font">
                    Signature style
                  </label>
                  <select
                    id="font"
                    value={font}
                    onChange={(e) => setFont(e.target.value)}
                  >
                    {fonts.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <div
                    className="signature-preview"
                    style={{ fontFamily: `"${font}"`, color }}
                  >
                    {name || "Your signature"}
                  </div>
                  <div
                    className="font-grid"
                    aria-label="Choose a signature font"
                  >
                    {fonts.map((f) => (
                      <button
                        key={f}
                        title={f}
                        aria-label={f}
                        aria-pressed={f === font}
                        className={f === font ? "active" : ""}
                        style={{ fontFamily: `"${f}"` }}
                        onClick={() => setFont(f)}
                      >
                        Abc
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <canvas
                    className="drawing-pad"
                    ref={drawing}
                    width={600}
                    height={260}
                    aria-label="Draw your signature"
                    onPointerDown={drawStart}
                    onPointerMove={drawMove}
                    onPointerUp={() => (strokes.current = false)}
                    onPointerCancel={() => (strokes.current = false)}
                  />
                  <button
                    className="text-button"
                    onClick={() =>
                      drawing.current
                        ?.getContext("2d")
                        ?.clearRect(0, 0, 600, 260)
                    }
                  >
                    <RotateCcw size={13} />
                    Clear drawing
                  </button>
                </>
              )}
              <div className="ink-row">
                <span>Ink color</span>
                <div>
                  {["#193f35", "#172b64", "#171717"].map((c) => (
                    <button
                      key={c}
                      aria-label={
                        c === "#193f35"
                          ? "Green ink"
                          : c === "#172b64"
                            ? "Blue ink"
                            : "Black ink"
                      }
                      aria-pressed={color === c}
                      className={"swatch " + (color === c ? "active" : "")}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    >
                      {color === c && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="secondary wide"
                disabled={adding || rendering}
                onClick={() => void add("signature")}
              >
                <Plus />
                Add signature
              </button>
            </div>
            <div className="tool-section">
              <label className="section-label">
                <CalendarDays size={15} />
                Signing date
              </label>
              <label className="sr-only" htmlFor="sign-date">
                Date
              </label>
              <input
                type="date"
                id="sign-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <label className="sr-only" htmlFor="date-format">
                Date format
              </label>
              <select
                id="date-format"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
              >
                <option value="long">Sep 7, 2026</option>
                <option value="iso">YYYY-MM-DD</option>
                <option value="us">MM/DD/YYYY</option>
                <option value="eu">DD/MM/YYYY</option>
              </select>
              <button
                className="secondary wide"
                disabled={adding || rendering || !date}
                onClick={() => void add("date")}
              >
                <Plus />
                Add date
              </button>
            </div>
            <div className="tool-section">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={cryptoEnabled}
                  onChange={(e) => {
                    setCryptoEnabled(e.target.checked);
                    setPassword("");
                    if (!e.target.checked) setCertificate(null);
                  }}
                />
                <span>
                  <KeyRound size={15} />
                  Cryptographic signature
                </span>
              </label>
              <p className="help">
                Optional protection with your own certificate.
              </p>
              {cryptoEnabled && (
                <div className="certificate-controls">
                  <label className="input-label" htmlFor="certificate">
                    Certificate (.p12 / .pfx)
                  </label>
                  <input
                    type="file"
                    id="certificate"
                    accept=".p12,.pfx"
                    onChange={(e) => {
                      setCertificate(e.target.files?.[0] || null);
                      setPassword("");
                    }}
                  />
                  <label className="input-label" htmlFor="password">
                    Certificate password
                  </label>
                  <input
                    type="password"
                    id="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="help">
                    Stays on this device. Certificate trust depends on its
                    issuer. No independent timestamp or identity verification.
                  </p>
                </div>
              )}
            </div>
          </fieldset>
        </aside>
        <section className="document-area" aria-label="PDF workspace">
          <div className="page-toolbar">
            <span className="page-hint">
              <Grip size={14} />
              Drag fields to position them
            </span>
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={!pdf || page === 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setSelected(null);
                }}
              >
                <ChevronLeft />
              </button>
              <label>
                Page{" "}
                <input
                  aria-label="Page number"
                  type="number"
                  min={1}
                  max={pdf?.numPages || 1}
                  value={page}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      pdf &&
                      Number.isInteger(n) &&
                      n >= 1 &&
                      n <= pdf.numPages
                    ) {
                      setPage(n);
                      setSelected(null);
                    }
                  }}
                />{" "}
                of {pdf?.numPages || "…"}
              </label>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={!pdf || page === pdf.numPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelected(null);
                }}
              >
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="page-scroller" ref={viewport}>
            <div
              className="page-stage"
              ref={stage}
              style={{
                width: viewWidth,
                aspectRatio: `${pageSize.width}/${pageSize.height}`,
              }}
              onClick={() => setSelected(null)}
            >
              <canvas ref={canvas} className="pdf-canvas" />
              {rendering && (
                <div className="page-loading">
                  <span className="spinner" />
                  Rendering page…
                </div>
              )}
              {!rendering &&
                placements
                  .filter((p) => p.page === page)
                  .map((p) => (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.label}. Use arrow keys to move; Delete to remove.`}
                      className={
                        "placement " + (p.id === selected ? "selected" : "")
                      }
                      style={{
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        width: `${p.width * 100}%`,
                        height: `${p.height * 100}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(p.id);
                      }}
                      onPointerDown={(e) => {
                        if (busy || e.button !== 0) return;
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setSelected(p.id);
                        drag.current = {
                          id: p.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          x: p.x,
                          y: p.y,
                        };
                      }}
                      onPointerMove={(e) => {
                        if (
                          !drag.current ||
                          drag.current.id !== p.id ||
                          !stage.current
                        )
                          return;
                        const r = stage.current.getBoundingClientRect();
                        update(p.id, {
                          x: clamp(
                            drag.current.x +
                              (e.clientX - drag.current.startX) / r.width,
                            0,
                            1 - p.width,
                          ),
                          y: clamp(
                            drag.current.y +
                              (e.clientY - drag.current.startY) / r.height,
                            0,
                            1 - p.height,
                          ),
                        });
                      }}
                      onPointerUp={() => (drag.current = null)}
                      onPointerCancel={() => (drag.current = null)}
                      onKeyDown={(e) => {
                        if (busy) return;
                        const step = e.shiftKey ? 0.02 : 0.003;
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                            "Delete",
                            "Backspace",
                          ].includes(e.key)
                        ) {
                          e.preventDefault();
                          if (e.key === "Delete" || e.key === "Backspace") {
                            setPlacements((items) =>
                              items.filter((i) => i.id !== p.id),
                            );
                            setSelected(null);
                          } else
                            update(p.id, {
                              x: clamp(
                                p.x +
                                  (e.key === "ArrowLeft"
                                    ? -step
                                    : e.key === "ArrowRight"
                                      ? step
                                      : 0),
                                0,
                                1 - p.width,
                              ),
                              y: clamp(
                                p.y +
                                  (e.key === "ArrowUp"
                                    ? -step
                                    : e.key === "ArrowDown"
                                      ? step
                                      : 0),
                                0,
                                1 - p.height,
                              ),
                            });
                        }
                      }}
                    >
                      <img src={p.image} alt={p.label} draggable={false} />
                      {p.id === selected && (
                        <span className="placement-label">{p.label}</span>
                      )}
                    </div>
                  ))}
            </div>
          </div>
          <div className="selection-toolbar">
            {current ? (
              <>
                <strong>{current.label}</strong>
                <label>
                  Size
                  <input
                    aria-label="Selected field size"
                    type="range"
                    min="5"
                    max="70"
                    disabled={busy}
                    value={Math.round(current.width * 100)}
                    onChange={(e) => {
                      const ratio = current.height / current.width,
                        width = Math.min(
                          Number(e.target.value) / 100,
                          0.9 / ratio,
                        ),
                        height = width * ratio;
                      update(current.id, {
                        width,
                        height,
                        x: Math.min(current.x, 1 - width),
                        y: Math.min(current.y, 1 - height),
                      });
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Delete selected field"
                  disabled={busy}
                  onClick={() => {
                    setPlacements((items) =>
                      items.filter((p) => p.id !== selected),
                    );
                    setSelected(null);
                  }}
                >
                  <Trash2 />
                </button>
              </>
            ) : (
              <span>
                {placements.length
                  ? `${placements.length} field${placements.length === 1 ? "" : "s"} added · Click a field to resize or remove it`
                  : "Add your signature or date from the toolkit to get started."}
              </span>
            )}
          </div>
        </section>
      </div>
      <div className="export-bar">
        <div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={agreed}
              disabled={busy}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>I intend to sign this document.</span>
          </label>
          <p>No watermark. No account. Always free.</p>
        </div>
        <button
          className="primary"
          disabled={
            !pdf ||
            rendering ||
            busy ||
            !agreed ||
            (!placements.length && !cryptoEnabled)
          }
          onClick={() => void download()}
        >
          {busy ? <span className="spinner" /> : <ArrowDownToLine size={18} />}{" "}
          {busy ? "Signing locally…" : "Download signed PDF"}
        </button>
      </div>
      {(error || success) && (
        <div className="feedback" role={error ? "alert" : "status"}>
          <p className={error ? "error" : "success"}>{error || success}</p>
        </div>
      )}
    </main>
  );
}
