import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  DISPLAY_STATUS_LABEL,
  INVOICE_KIND_LABEL,
  displayStatus,
  formatEuros,
  installmentLabel,
  type Invoice,
  type InvoiceLine,
} from "./types";

// ---------------------------------------------------------------------------
// Server-side invoice PDF generation.
//
// Produces a self-contained A4 invoice PDF from an invoice + its lines, styled
// with the tenant's white-label branding (name, logo, primary colour) when
// enabled. Internal fields are never rendered — most importantly the staff-only
// `invoice.notes`. Uses only pdf-lib's standard Helvetica fonts (no native
// deps, no external font files), so it runs in any Node server runtime.
// ---------------------------------------------------------------------------

/** Minimal branding shape needed to brand an invoice PDF. */
export type InvoicePdfBranding = {
  tenantName: string;
  whiteLabelEnabled: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type InvoicePdfInput = {
  invoice: Invoice;
  lines: InvoiceLine[];
  branding: InvoicePdfBranding;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

const INK = rgb(0.13, 0.15, 0.18);
const MUTED = rgb(0.45, 0.48, 0.52);
const HAIRLINE = rgb(0.85, 0.86, 0.88);
const DEFAULT_ACCENT = rgb(0.1, 0.4, 0.95);

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** Parse a #rrggbb / #rgb hex colour to a pdf-lib RGB, or null if invalid. */
function parseHexColor(hex: string | null): RGB | null {
  if (!hex) return null;
  const m = hex.trim().replace(/^#/, "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Returns true when an IP address is a public unicast address — i.e. NOT a
 * loopback, private, link-local (incl. the 169.254.169.254 metadata range),
 * CGNAT, unique-local or reserved address. Used to block SSRF.
 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return false;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return false; // "this" network
    if (a === 10) return false; // private
    if (a === 127) return false; // loopback
    if (a === 169 && b === 254) return false; // link-local incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast / reserved
    return true;
  }
  if (family === 6) {
    const v6 = ip.toLowerCase().split("%")[0] ?? "";
    if (v6 === "::" || v6 === "::1") return false; // unspecified / loopback
    if (v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) {
      return false; // link-local fe80::/10
    }
    if (v6.startsWith("fc") || v6.startsWith("fd")) return false; // unique-local fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPublicIp(mapped[1]);
    return true;
  }
  return false;
}

/**
 * Validates a tenant-configured logo URL before any server-side fetch, to
 * prevent SSRF. Requires https, and resolves the hostname to ensure every
 * resolved address is a public unicast IP (blocking localhost, private ranges
 * and the cloud metadata endpoint). Returns true when the URL is safe to fetch.
 */
export async function isLogoUrlFetchSafe(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  if (!host) return false;
  // Literal IP in the URL: validate directly.
  if (isIP(host)) return isPublicIp(host);
  // Hostname: resolve and ensure all addresses are public.
  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}

/**
 * Best-effort fetch + embed of a branding logo. Returns null on any failure
 * (unsafe URL, network, unsupported format, oversized) so a broken logo never
 * blocks the invoice. Only PNG and JPG are embeddable by pdf-lib.
 */
async function embedLogo(
  pdf: PDFDocument,
  logoUrl: string | null,
): Promise<{ width: number; height: number; image: Awaited<ReturnType<PDFDocument["embedPng"]>> } | null> {
  if (!logoUrl) return null;
  if (!(await isLogoUrlFetchSafe(logoUrl))) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(logoUrl, { signal: controller.signal, redirect: "error" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 2_000_000) return null;
    const isPng =
      contentType.includes("png") ||
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e);
    const isJpg =
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      (bytes[0] === 0xff && bytes[1] === 0xd8);
    const image = isPng
      ? await pdf.embedPng(bytes)
      : isJpg
        ? await pdf.embedJpg(bytes)
        : null;
    if (!image) return null;
    // Constrain to a tidy header box, preserving aspect ratio.
    const maxW = 160;
    const maxH = 56;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    return { image, width: image.width * scale, height: image.height * scale };
  } catch {
    return null;
  }
}

/** Truncate text to fit a max width at a given font size, adding an ellipsis. */
function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (
    result.length > 1 &&
    font.widthOfTextAtSize(result + "…", size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }
  return result + "…";
}

/**
 * Generate a branded invoice PDF. Returns the raw PDF bytes. Never renders
 * internal-only fields (e.g. invoice.notes).
 */
export async function generateInvoicePdf(
  input: InvoicePdfInput,
): Promise<Uint8Array> {
  const { invoice, lines, branding } = input;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factuur ${String(invoice.invoice_no).padStart(4, "0")}`);
  pdf.setProducer("NXTDRIVE");
  pdf.setCreator("NXTDRIVE");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const accent =
    (branding.whiteLabelEnabled ? parseHexColor(branding.primaryColor) : null) ??
    DEFAULT_ACCENT;
  const logo = branding.whiteLabelEnabled
    ? await embedLogo(pdf, branding.logoUrl)
    : null;

  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: RGB } = {},
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
  };

  const drawRight = (
    text: string,
    rightX: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: RGB } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    const w = f.widthOfTextAtSize(text, size);
    drawText(text, rightX - w, yPos, opts);
  };

  // --- Header: logo or tenant name (left), invoice title (right) ----------
  const headerTop = y;
  if (logo) {
    page.drawImage(logo.image, {
      x: MARGIN,
      y: headerTop - logo.height,
      width: logo.width,
      height: logo.height,
    });
  } else {
    drawText(fitText(branding.tenantName, fontBold, 18, CONTENT_WIDTH * 0.55), MARGIN, headerTop - 16, {
      size: 18,
      font: fontBold,
    });
  }

  const kindLabel = INVOICE_KIND_LABEL[invoice.kind];
  drawRight(kindLabel.toUpperCase(), A4_WIDTH - MARGIN, headerTop - 4, {
    size: 11,
    font: fontBold,
    color: accent,
  });
  drawRight(
    `#${String(invoice.invoice_no).padStart(4, "0")}`,
    A4_WIDTH - MARGIN,
    headerTop - 22,
    { size: 18, font: fontBold },
  );

  y = headerTop - Math.max(logo ? logo.height : 24, 40) - 24;

  // Accent rule under the header.
  page.drawRectangle({
    x: MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 2,
    color: accent,
  });
  y -= 28;

  // --- Meta block (issued / due / status) ---------------------------------
  const metaRows: { label: string; value: string }[] = [];
  if (invoice.issued_at) {
    metaRows.push({
      label: "Factuurdatum",
      value: dateFmt.format(new Date(invoice.issued_at)),
    });
  } else {
    metaRows.push({
      label: "Aangemaakt",
      value: dateFmt.format(new Date(invoice.created_at)),
    });
  }
  if (invoice.due_date) {
    metaRows.push({
      label: "Vervaldatum",
      value: dateFmt.format(new Date(invoice.due_date)),
    });
  }
  metaRows.push({
    label: "Status",
    value: DISPLAY_STATUS_LABEL[displayStatus(invoice)],
  });
  const term = installmentLabel(invoice);
  if (term) metaRows.push({ label: "Termijn", value: term });

  for (const row of metaRows) {
    drawText(row.label, MARGIN, y, { size: 9, color: MUTED });
    drawText(row.value, MARGIN + 110, y, { size: 10, font: fontBold });
    y -= 16;
  }
  y -= 18;

  // --- Lines table --------------------------------------------------------
  const colDescX = MARGIN;
  const colQtyRightX = MARGIN + CONTENT_WIDTH * 0.72;
  const colAmtRightX = A4_WIDTH - MARGIN;
  const descMaxWidth = colQtyRightX - 60 - colDescX;

  drawText("OMSCHRIJVING", colDescX, y, { size: 8, font: fontBold, color: MUTED });
  drawRight("AANTAL", colQtyRightX, y, { size: 8, font: fontBold, color: MUTED });
  drawRight("BEDRAG", colAmtRightX, y, { size: 8, font: fontBold, color: MUTED });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4_WIDTH - MARGIN, y },
    thickness: 1,
    color: HAIRLINE,
  });
  y -= 18;

  const drawHairline = (yPos: number) => {
    page.drawLine({
      start: { x: MARGIN, y: yPos },
      end: { x: A4_WIDTH - MARGIN, y: yPos },
      thickness: 0.5,
      color: HAIRLINE,
    });
  };

  if (lines.length === 0) {
    drawText("Geen regels.", colDescX, y, { size: 10, color: MUTED });
    y -= 20;
  } else {
    for (const line of lines) {
      drawText(fitText(line.description, font, 10, descMaxWidth), colDescX, y, {
        size: 10,
      });
      drawRight(String(Number(line.quantity)), colQtyRightX, y, {
        size: 10,
        color: MUTED,
      });
      drawRight(formatEuros(line.amount_cents), colAmtRightX, y, {
        size: 10,
      });
      y -= 14;
      drawHairline(y + 4);
      y -= 8;
    }
  }

  // --- Totals -------------------------------------------------------------
  y -= 6;
  const totalsLabelRightX = colQtyRightX + 30;
  const totalRow = (
    label: string,
    value: string,
    bold = false,
  ) => {
    drawRight(label, totalsLabelRightX, y, {
      size: bold ? 11 : 10,
      font: bold ? fontBold : font,
      color: bold ? INK : MUTED,
    });
    drawRight(value, colAmtRightX, y, {
      size: bold ? 11 : 10,
      font: bold ? fontBold : font,
    });
    y -= bold ? 20 : 16;
  };

  totalRow("Subtotaal", formatEuros(invoice.subtotal_cents));
  totalRow("BTW", formatEuros(invoice.tax_cents));
  page.drawLine({
    start: { x: totalsLabelRightX - 80, y: y + 6 },
    end: { x: colAmtRightX, y: y + 6 },
    thickness: 1,
    color: HAIRLINE,
  });
  y -= 6;
  totalRow("Totaal", formatEuros(invoice.total_cents), true);

  // --- Footer -------------------------------------------------------------
  drawFooter(page, font, branding.tenantName);

  return pdf.save();
}

function drawFooter(page: PDFPage, font: PDFFont, tenantName: string) {
  const text = `${tenantName} · Gegenereerd via NXTDRIVE`;
  const size = 8;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (A4_WIDTH - w) / 2,
    y: MARGIN - 24,
    size,
    font,
    color: MUTED,
  });
}
