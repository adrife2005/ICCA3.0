const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { UPLOADS_DIR, ORIGINALS_DIR } = require('./config');

sharp.cache(false);

// Tamaños públicos. El más grande es 2000 px: se ve perfecto en pantalla,
// pero no sirve para imprimir la obra en grande (eso protege a la artista).
const WIDTHS = [480, 960, 1400, 2000];
const MAX_W = 2000;
const QUALITY = 82;
const PIXEL_LIMIT = 120e6; // evita "bombas" de imagen gigantes

// Letras de la fuente Cardo Italic convertidas a trazos (no depende de fuentes del servidor)
const GLYPHS = require('./wm-glyphs.json');

const originalPath = (id) => path.join(ORIGINALS_DIR, `${id}.bin`);
const variantPath = (id, w) => path.join(UPLOADS_DIR, `${id}-${w}.webp`);
const newId = () => crypto.randomBytes(8).toString('hex');

// Lee solo los datos básicos y lanza error si no es una imagen real
async function inspect(buffer) {
  const meta = await sharp(buffer, { limitInputPixels: PIXEL_LIMIT, failOn: 'error' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Imagen inválida');
  return meta;
}

// ---------- marca de agua ----------
function textMarkSvg(text, height) {
  const g = GLYPHS;
  const scale = height / g.upm;
  let x = 0;
  let paths = '';
  for (const ch of String(text)) {
    const glyph = g.glyphs[ch] || g.glyphs['?'];
    if (glyph[1]) paths += `<path transform="translate(${x.toFixed(1)} 0)" d="${glyph[1]}"/>`;
    x += glyph[0];
  }
  const pad = height * 0.25;
  const w = Math.ceil(x * scale + pad * 2);
  const h = Math.ceil((g.asc - g.desc) * scale + pad * 2);
  const base = pad + g.asc * scale;
  const group = `<g transform="translate(${pad} ${base.toFixed(1)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})">${paths}</g>`;
  // Primero un borde oscuro suave (para que se lea sobre fondos claros) y encima el texto claro
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<g fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${(height * 0.09 / scale).toFixed(0)}" stroke-linejoin="round">${group}</g>` +
    `<g fill="#fff" fill-opacity=".72">${group}</g></svg>`
  );
}

async function buildMark(wm, imgW, imgH) {
  if (!wm) return null;
  const short = Math.min(imgW, imgH);
  if (wm.type === 'image') {
    const markW = Math.max(60, Math.round(imgW * 0.16));
    const sig = await sharp(wm.buffer, { limitInputPixels: PIXEL_LIMIT })
      .rotate().resize({ width: markW, withoutEnlargement: false }).ensureAlpha()
      // baja la opacidad de la firma al 70 %
      .composite([{ input: Buffer.from([255, 255, 255, 178]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }])
      .png().toBuffer();
    return sig;
  }
  const height = Math.max(14, Math.round(short * 0.035));
  return sharp(textMarkSvg(wm.text, height)).png().toBuffer();
}

// ---------- generar las versiones públicas ----------
// source = archivo original; wm = null | {type:'text', text} | {type:'image', buffer}
async function renderVariants(id, source, wm) {
  const meta = await inspect(source);
  const rotated = (meta.orientation || 1) >= 5;
  const origW = rotated ? meta.height : meta.width;
  const origH = rotated ? meta.width : meta.height;

  const masterW = Math.min(origW, MAX_W);
  const masterH = Math.round((origH / origW) * masterW);

  // "Master" = la versión más grande, ya rotada, sin metadatos (GPS, cámara) y con la marca
  let master = sharp(source, { limitInputPixels: PIXEL_LIMIT }).rotate().resize({ width: masterW, withoutEnlargement: true });
  const mark = await buildMark(wm, masterW, masterH);
  if (mark) {
    const mm = await sharp(mark).metadata();
    const margin = Math.round(Math.min(masterW, masterH) * 0.025);
    const left = Math.max(0, masterW - mm.width - margin);
    const top = Math.max(0, masterH - mm.height - margin);
    master = master.composite([{ input: mark, left, top }]);
  }
  const masterBuf = await master.png({ compressionLevel: 1 }).toBuffer();

  let widths = WIDTHS.filter((w) => w < masterW);
  widths.push(masterW);
  widths = [...new Set(widths)].sort((a, b) => a - b);

  const stats = await sharp(masterBuf).resize(32).stats();
  const d = stats.dominant || { r: 20, g: 20, b: 20 };
  const color = '#' + [d.r, d.g, d.b].map((n) => n.toString(16).padStart(2, '0')).join('');

  // Miniatura borrosa de ~300 bytes que se ve mientras carga la imagen real
  const tiny = await sharp(masterBuf).resize(24).webp({ quality: 40 }).toBuffer();
  const lqip = 'data:image/webp;base64,' + tiny.toString('base64');

  const sizes = {};
  for (const w of widths) {
    const info = await sharp(masterBuf).resize({ width: w }).webp({ quality: QUALITY, effort: 4 }).toFile(variantPath(id, w));
    sizes[w] = info.size;
  }
  return { id, w: masterW, h: masterH, color, lqip, widths, sizes };
}

// Imagen nueva subida desde el dashboard
async function processUpload(buffer, wm) {
  await inspect(buffer);
  const id = newId();
  // Guardamos el original en una carpeta PRIVADA (nunca se sirve en la web).
  // Sirve para regenerar las imágenes si cambia la marca de agua.
  fs.writeFileSync(originalPath(id), buffer, { mode: 0o600 });
  const r = await renderVariants(id, buffer, wm);
  return { ...r, srcBytes: buffer.length };
}

// Vuelve a generar una imagen ya existente (cambio de marca de agua)
async function reprocess(rec, wm) {
  const oldWidths = JSON.parse(rec.widths);
  let source;
  if (fs.existsSync(originalPath(rec.id))) source = fs.readFileSync(originalPath(rec.id));
  else {
    // Imágenes de la versión anterior: usamos la variante más grande como "original" una sola vez
    source = fs.readFileSync(variantPath(rec.id, oldWidths[oldWidths.length - 1]));
    fs.writeFileSync(originalPath(rec.id), source, { mode: 0o600 });
  }
  removeFiles(rec.id, oldWidths);
  return renderVariants(rec.id, source, wm);
}

const readOriginal = (id) => fs.readFileSync(originalPath(id));

function removeFiles(id, widths, withOriginal) {
  for (const w of widths) { try { fs.unlinkSync(variantPath(id, w)); } catch {} }
  if (withOriginal) { try { fs.unlinkSync(originalPath(id)); } catch {} }
}

// Convierte el registro de la base de datos en lo que usa el sitio
function imageView(rec) {
  if (!rec) return null;
  const widths = typeof rec.widths === 'string' ? JSON.parse(rec.widths) : rec.widths;
  const sizes = typeof rec.sizes === 'string' ? JSON.parse(rec.sizes) : rec.sizes;
  const v = rec.v || 1;
  // ?v= cambia cuando se regenera la imagen, así el navegador no muestra la versión vieja
  const url = (w) => `/uploads/${rec.id}-${w}.webp?v=${v}`;
  const pick = (max) => { const ok = widths.filter((w) => w <= max); return ok.length ? ok[ok.length - 1] : widths[0]; };
  const srcW = pick(1400);
  return {
    id: rec.id,
    thumb: url(pick(960)),
    src: url(srcW),
    full: url(widths[widths.length - 1]),
    srcset: widths.map((w) => `${url(w)} ${w}w`).join(', '),
    w: rec.w, h: rec.h, color: rec.color, lqip: rec.lqip || '',
    kb: Math.round((sizes[srcW] || 0) / 1024),
  };
}

module.exports = { processUpload, reprocess, readOriginal, removeFiles, imageView, MAX_W };
