export interface Placement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
  label: string;
}
export interface PageGeometry {
  width: number;
  height: number;
  transform: number[];
}
export interface ExportRequest {
  bytes: Uint8Array;
  placements: Placement[];
  geometries: Record<number, PageGeometry>;
  certificate?: Uint8Array;
  password: string;
}
export const fonts = [
  "Caveat",
  "Dancing Script",
  "Great Vibes",
  "Allura",
  "Sacramento",
  "Satisfy",
  "Parisienne",
  "Pacifico",
  "Yellowtail",
  "Homemade Apple",
  "Italianno",
  "Kaushan Script",
];
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
// Map a unit image into PDF user space using the inverse PDF.js viewport.
// Handles CropBox offsets, all page rotations, and nondefault UserUnit values.
export function imageMatrix(
  p: Placement,
  g: PageGeometry,
): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = g.transform,
    det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0)
    throw new Error("This PDF has an unsupported page transform.");
  const inverse = (x: number, y: number) => [
    (d * (x - e) - c * (y - f)) / det,
    (-b * (x - e) + a * (y - f)) / det,
  ];
  const origin = inverse(p.x * g.width, (p.y + p.height) * g.height);
  const right = inverse((p.x + p.width) * g.width, (p.y + p.height) * g.height);
  const top = inverse(p.x * g.width, p.y * g.height);
  return [
    right[0] - origin[0],
    right[1] - origin[1],
    top[0] - origin[0],
    top[1] - origin[1],
    origin[0],
    origin[1],
  ];
}
export function pngBytes(data: string) {
  return Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) =>
    c.charCodeAt(0),
  );
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function formatDate(date: string, format: string) {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) throw new Error("Choose a valid signing date.");
  if (format === "iso") return date;
  if (format === "us") return `${month}/${day}/${year}`;
  if (format === "eu") return `${day}/${month}/${year}`;
  return new Date(+year, +month - 1, +day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
