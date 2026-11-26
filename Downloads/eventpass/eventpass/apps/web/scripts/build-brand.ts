/**
 * Génère toutes les déclinaisons du logo à partir de brand/logo-source.png :
 *   npm run brand:build -w @rideau/web
 * - fond noir -> transparent ; recadrage automatique ;
 * - version horizontale (icône + nom) pour les en-têtes du site et de l'admin ;
 * - version « e-mail » sur fond sombre ; icônes d'onglet ; logo embarqué dans les billets PDF.
 * Pour changer de logo : remplacez brand/logo-source.png (logo sur fond noir uni) puis relancez la commande.
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const root = path.resolve(__dirname, "../../..");
const web = path.join(root, "apps/web");
const admin = path.join(root, "apps/admin");
const DARK = { r: 11, g: 10, b: 16 }; // #0b0a10 : fond sombre des en-têtes

type Box = { left: number; top: number; width: number; height: number };

async function main() {
  const { data, info } = await sharp(path.join(root, "brand/logo-source.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 1) fond (noir) -> transparent, avec un dégradé doux sur les contours
  const rgba = Buffer.from(data);
  for (let i = 0; i < W * H; i++) {
    const m = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    rgba[i * 4 + 3] = m <= 8 ? 0 : m >= 48 ? 255 : Math.round(((m - 8) / 40) * 255);
  }

  // 2) zones de contenu : lignes occupées, séparation icône / nom au plus grand écart vertical
  const solid = (x: number, y: number) => rgba[(y * W + x) * 4 + 3] > 40;
  const rowHas = (y: number) => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; };
  const runs: [number, number][] = [];
  for (let y = 0, start = -1; y <= H; y++) {
    const has = y < H && rowHas(y);
    if (has && start < 0) start = y;
    if (!has && start >= 0) { runs.push([start, y - 1]); start = -1; }
  }
  if (runs.length < 2) throw new Error("Impossible de séparer l'icône du nom : logo inattendu.");
  let split = 0, gap = 0;
  for (let i = 0; i < runs.length - 1; i++) if (runs[i + 1][0] - runs[i][1] > gap) { gap = runs[i + 1][0] - runs[i][1]; split = i; }
  const topRange: [number, number] = [runs[0][0], runs[split][1]];
  const botRange: [number, number] = [runs[split + 1][0], runs[runs.length - 1][1]];

  const bboxIn = (y0: number, y1: number): Box => {
    let x0 = W, x1 = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (solid(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  };
  const markBox = bboxIn(...topRange);
  const wordBox = bboxIn(...botRange);
  const all: Box = {
    left: Math.min(markBox.left, wordBox.left), top: markBox.top,
    width: Math.max(markBox.left + markBox.width, wordBox.left + wordBox.width) - Math.min(markBox.left, wordBox.left),
    height: wordBox.top + wordBox.height - markBox.top,
  };

  const img = () => sharp(rgba, { raw: { width: W, height: H, channels: 4 } });
  const crop = (b: Box, pad = 0) => img().extract({ left: Math.max(0, b.left - pad), top: Math.max(0, b.top - pad), width: Math.min(W, b.width + 2 * pad), height: Math.min(H, b.height + 2 * pad) });

  // 3) version empilée (composition d'origine)
  const stacked = await crop(all, 12).resize({ height: 520 }).png().toBuffer();

  // 4) version horizontale : icône + nom côte à côte
  const LH = 160, WH = 104, GAP = 44;
  const markPng = await crop(markBox).resize({ height: LH }).png().toBuffer();
  const wordPng = await crop(wordBox).resize({ height: WH }).png().toBuffer();
  const mw = (await sharp(markPng).metadata()).width!, ww = (await sharp(wordPng).metadata()).width!;
  const lockup = await sharp({ create: { width: mw + GAP + ww, height: LH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: markPng, left: 0, top: 0 }, { input: wordPng, left: mw + GAP, top: Math.round((LH - WH) / 2) }])
    .png().toBuffer();
  const lw = (await sharp(lockup).metadata()).width!;

  // 5) e-mails : sur fond sombre opaque
  const emailBase = await sharp({ create: { width: lw + 80, height: LH + 56, channels: 4, background: { ...DARK, alpha: 1 } } })
    .composite([{ input: lockup, left: 40, top: 28 }]).png().toBuffer();
  const emailLogo = await sharp(emailBase).resize({ height: 84 }).png().toBuffer(); // le redimensionnement doit venir APRÈS la composition

  // 6) icônes d'onglet : l'icône sur fond sombre arrondi
  const icon = async (size: number, rounded: boolean) => {
    const inner = await sharp(markPng).resize({ width: Math.round(size * 0.78) }).png().toBuffer();
    const im = await sharp(inner).metadata();
    let out = sharp({ create: { width: size, height: size, channels: 4, background: { ...DARK, alpha: 1 } } })
      .composite([{ input: inner, left: Math.round((size - im.width!) / 2), top: Math.round((size - im.height!) / 2) }]);
    if (rounded) {
      const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#fff"/></svg>`);
      out = sharp(await out.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
    }
    return out.png().toBuffer();
  };
  const icon512 = await icon(512, true), apple = await icon(180, false);

  // 7) écriture des fichiers
  const put = async (p: string, buf: Buffer) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, buf); console.log("✓", path.relative(root, p), `${Math.round(buf.length / 1024)} Ko`); };
  await put(path.join(web, "public/logo.png"), lockup);
  await put(path.join(web, "public/logo-stacked.png"), stacked);
  await put(path.join(web, "public/logo-email.png"), emailLogo);
  await put(path.join(admin, "public/logo.png"), lockup);
  for (const app of [web, admin]) { await put(path.join(app, "app/icon.png"), icon512); await put(path.join(app, "app/apple-icon.png"), apple); }
  const ticketLogo = await sharp(lockup).resize({ height: 120 }).png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(ticketLogo).metadata();
  await fs.writeFile(path.join(web, "lib/ticket-logo.ts"), `// Fichier généré par « npm run brand:build » : logo embarqué dans les billets PDF.\nexport const TICKET_LOGO_RATIO = ${(meta.width! / meta.height!).toFixed(4)};\nexport const TICKET_LOGO = "${ticketLogo.toString("base64")}";\n`);
  console.log("✓ apps/web/lib/ticket-logo.ts", `${Math.round(ticketLogo.length / 1024)} Ko`);
}

main().catch((e) => { console.error(e); process.exit(1); });
