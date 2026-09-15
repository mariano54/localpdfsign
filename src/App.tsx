import { lazy, Suspense, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  FileText,
  Fingerprint,
  Code2,
  LockKeyhole,
  PenLine,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import "./App.css";
import EditorBoundary from "./EditorBoundary";
const Editor = lazy(() => import("./Editor"));
export default function App() {
  const [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [privacy, setPrivacy] = useState(false),
    [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf"))
      return setError("Choose a PDF document to get started.");
    if (file.size > 100 * 1024 * 1024)
      return setError(
        "Please choose a PDF smaller than 100 MB to keep your browser responsive.",
      );
    setError("");
    setFile(file);
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="/" aria-label="LocalPDFSign home">
          <span className="brand-icon">
            <PenLine size={22} />
          </span>
          local<span className="brand-light">pdf</span>sign
          <span className="brand-dot">.</span>
        </a>
        <nav>
          <button className="text-button" onClick={() => setPrivacy(true)}>
            <LockKeyhole size={15} />
            Privacy, by design
          </button>
          <a
            className="github-link"
            href="https://github.com/mariano54/localpdfsign"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={18} />
            <span>Source code</span>
            <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      {file ? (
        <EditorBoundary>
          <Suspense
            fallback={
              <div className="loading">
                <span className="spinner" />
                Opening your local workspace…
              </div>
            }
          >
            <Editor file={file} onClose={() => setFile(null)} />
          </Suspense>
        </EditorBoundary>
      ) : (
        <main>
          <section className="hero">
            <div className="eyebrow">
              <span className="status-dot" />
              YOUR DOCUMENTS. YOUR DEVICE.
            </div>
            <h1>
              A little signature.
              <br />A lot more <span>privacy.</span>
            </h1>
            <p className="hero-description">
              Sign PDFs right here in your browser.
              <br />
              Your files never leave your machine. And it’s 100% free.
            </p>
            <div className="hero-pills">
              <span>
                <Check size={15} />
                No uploads
              </span>
              <span>
                <Check size={15} />
                No account
              </span>
              <span>
                <Check size={15} />
                No limits on signatures
              </span>
            </div>
          </section>
          <section
            className={"dropzone " + (dragging ? "dragging" : "")}
            aria-label="Open a PDF"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
          >
            <div className="drop-icon">
              <FileText size={32} />
              <span>
                <Plus size={14} />
              </span>
            </div>
            <h2>Your PDF stays with you.</h2>
            <p>Drop it here to get started, or choose a file.</p>
            <button className="primary" onClick={() => input.current?.click()}>
              <Plus size={18} />
              Choose a PDF
              <ArrowUpRight size={18} />
            </button>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => choose(e.target.files?.[0])}
            />
            <div className="drop-meta">
              <LockKeyhole size={13} />
              Processed on your device<span>·</span>PDF up to 100 MB
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
          <div className="trust-strip">
            <ShieldCheck size={17} />
            <span>Zero document uploads. Zero tracking. Zero cost.</span>
            <button className="text-button" onClick={() => setPrivacy(true)}>
              How it works
              <ArrowUpRight size={14} />
            </button>
          </div>
          <section className="features" aria-label="Features">
            <article>
              <span className="feature-number">01 / MAKE IT YOURS</span>
              <PenLine />
              <h3>Signed, your way.</h3>
              <p>
                Type your name in 12 signature styles or draw it yourself. Add a
                date and place it exactly where it belongs.
              </p>
            </article>
            <article>
              <span className="feature-number">02 / KEEP IT PRIVATE</span>
              <Fingerprint />
              <h3>Nothing to upload.</h3>
              <p>
                Documents, signatures, and certificate passwords stay in your
                browser. Close your document to clear the workspace.
              </p>
            </article>
            <article>
              <span className="feature-number">03 / MAKE IT OFFICIAL</span>
              <ArrowDownToLine />
              <h3>Ready to download.</h3>
              <p>
                Save a clean PDF without watermarks. Add a cryptographic
                signature with your own certificate, entirely on your device.
              </p>
            </article>
          </section>
          <section className="small-note">
            <span className="status-dot" />
            <p>
              Small tool. Simple promise.
              <br />
              <strong>Your documents are nobody else’s business.</strong>
            </p>
          </section>
        </main>
      )}
      <footer>
        <span>© {new Date().getFullYear()} LocalPDFSign</span>
        <span>Made for your peace of mind.</span>
        <button className="text-button" onClick={() => setPrivacy(true)}>
          Privacy & signing details
          <ArrowUpRight size={13} />
        </button>
      </footer>
      {privacy && (
        <div className="modal-backdrop" onClick={() => setPrivacy(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Privacy and signing details"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPrivacy(false);
              if (e.key === "Tab") {
                const buttons =
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close privacy details"
              autoFocus
              onClick={() => setPrivacy(false)}
            >
              <X />
            </button>
            <ShieldCheck size={30} />
            <h2>Private means local.</h2>
            <p>
              Your PDFs, signature images, certificate files, and passwords are
              processed in memory on this device. We do not upload or store
              them. There are no analytics, tracking scripts, advertising, or
              external font services.
            </p>
            <p>
              AWS delivers the website’s code and fonts. Like any website host,
              it receives ordinary connection information such as your IP
              address when you load the site. It does not receive your document
              contents.
            </p>
            <h3>About cryptographic signatures</h3>
            <p>
              Use your own .p12 or .pfx certificate to add a digital signature.
              Certificate trust depends on its issuer and the recipient’s PDF
              reader. A drawn or typed signature alone does not provide
              cryptographic integrity protection.
            </p>
            <p>
              Signing dates use your device’s clock. We do not contact timestamp
              authorities or revocation services. This tool does not verify your
              identity or provide an independent audit trail.
            </p>
            <p>
              The app is free. Obtaining a certificate from an external provider
              may cost money. Acceptance of a signature depends on your document
              and jurisdiction.
            </p>
            <button className="primary" onClick={() => setPrivacy(false)}>
              Got it
              <Check size={16} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
