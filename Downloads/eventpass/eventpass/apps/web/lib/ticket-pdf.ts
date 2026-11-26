import fs from "fs/promises";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import bwipjs from "bwip-js/node";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import type { FullOrder } from "@rideau/db";
import { countryName, ticketNumber } from "@rideau/db/src/format";
import { siteLogo, siteName } from "./site";
import { TICKET_LOGO, TICKET_LOGO_RATIO } from "./ticket-logo";
import * as F from "./ticket-fonts";

/** Toutes les informations d'un billet : elles viennent de l'événement saisi dans l'admin et de la commande. */
export type TicketForPdf = {
  code: string;              // contenu du QR code (unique, non devinable)
  number: string;            // numéro lisible : EV + date + séquence
  seat: string | null;       // siège (A12) ou null = placement libre
  eventTitle: string;
  startsAt: Date;
  organizer: string | null;
  venueName: string;
  city: string;
  country: string;           // nom du pays en français
  ticketTypeName: string;    // catégorie : VIP, Orchestre…
  holder: string;            // titulaire
  orderRef: string;
  imageUrl: string | null;   // image de couverture de l'événement
};

export function ticketsFromOrder(order: FullOrder): TicketForPdf[] {
  return order.items.flatMap((item) => {
    const ev = item.ticketType.event;
    return item.tickets.map((t) => ({
      code: t.code,
      number: ticketNumber(t.serial, ev.startsAt),
      seat: t.seat,
      eventTitle: ev.title,
      startsAt: ev.startsAt,
      organizer: ev.organizer,
      venueName: ev.venue.name,
      city: ev.venue.city,
      country: countryName(ev.venue.country),
      ticketTypeName: item.ticketType.name,
      holder: order.holderName ?? order.email ?? "",
      orderRef: order.id.slice(-8).toUpperCase(),
      imageUrl: ev.images[0]?.url ?? null,
    }));
  });
}

/* ------------------------------------------------------------------ */

const W = 800, H = 400, SPLIT = 590; // page = billet ; panneau principal à gauche, souche à droite
const INK = rgb(0.078, 0.075, 0.122);
const PINK = rgb(1, 0.478, 0.659);
const MAGENTA = rgb(0.839, 0.184, 0.42);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.4, 0.4, 0.5);

