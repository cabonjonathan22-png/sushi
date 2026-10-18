// Assemble le guide : images optimisées + repères → HTML → PDF (couverture + corps), fusionnés.
// Usage : node build.mjs <fichier PDF de sortie>
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { META, PARTS } = await import(process.env.CONTENT ?? "./content.mjs");
const req = createRequire(new URL("../../package.json", import.meta.url));
const sharp = req("sharp");
const { chromium } = req("playwright-core");
const { PDFDocument } = req("pdf-lib");

const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const OUT_PDF = process.argv[2] ?? `${DIR}guide.pdf`;
mkdirSync(`${DIR}img`, { recursive: true });

const SIDEBAR = 260; // barre latérale du back-office, retirée des captures (sauf écrans où elle est expliquée)
const KEEP_SIDEBAR = new Set(["admin-accueil"]);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Image optimisée + repères en % (après recadrage éventuel). */
async function prepare(name) {
  const meta = JSON.parse(readFileSync(`${DIR}shots/${name}.json`, "utf8"));
  const crop = name.startsWith("admin-") && !KEEP_SIDEBAR.has(name) && meta.w >= 1200 && !["admin-connexion", "admin-code", "admin-cuisine"].includes(name) ? SIDEBAR : 0;
  const src = sharp(`${DIR}shots/${name}.jpg`);
  const { width: pw, height: ph } = await src.metadata();
  const scale = pw / meta.w; // téléphone : capture en 2× (pixels) pour des coordonnées en points CSS
  const out = `${DIR}img/${name}.jpg`;
  await sharp(`${DIR}shots/${name}.jpg`)
    .extract({ left: Math.round(crop * scale), top: 0, width: pw - Math.round(crop * scale), height: ph })
    .resize({ width: Math.min(1300, pw - Math.round(crop * scale)), withoutEnlargement: true })
    .jpeg({ quality: 74, mozjpeg: true }).toFile(out);
  const w = meta.w - crop, h = meta.h;
  const boxes = meta.boxes.map((b) => b && {
    x: ((b.x - crop) / w) * 100, y: (b.y / h) * 100, w: (b.w / w) * 100, h: (b.h / h) * 100,
  });
  return { file: `img/${name}.jpg`, w, h, boxes };
}

/**
 * Figure avec repères. start = premier numéro. Renvoie [html, numéros attribués (null = absent)].
 * Capture très haute (pleine page) : découpée en 2 ou 3 colonnes côte à côte pour rester lisible.
 */
function figure(img, start, { maxHmm = 150, maxWmm = 180 } = {}) {
  const ratio = img.h / img.w;
  const cols = maxWmm < 100 ? 1 : ratio > 3.4 ? 3 : ratio > 1.75 ? 2 : 1;
  const gap = 4;
  const pieceRatio = ratio / cols;
  const width = Math.min((maxWmm - gap * (cols - 1)) / cols, maxHmm / pieceRatio);
  const pieceH = width * pieceRatio;
  let n = start;
  const nums = img.boxes.map((b) => (b ? n++ : null));
  const marks = img.boxes.map((b, i) => {
    if (!b) return "";
    const bw = Math.max(b.w, 0.6), bh = Math.max(b.h, 0.6 / cols);
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    return `<div class="box" style="left:${x}%;top:${y}%;width:${Math.min(bw, 100 - x)}%;height:${Math.min(bh, 100 - y)}%"></div>
<div class="num" style="left:${x}%;top:${y}%">${nums[i]}</div>`;
  }).join("");
  if (cols === 1) return [`<div class="shot" style="width:${width.toFixed(1)}mm"><img src="${img.file}" alt="">${marks}</div>`, nums];
  const pieces = Array.from({ length: cols }, (_, c) => `<div class="shot piece" style="width:${width.toFixed(1)}mm;height:${pieceH.toFixed(1)}mm">
<div class="inner" style="top:-${(pieceH * c).toFixed(2)}mm;height:${(pieceH * cols).toFixed(2)}mm"><img src="${img.file}" alt="">${marks}</div></div>`).join("");
  return [`<div class="pieces">${pieces}</div>`, nums];
}

