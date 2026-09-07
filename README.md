# LocalPDFSign

Free PDF signing in your browser. Documents, signature images, certificate files, and passwords stay on the device. There is no document backend, account, analytics, or tracking.

## Features

- React and TypeScript with a small, lazy-loaded signing workspace.
- Twelve bundled signature fonts, plus drawing with a mouse, touch, or pen.
- Signing dates in four formats, movable fields, resizing, and keyboard positioning.
- Multiple pages with one page rendered at a time and device-pixel-ratio capped at 2.
- PDF export in a dedicated worker, preserving the original PDF content rather than rasterizing the document.
- Optional embedded PAdES B-B signatures with a user-supplied RSA/EC PKCS#12 certificate (.p12/.pfx), SHA-256, and local certificate validity-date checks.
- No watermarks or usage charges. 100 MB document limit to bound browser memory use.

## Local development

Node.js 24 or newer and npm are required. OpenSSL 3 is used by cryptographic integration tests.

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm test
npm run check
npm run build
```

The compiled `dist/` folder can be served by any static HTTPS server. Use `localhost` for development because browser cryptography requires a secure context. All dependencies and fonts are served from the same origin. No external CDN is required.

## Privacy and signing scope

PDFs are read using the File API, rendered by PDF.js, and modified/signed by LibPDF in a web worker. Document bytes, certificate data, and passwords are not sent to a server or saved in browser storage. Closing the workspace destroys the PDF worker, terminates any export, and releases document state. JavaScript garbage collection is not a secure-memory erasure guarantee. Fonts and the application itself are downloaded from the host; ordinary website requests expose connection metadata such as the visitor's IP address to the host.

Cryptographic signing explicitly disables certificate-chain fetching and uses B-B only: no timestamp-authority, OCSP, CRL, analytics, or external network calls. Device dates are self-reported signing dates, not trusted timestamps. Revocation and issuer trust are not checked by this app. Certificate trust is decided by the recipient's PDF reader. An external certificate provider may charge for a certificate.

Typed/drawn signatures without a certificate are visual electronic signatures only. This is a local signing utility, not an identity-verification platform or independent audit service. Legal acceptance depends on the document and jurisdiction.

Already digitally signed PDFs are rejected during export to avoid invalidating their existing signatures. Password-protected PDFs are not supported. Signature text is rasterized at high resolution to retain the selected font appearance; the document itself remains a PDF. Existing PDF annotations and form fields are retained. Use a copy of your original for any critical document and review the downloaded result.

## Verification

Tests cover placement transforms for all four page rotations and a non-zero crop origin, local date formatting, preserving pages and embedding an image, wrong certificate passwords, signed-input rejection, and missing pages. A fresh temporary test certificate signs a PDF; OpenSSL independently verifies the detached CMS signature and rejects a tampered document. The signing test forbids network calls. Private test keys are created in the OS temporary directory and removed afterwards.

Rendered-PDF pixel tests confirm visible placements on 0°, 90°, 180°, and 270° pages. The production export worker is also exercised in an isolated Node worker runtime with network access disabled.

No browser interaction or visual screenshot QA has been performed. Validate the full browser journey in target browsers before treating compatibility as established. Optional WebMCP page navigation is feature-detected; it does not expose document contents or keys. Its host-specific registration has not been verified.

## AWS deployment

`infra/site.json` provisions a dedicated private, encrypted, versioned S3 bucket behind CloudFront Origin Access Control. HTTPS, Brotli/gzip, HTTP/2 and HTTP/3, a restrictive content-security policy, HSTS, and no third-party resources are configured. Assets use content hashes and immutable caching; HTML revalidates. S3 access is limited to the distribution and non-TLS S3 access is denied. No document-processing server, upload API, or analytics resources are created.

The stack is deployed in **us-east-1**, which is required for CloudFront's ACM certificate. S3 resides in that same region. This site is separate from existing application infrastructure. AWS hosting and domain registration incur charges to the owner even though the signing app is free to users.

With suitable credentials in the environment:

```sh
# First deploy on an AWS-provided CloudFront hostname:
./scripts/deploy.sh

# After localpdfsign.com is registered and its Route 53 zone is available:
DOMAIN_NAME=localpdfsign.com HOSTED_ZONE_ID=Z_YOUR_ZONE ./scripts/deploy.sh
```

If using the credential loader from `language_web`, invoke the script through that repository's `./run` wrapper. Never copy credentials into this project.

`register-domain.sh` checks availability and displays current pricing. Supply a local Route 53 ContactDetail JSON file with accurate registrant contact information, then set its explicit purchase confirmation variable to register for one year with renewal enabled and contact privacy requested. Keep that file outside the repository. Registration may require confirming an email from the registrar. Domain purchase is separate from stack deployment.

Required operator capabilities include CloudFormation stack/change-set management, S3 bucket configuration/object deployment, CloudFront distribution/OAC/response-header-policy/invalidation management, and (for a custom domain) ACM certificate and Route 53 record management. Domain purchase additionally requires Route 53 Domains availability/pricing/registration/operation-status permissions. The template creates no IAM identities or roles.

At initial implementation, the existing AWS `MBP` principal could read S3 and CloudFront configuration but was denied `s3:CreateBucket` and `route53domains:CheckDomainAvailability`. No domain or hosting resources were created. An authorized AWS principal is required to complete deployment.

## License

MIT. Bundled fonts retain their SIL Open Font License; see `public/font-licenses/`.