/** Image de l'événement : URL (stockage S3) ou fichier local (développement), recadrée au format du panneau. */
async function loadImage(url: string): Promise<Buffer | null> {
  try {
    let raw: Buffer;
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      raw = Buffer.from(await res.arrayBuffer());
    } else {
      raw = await fs.readFile(path.join(process.cwd(), "public", url));
    }
    return await sharp(raw).resize(SPLIT * 2, H * 2, { fit: "cover", position: "centre" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

type Fonts = { title: PDFFont; bold: PDFFont; regular: PDFFont; italic: PDFFont };

const glyphCache = new WeakMap<PDFFont, Set<number>>();
/** Remplace par « ? » les caractères absents de la police (évite une erreur d'encodage sur un titre exotique). */
function safe(font: PDFFont, text: string) {
  let set = glyphCache.get(font);
  if (!set) glyphCache.set(font, (set = new Set(font.getCharacterSet())));
  return [...text.replace(/\s+/g, " ")].map((ch) => (set!.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of safe(font, text).split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Plus grande taille pour laquelle le texte tient dans maxLines lignes et maxH points de haut ; sinon tronqué avec « … ». */
function fitLines(font: PDFFont, text: string, maxW: number, maxLines: number, max: number, min: number, maxH = Infinity) {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrap(font, text, size, maxW);
    if (lines.length <= maxLines && lines.length * size * 1.02 <= maxH && lines.every((l) => font.widthOfTextAtSize(l, size) <= maxW)) return { size, lines };
  }
  const lines = wrap(font, text, min, maxW);
  if (lines.length > maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, min) > maxW) last = last.slice(0, -1);
    return { size: min, lines: [...lines.slice(0, maxLines - 1), `${last.trimEnd()}…`] };
  }
  return { size: min, lines };
}

function fitSize(font: PDFFont, text: string, maxW: number, max: number, min: number) {
  let s = max;
  while (s > min && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  return s;
}

function rrect(page: PDFPage, x: number, top: number, w: number, h: number, r: number, o: { color?: ReturnType<typeof rgb>; opacity?: number; border?: ReturnType<typeof rgb>; borderWidth?: number }) {
  const d = `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  page.drawSvgPath(d, { x, y: top, color: o.color, opacity: o.opacity, borderColor: o.border, borderWidth: o.borderWidth });
}

function centered(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color = WHITE) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

const dateParts = (d: Date) => {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: "Europe/Paris" }).format(d);
  return {
    weekday: f({ weekday: "long" }).toUpperCase(),
    day: f({ day: "numeric" }),
    monthYear: f({ month: "long", year: "numeric" }).toUpperCase(),
    time: f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(":", "H"),
  };
};

const OVERLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="800"><defs>
<linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset=".28" stop-color="#14131f" stop-opacity="0"/><stop offset="1" stop-color="#14131f" stop-opacity=".88"/></linearGradient>
<linearGradient id="v" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#14131f" stop-opacity=".9"/><stop offset=".34" stop-color="#14131f" stop-opacity="0"/></linearGradient></defs>
<rect width="1180" height="800" fill="#14131f" fill-opacity=".28"/><rect width="1180" height="800" fill="url(#h)"/><rect width="1180" height="800" fill="url(#v)"/></svg>`;

/** Fond de secours (événement sans image) : dégradé de scène avec faisceaux. */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="800"><defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d8d"/><stop offset="1" stop-color="#3a2a9c"/></linearGradient></defs>
<rect width="1180" height="800" fill="url(#g)"/><g fill="#fff"><polygon points="420,-20 160,800 320,800" opacity=".16"/><polygon points="420,-20 700,800 860,800" opacity=".12"/></g>
<circle cx="380" cy="500" r="120" fill="#fff" opacity=".85"/></svg>`;

function drawPin(page: PDFPage, x: number, y: number) {
  page.drawSvgPath("M0 0C-9 0 -14 7 -14 14C-14 24 0 40 0 40C0 40 14 24 14 14C14 7 9 0 0 0Z", { x, y: y + 38, color: PINK, scale: 0.55 });
  page.drawCircle({ x, y: y + 30.4, size: 3.2, color: INK });
}

export async function buildTicketsPdf(tickets: TicketForPdf[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embed = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const fonts: Fonts = { title: await embed(F.bricolage800), bold: await embed(F.figtree700), regular: await embed(F.figtree400), italic: await embed(F.figtree700i) };

  const overlay = await pdf.embedPng(await sharp(Buffer.from(OVERLAY_SVG)).png().toBuffer());
  const fallback = await pdf.embedJpg(await sharp(Buffer.from(FALLBACK_SVG)).jpeg({ quality: 88 }).toBuffer());
  const logoImg = siteLogo() ? await pdf.embedPng(Buffer.from(TICKET_LOGO, "base64")) : null;
  const images = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>> | null>();
  for (const t of tickets) {
    if (t.imageUrl && !images.has(t.imageUrl)) {
      const jpg = await loadImage(t.imageUrl);
      images.set(t.imageUrl, jpg ? await pdf.embedJpg(jpg) : null);
    }
  }

  for (const t of tickets) {
    const page = pdf.addPage([W, H]);
    const img = t.imageUrl ? images.get(t.imageUrl) : null;
    const { title, bold, regular, italic } = fonts;

    // --- Panneau principal -------------------------------------------------
    page.drawRectangle({ x: 0, y: 0, width: SPLIT, height: H, color: INK });
    page.drawImage(img ?? fallback, { x: 0, y: 0, width: SPLIT, height: H });
    page.drawImage(overlay, { x: 0, y: 0, width: SPLIT, height: H }); // assombrit à droite (titre, date) et en bas (infos)

    // Marque : logo (ou nom en texte si SITE_LOGO=none)
    if (logoImg) {
      // Bandeau sombre derrière le logo : lisible quelle que soit l'image de l'événement
      const h = 30, w = h * TICKET_LOGO_RATIO;
      rrect(page, 20, H - 12, w + 24, h + 16, 12, { color: INK, opacity: 0.82 });
      page.drawImage(logoImg, { x: 32, y: H - 12 - 8 - h, width: w, height: h });
    } else {
      page.drawText(safe(bold, siteName()), { x: 30, y: 358, size: 22, font: title, color: WHITE });
      page.drawCircle({ x: 34 + title.widthOfTextAtSize(safe(bold, siteName()), 22), y: 360, size: 3.5, color: PINK });
    }

    // Titre
    const fit = fitLines(title, t.eventTitle.toUpperCase(), 232, 4, 40, 18, 150);
    let y = 318 - fit.size * 0.2;
    fit.lines.forEach((line, i) => {
      const last = fit.lines.length > 1 && i === fit.lines.length - 1;
      page.drawText(line, { x: 214, y, size: fit.size, font: title, color: last ? PINK : WHITE });
      y -= fit.size * 1.02;
    });

    // Bloc date + heure
    const dp = dateParts(t.startsAt);
    rrect(page, 462, 372, 114, 186, 16, { color: INK, opacity: 0.6, border: WHITE, borderWidth: 1.3 });
    centered(page, dp.weekday, bold, fitSize(bold, dp.weekday, 96, 14, 9), 519, 340);
    centered(page, dp.day, title, dp.day.length > 1 ? 58 : 66, 519, 282, PINK);
    centered(page, dp.monthYear, bold, fitSize(bold, dp.monthYear, 96, 13, 8), 519, 262);
    page.drawLine({ start: { x: 478, y: 247 }, end: { x: 560, y: 247 }, thickness: 1, color: WHITE, opacity: 0.5 });
    page.drawCircle({ x: 492, y: 222, size: 8, borderColor: PINK, borderWidth: 1.6, color: undefined });
    page.drawLine({ start: { x: 492, y: 222 }, end: { x: 492, y: 227 }, thickness: 1.4, color: PINK });
    page.drawLine({ start: { x: 492, y: 222 }, end: { x: 496, y: 220 }, thickness: 1.4, color: PINK });
    page.drawText(dp.time, { x: 506, y: 215, size: 19, font: bold, color: WHITE });

    // Lieu + organisateur
    drawPin(page, 40, 117);
    const venue = fitLines(bold, t.venueName, 215, 2, 15, 11);
    let vy = 148;
    venue.lines.forEach((l) => { page.drawText(l, { x: 62, y: vy, size: venue.size, font: bold, color: WHITE }); vy -= venue.size * 1.1; });
    page.drawText(safe(regular, `${t.city}, ${t.country}`), { x: 62, y: vy - 1, size: 12, font: regular, color: rgb(0.85, 0.84, 0.93) });
    if (t.organizer) {
      page.drawLine({ start: { x: 305, y: 112 }, end: { x: 305, y: 152 }, thickness: 1, color: WHITE, opacity: 0.35 });
      page.drawText("Organisé par", { x: 322, y: 140, size: 10.5, font: regular, color: rgb(0.85, 0.84, 0.93) });
      const org = fitLines(bold, t.organizer, 230, 2, 15, 11);
      let oy = 124;
      org.lines.forEach((l) => { page.drawText(l, { x: 322, y: oy, size: org.size, font: bold, color: WHITE }); oy -= org.size * 1.1; });
    }

    // Barre d'informations : participant | catégorie | siège
    rrect(page, 26, 82, 538, 56, 16, { color: INK, opacity: 0.75, border: PINK, borderWidth: 1.4 });
    const cols: [string, string, number, number][] = [
      ["Participant", t.holder || "—", 44, 236],
      ["Catégorie", t.ticketTypeName, 300, 130],
      ["Siège", t.seat ?? "Libre", 452, 100],
    ];
    cols.forEach(([label, value, x, maxW], i) => {
      page.drawText(label, { x, y: 60, size: 10, font: regular, color: rgb(0.85, 0.84, 0.93) });
      const v = safe(bold, value);
      page.drawText(v, { x, y: 40, size: fitSize(bold, v, maxW, 16, 9), font: bold, color: i === 1 || i === 2 ? PINK : WHITE });
      if (i > 0) page.drawLine({ start: { x: x - 14, y: 34 }, end: { x: x - 14, y: 70 }, thickness: 1, color: WHITE, opacity: 0.35 });
    });

    // --- Souche (droite) ---------------------------------------------------
    page.drawRectangle({ x: SPLIT, y: 0, width: W - SPLIT, height: H, color: WHITE });
    const cx = SPLIT + (W - SPLIT) / 2;
    rrect(page, SPLIT + 16, 376, W - SPLIT - 32, 32, 10, { color: MAGENTA });
    centered(page, "Billet d'événement", bold, 13.5, cx, 355);

    const qr = await pdf.embedPng(await QRCode.toBuffer(t.code, { margin: 0, width: 420, errorCorrectionLevel: "M" }));
    page.drawImage(qr, { x: cx - 74, y: 190, width: 148, height: 148 });
    centered(page, `N° Billet : ${t.number}`, bold, 11, cx, 170, INK);
    const bar = await pdf.embedPng(await bwipjs.toBuffer({ bcid: "code128", text: t.number, scale: 3, height: 12, includetext: false }));
    page.drawImage(bar, { x: SPLIT + 22, y: 112, width: W - SPLIT - 44, height: 42 });
    centered(page, "Bon événement !", italic, 19, cx, 66, INK);
    page.drawLine({ start: { x: cx - 52, y: 58 }, end: { x: cx + 52, y: 58 }, thickness: 2.2, color: PINK });
    centered(page, `Commande ${t.orderRef}`, regular, 8, cx, 24, MUTED);

    // Perforation et encoches
    page.drawLine({ start: { x: SPLIT, y: 0 }, end: { x: SPLIT, y: H }, thickness: 1.2, color: MUTED, dashArray: [4, 4] });
    for (const [x, yy] of [[SPLIT, H], [SPLIT, 0], [0, H / 2], [W, H / 2]] as const) page.drawCircle({ x, y: yy, size: 13, color: WHITE });
  }
  return Buffer.from(await pdf.save());
}