function legendHtml(items, nums) {
  return `<ol class="legend">${items.map((t, i) => {
    const n = nums[i];
    return `<li>${n ? `<span class="n">${n}</span>` : `<span class="n n-off">•</span>`}<span>${t}</span></li>`;
  }).join("")}</ol>`;
}

const notes = (b) => [
  ...(b.tips ?? []).map((t) => `<p class="tip"><strong>Bon à savoir.</strong> ${t}</p>`),
  ...(b.warn ?? []).map((t) => `<p class="warn"><strong>Attention.</strong> ${t}</p>`),
].join("");

// ---------------------------------------------------------------- Corps
let body = "";
let toc = "";
for (const [pi, part] of PARTS.entries()) {
  const pn = pi + 1;
  body += `<section class="part"><div class="part-head"><span class="part-num">Partie ${pn}</span><h1>${part.title}</h1>${part.intro ? `<p class="lead">${part.intro}</p>` : ""}</div>`;
  toc += `<li><span class="toc-part">${pn}. ${part.title}</span><ol>`;
  for (const [bi, b] of part.blocks.entries()) {
    const id = `${pn}.${bi + 1}`;
    toc += `<li>${id} ${b.title}</li>`;
    body += `<article class="block${b.type === "text" ? " text" : " has-img"}"><h2><span class="sec">${id}</span>${b.title}</h2>`;
    if (b.text) body += `<p>${b.text}</p>`;
    if (b.type === "text") body += b.html;
    if (b.img) {
      const img = await prepare(b.img);
      const [fig, nums] = figure(img, 1);
      if (b.legend.length !== img.boxes.length) console.warn(`⚠ ${b.img} : ${b.legend.length} légendes pour ${img.boxes.length} repères`);
      body += `<figure>${fig}</figure>${legendHtml(b.legend, nums)}`;
    }
    if (b.row) {
      let n = 1, all = [], figs = "";
      for (const name of b.row) {
        const img = await prepare(name);
        const [fig, nums] = figure(img, n, { maxHmm: 120, maxWmm: 56 });
        n += nums.filter(Boolean).length;
        all = all.concat(nums);
        figs += fig;
      }
      body += `<figure class="row">${figs}</figure>${legendHtml(b.legend, all)}`;
    }
    body += notes(b) + `</article>`;
  }
  toc += `</ol></li>`;
  body += `</section>`;
}

const css = `
@page { size: A4; margin: 16mm 15mm 18mm; }
:root { --char:#1f1a17; --paper:#fbf7f1; --linen:#f3ebdf; --line:#e7dccb; --gold:#b88a44; --brand:#e8501f; --muted:#6f655c; }
* { box-sizing: border-box; }
body { margin:0; font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 10.2pt; line-height: 1.5; color: var(--char); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4 { font-family: Fraunces, Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
p { margin: 0 0 3mm; }
strong { font-weight: 600; }
.toc { page-break-after: always; }
.toc h1 { font-size: 26pt; margin: 0 0 6mm; }
.toc > ol { list-style: none; padding: 0; columns: 2; column-gap: 10mm; }
.toc > ol > li { break-inside: avoid; margin-bottom: 4mm; }
.toc-part { font-family: Fraunces, Georgia, serif; font-size: 12.5pt; display: block; border-bottom: 1px solid var(--line); padding-bottom: 1mm; margin-bottom: 1.5mm; }
.toc ol ol { list-style: none; padding: 0; margin: 0; font-size: 9.2pt; color: var(--muted); }
.toc ol ol li { padding: 0.4mm 0; }
.part { page-break-before: always; }
.part-head { background: var(--char); color: var(--paper); border-radius: 5mm; padding: 9mm 10mm; margin-bottom: 7mm; }
.part-num { font-size: 8.5pt; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.part-head h1 { font-size: 26pt; margin: 2mm 0 3mm; line-height: 1.1; }
.lead { color: #e9e0d3; font-size: 10.8pt; margin: 0; }
.block { margin: 0 0 9mm; }
.block.has-img { break-inside: avoid; }
.part:last-child .block:last-child { break-before: page; } /* glossaire entier sur sa page */
.block h2 { font-size: 16pt; margin: 0 0 2.5mm; display: flex; gap: 3mm; align-items: baseline; break-after: avoid; }
.sec { font-family: Inter, Arial, sans-serif; font-size: 9pt; font-weight: 600; color: var(--gold); }
figure { margin: 2mm 0 3mm; break-inside: avoid; display: flex; justify-content: center; }
figure.row { gap: 6mm; align-items: flex-start; }
.shot { position: relative; border: 1px solid var(--line); border-radius: 2.5mm; overflow: visible; box-shadow: 0 2mm 5mm rgba(31,26,23,0.12); }
.shot img { display: block; width: 100%; border-radius: 2.5mm; }
.pieces { display: flex; gap: 4mm; justify-content: center; }
.piece { overflow: hidden; }
.piece .inner { position: absolute; left: 0; width: 100%; }
.piece .inner img { height: 100%; border-radius: 0; }
.box { position: absolute; border: 0.6mm solid var(--brand); border-radius: 1.2mm; box-shadow: 0 0 0 0.8mm rgba(232,80,31,0.18); }
.num { position: absolute; transform: translate(-45%, -45%); width: 5.6mm; height: 5.6mm; border-radius: 50%; background: var(--brand); color: #fff; font-weight: 700; font-size: 8.2pt; display: grid; place-items: center; box-shadow: 0 0 0 0.6mm #fff, 0 1mm 2mm rgba(0,0,0,0.25); }
.legend { list-style: none; padding: 0; margin: 2mm 0 3mm; display: grid; gap: 1.6mm; break-inside: avoid; }
.legend li { display: grid; grid-template-columns: 6.5mm 1fr; gap: 2mm; align-items: start; }
.legend .n { width: 5.4mm; height: 5.4mm; border-radius: 50%; background: var(--brand); color: #fff; font-weight: 700; font-size: 8pt; display: grid; place-items: center; margin-top: 0.3mm; }
.legend .n-off { background: var(--linen); color: var(--muted); }
.tip, .warn { border-radius: 2.5mm; padding: 3mm 4mm; margin: 2mm 0; break-inside: avoid; }
.tip { background: #eef6ee; border-left: 1.2mm solid #2f7d3a; }
.warn { background: #fdf0e6; border-left: 1.2mm solid var(--brand); }
.tbl { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.4pt; break-inside: avoid; }
.tbl th { text-align: left; background: var(--linen); padding: 2mm 3mm; font-weight: 600; }
.tbl td { padding: 2mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; }
.st { display: inline-block; padding: 0.4mm 2.4mm; border-radius: 99px; background: var(--linen); font-weight: 600; font-size: 8.6pt; }
.st-new { background: #fde3d8; color: #a33a12; } .st-ok { background: #def3e2; color: #1d6b2c; } .st-ko { background: #f8dcdc; color: #9b1c1c; }
.check h4 { font-size: 12pt; margin: 4mm 0 1.5mm; }
.check ul { margin: 0; padding-left: 5mm; }
.check li { margin: 1mm 0; }
.check li::marker { content: "☐  "; }
.gloss dt { font-weight: 600; margin-top: 2.5mm; break-after: avoid; }
.gloss { margin-bottom: 0; }
.steps { counter-reset: st; list-style: none; padding: 0; margin: 2mm 0 3mm; display: grid; gap: 1.8mm; }
.steps li { counter-increment: st; display: grid; grid-template-columns: 7mm 1fr; gap: 2mm; }
.steps li::before { content: counter(st); width: 5.6mm; height: 5.6mm; border-radius: 1.4mm; background: var(--char); color: #fff; font-weight: 700; font-size: 8pt; display: grid; place-items: center; margin-top: 0.3mm; }
.howto { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm 5mm; margin: 0 0 5mm; break-inside: avoid; }
.howto h3 { font-size: 13pt; margin: 0 0 1mm; }
.howto .where { font-size: 8.8pt; color: var(--muted); margin-bottom: 1mm; }
.menu-tbl td:first-child { white-space: nowrap; font-weight: 600; }
.gloss dd { margin: 0.5mm 0 0 0; color: #3c342e; }
`;

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">`;

const bodyHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8">${fonts}<style>${css}</style></head><body>
<section class="toc"><h1>Sommaire</h1><ol>${toc}</ol></section>
${body}</body></html>`;

const coverHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8">${fonts}<style>
@page { size: A4; margin: 0; }
body { margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.c { width: 210mm; height: 297mm; background: #1f1a17; color: #fbf7f1; position: relative; overflow: hidden; font-family: Inter, Arial, sans-serif; }
.c img { position:absolute; right: 14mm; top: 58mm; width: 88mm; height: 150mm; object-fit: cover; border-radius: 44mm 44mm 5mm 5mm; box-shadow: 0 10mm 25mm rgba(0,0,0,.45); }
.t { position: absolute; left: 18mm; top: 28mm; width: 92mm; }
.brand { font-family: Fraunces, Georgia, serif; font-size: 22pt; } .brand em { color: #e8501f; }
.k { margin-top: 60mm; font-size: 9pt; letter-spacing: .25em; text-transform: uppercase; color: #b88a44; font-weight: 600; }
h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: 40pt; line-height: 1.02; margin: 4mm 0 6mm; }
.s { font-size: 13pt; color: #e9e0d3; max-width: 95mm; }
.f { position: absolute; left: 18mm; bottom: 18mm; font-size: 9pt; color: #b9ad9f; }
.glow { position:absolute; left:-30mm; bottom:-40mm; width: 120mm; height: 120mm; border-radius: 50%; background: rgba(232,80,31,.22); filter: blur(30mm); }
</style></head><body><div class="c"><div class="glow"></div>
<img src="img/site-accueil-hero.jpg" alt="">
<div class="t"><div class="brand">Yaoma <em>Sushi</em></div>
<div class="k">${esc(META.coverKicker ?? "Site & back-office")}</div><h1>${esc(META.title)}</h1>
<p class="s">${esc(META.coverText ?? "Le site de commande et le back-office, écran par écran : service au quotidien, carte, réglages et comptabilité.")}</p></div>
<div class="f">${esc(META.version)}</div></div></body></html>`;

// Visuel de couverture : la photo du bandeau d'accueil.
await sharp(new URL(`../../storage/${process.env.COVER_IMAGE ?? "products/FreeDelivery-e615f5-1920.webp"}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")).resize({ width: 1100, height: 1500, fit: "cover", position: "attention" }).jpeg({ quality: 84 }).toFile(`${DIR}img/site-accueil-hero.jpg`);

writeFileSync(`${DIR}guide.html`, bodyHtml);
writeFileSync(`${DIR}cover.html`, coverHtml);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
const render = async (file, opts) => {
  await page.goto(pathToFileURL(`${DIR}${file}`).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, ...opts });
};
const cover = await render("cover.html", {});
const main = await render("guide.html", {
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Arial;font-size:7.5pt;color:#8a7f74;padding:0 15mm;display:flex;justify-content:space-between"><span>${esc(META.title)} — ${esc(META.brand)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();

const doc = await PDFDocument.create();
for (const bytes of [cover, main]) {
  const src = await PDFDocument.load(bytes);
  for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
}
doc.setTitle(`${META.title} — ${META.brand}`);
doc.setAuthor(META.brand);
doc.setSubject(META.subtitle);
doc.setLanguage("fr-FR");
writeFileSync(OUT_PDF, await doc.save());
console.log(`PDF : ${OUT_PDF} (${doc.getPageCount()} pages, ${(readFileSync(OUT_PDF).length / 1e6).toFixed(1)} Mo)`);
