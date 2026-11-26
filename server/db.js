const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR, ROOT } = require('./config');
const { SECTIONS, ARTWORK_FIELDS, FIELD_INDEX, WATERMARK_KEYS } = require('./schema');
const { processUpload, reprocess, readOriginal, removeFiles, imageView } = require('./images');
const { hashPassword } = require('./auth');

const db = new DatabaseSync(path.join(DATA_DIR, 'icca.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS content (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY, w INTEGER, h INTEGER, color TEXT,
    widths TEXT NOT NULL, sizes TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, year TEXT DEFAULT '', category TEXT DEFAULT '', location TEXT DEFAULT '',
    context TEXT DEFAULT '', technique TEXT DEFAULT '', symbolism TEXT DEFAULT '', secrets TEXT DEFAULT '',
    audio_text TEXT DEFAULT '',
    image_id TEXT,
    published INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  -- Mensajes que llegan desde el formulario de contacto
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT DEFAULT '',
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(created_at);
`);

// ---------- migraciones: agrega columnas nuevas sin borrar lo que ya existe ----------
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('images', 'lqip', "TEXT DEFAULT ''");
addColumn('images', 'v', 'INTEGER DEFAULT 1');
addColumn('artworks', 'featured', 'INTEGER DEFAULT 0');
addColumn('artworks', 'dimensions', "TEXT DEFAULT ''");

const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

// ---------- meta ----------
const getMeta = (k) => db.prepare('SELECT value FROM meta WHERE key=?').get(k)?.value;
const setMeta = (k, v) => db.prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)').run(k, String(v));

// ---------- contenido ----------
function rawContent() {
  const stored = {};
  for (const r of db.prepare('SELECT key,value FROM content').all()) {
    try { stored[r.key] = JSON.parse(r.value); } catch {}
  }
  const seed = getMeta('seed_image');
  const out = {};
  for (const f of Object.values(FIELD_INDEX)) {
    if (f.key in stored) out[f.key] = stored[f.key];
    else if (f.type === 'image') out[f.key] = f.purpose ? '' : (seed || '');
    else if (f.type === 'toggle') out[f.key] = !!f.def;
    else out[f.key] = f.def ?? (f.type === 'list' ? [] : '');
  }
  return out;
}

const getImageRow = (id) => (id ? db.prepare('SELECT * FROM images WHERE id=?').get(id) : null);
const getImage = (id) => imageView(getImageRow(id));
const imageExists = (id) => !!getImageRow(id);

function resolvedContent() {
  const raw = rawContent();
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = FIELD_INDEX[k].type === 'image' ? getImage(v) : v;
  return out;
}

// ---------- marca de agua ----------
function watermarkSettings() {
  const c = rawContent();
  return { on: !!c.wm_on, text: c.wm_text || '', image: c.wm_image || '' };
}
const wmSignature = () => JSON.stringify(watermarkSettings());

function currentMark() {
  const s = watermarkSettings();
  if (!s.on) return null;
  if (s.image && imageExists(s.image)) {
    try { return { type: 'image', buffer: readOriginal(s.image) }; } catch {}
  }
  const text = s.text.trim();
  return text ? { type: 'text', text } : null;
}

// Regenera todas las imágenes públicas con la marca de agua actual (en segundo plano)
const job = { running: false, again: false, done: 0, total: 0 };
async function reprocessAll() {
  if (job.running) { job.again = true; return; }
  job.running = true;
  try {
    do {
      job.again = false;
      const sig = wmSignature();
      const mark = currentMark();
      const wmId = watermarkSettings().image;
      const rows = db.prepare('SELECT * FROM images').all();
      job.done = 0; job.total = rows.length;
      for (const rec of rows) {
        try {
          // la propia firma nunca lleva marca de agua
          const r = await reprocess(rec, rec.id === wmId ? null : mark);
          db.prepare('UPDATE images SET w=?,h=?,color=?,lqip=?,widths=?,sizes=?,v=COALESCE(v,1)+1 WHERE id=?')
            .run(r.w, r.h, r.color, r.lqip, JSON.stringify(r.widths), JSON.stringify(r.sizes), rec.id);
        } catch (e) { console.error('No se pudo regenerar la imagen', rec.id, e.message); }
        job.done++;
      }
      setMeta('wm_sig', sig);
    } while (job.again);
  } finally { job.running = false; }
}
const markWatermarkCurrent = () => setMeta('wm_sig', wmSignature());
const reprocessStatus = () => ({ running: job.running, done: job.done, total: job.total });
function ensureWatermarkUpToDate() {
  if (getMeta('wm_sig') !== wmSignature()) {
    reprocessAll().catch((e) => console.error('Error regenerando imágenes:', e));
  }
}

// ---------- imágenes ----------
async function addImage(buffer, purpose) {
  const r = await processUpload(buffer, purpose === 'watermark' ? null : currentMark());
  db.prepare('INSERT INTO images (id,w,h,color,lqip,widths,sizes,v) VALUES (?,?,?,?,?,?,?,1)')
    .run(r.id, r.w, r.h, r.color, r.lqip, JSON.stringify(r.widths), JSON.stringify(r.sizes));
  return { ...getImage(r.id), srcBytes: r.srcBytes };
}

// Borra imágenes que ya nadie usa (con 30 min de gracia por si se acaban de subir)
function gcImages() {
  const used = new Set();
  for (const row of db.prepare('SELECT key,value FROM content').all()) {
    if (FIELD_INDEX[row.key]?.type === 'image') { try { used.add(JSON.parse(row.value)); } catch {} }
  }
  for (const a of db.prepare('SELECT image_id FROM artworks').all()) used.add(a.image_id);
  const old = db.prepare("SELECT * FROM images WHERE created_at < datetime('now','-30 minutes')").all();
  for (const img of old) {
    if (used.has(img.id) || img.id === getMeta('seed_image')) continue;
    removeFiles(img.id, JSON.parse(img.widths), true);
    db.prepare('DELETE FROM images WHERE id=?').run(img.id);
  }
}

const cleanStr = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max || 500);

function cleanValue(f, v) {
  if (f.type === 'toggle') return !!v;
  if (f.type === 'image') {
    if (v === '' || v == null) return '';
    if (!imageExists(v)) throw new Error(`Imagen no encontrada para "${f.label}"`);
    return String(v);
  }
  if (f.type === 'list') {
    if (!Array.isArray(v)) throw new Error(`"${f.label}" debe ser una lista`);
    return v.slice(0, f.max || 20).map((it) => {
      const o = {};
      for (const sf of f.itemFields) o[sf.key] = cleanStr(it?.[sf.key], sf.max);
      return o;
    });
  }
  let s = cleanStr(v, f.max);
  if (f.type === 'url' && s) {
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    // solo enlaces http/https (evita "javascript:" y similares)
    try { const u = new URL(s); if (!/^https?:$/.test(u.protocol)) s = ''; } catch { s = ''; }
  }
  if (f.key === 'whatsapp_number') s = s.replace(/\D/g, '');
  if (f.key === 'contact_email' && s && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s)) throw new Error('El correo no es válido');
  return s;
}

function saveContent(values) {
  const before = wmSignature();
  tx(() => {
    const st = db.prepare('INSERT OR REPLACE INTO content (key,value) VALUES (?,?)');
    for (const [k, v] of Object.entries(values || {})) {
      const f = FIELD_INDEX[k];
      if (!f) throw new Error(`Campo desconocido: ${k}`);
      st.run(k, JSON.stringify(cleanValue(f, v)));
    }
  });
  const wmChanged = before !== wmSignature() && Object.keys(values || {}).some((k) => WATERMARK_KEYS.includes(k));
  if (wmChanged) reprocessAll().then(gcImages).catch((e) => console.error(e));
  else gcImages();
  return { wmChanged };
}

// ---------- obras ----------
function artworkRow(a) {
  return {
    id: a.id, title: a.title, year: a.year, category: a.category, dimensions: a.dimensions, location: a.location,
    context: a.context, technique: a.technique, symbolism: a.symbolism, secrets: a.secrets,
    audio_text: a.audio_text, published: !!a.published, featured: !!a.featured, image: getImage(a.image_id),
  };
}
const listArtworks = (onlyPublished) =>
  db.prepare(`SELECT * FROM artworks ${onlyPublished ? 'WHERE published=1' : ''} ORDER BY sort_order, id`).all().map(artworkRow);

function cleanArtwork(body, partial) {
  const o = {};
  for (const f of ARTWORK_FIELDS) {
    if (partial && !(f.key in body)) continue;
    if (f.type === 'image') {
      if (!imageExists(body.image)) throw new Error('Falta la imagen de la obra');
      o.image_id = body.image;
    } else {
      o[f.key] = cleanStr(body[f.key], f.max);
      if (f.required && !o[f.key]) throw new Error(`Falta: ${f.label}`);
    }
  }
  if ('published' in body) o.published = body.published ? 1 : 0;
  if ('featured' in body) o.featured = body.featured ? 1 : 0;
  return o;
}

function createArtwork(body) {
  const o = cleanArtwork(body, false);
  const next = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM artworks').get().n;
  const cols = Object.keys(o).concat('sort_order');
  const r = db.prepare(`INSERT INTO artworks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...Object.values(o), next);
  return artworkRow(db.prepare('SELECT * FROM artworks WHERE id=?').get(r.lastInsertRowid));
}

function updateArtwork(id, body) {
  const cur = db.prepare('SELECT * FROM artworks WHERE id=?').get(id);
  if (!cur) return null;
  const o = cleanArtwork(body, true);
  const cols = Object.keys(o);
  if (cols.length) db.prepare(`UPDATE artworks SET ${cols.map((c) => c + '=?').join(',')} WHERE id=?`).run(...Object.values(o), id);
  gcImages();
  return artworkRow(db.prepare('SELECT * FROM artworks WHERE id=?').get(id));
}

function deleteArtwork(id) {
  const r = db.prepare('DELETE FROM artworks WHERE id=?').run(id);
  gcImages();
  return r.changes > 0;
}

function reorderArtworks(ids) {
  tx(() => {
    const st = db.prepare('UPDATE artworks SET sort_order=? WHERE id=?');
    ids.forEach((id, i) => st.run(i + 1, Number(id)));
  });
}

// ---------- mensajes de contacto ----------
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
// Quita caracteres invisibles raros, pero deja los saltos de línea del mensaje
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

function addMessage(body) {
  const m = {
    name: cleanText(body.name, 80),
    email: cleanText(body.email, 120),
    subject: cleanText(body.subject, 120),
    message: cleanText(body.message, 3000),
  };
  if (!m.name) throw new Error('Escribe tu nombre');
  if (!EMAIL_RE.test(m.email)) throw new Error('Escribe un correo válido');
  if (m.message.length < 2) throw new Error('Escribe tu mensaje');
  db.prepare('INSERT INTO messages (name,email,subject,message) VALUES (?,?,?,?)').run(m.name, m.email, m.subject, m.message);
}
const messagesToday = () => db.prepare("SELECT COUNT(*) AS n FROM messages WHERE created_at > datetime('now','-1 day')").get().n;
const listMessages = () => db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 1000').all()
  .map((r) => ({ ...r, is_read: !!r.is_read }));
const unreadMessages = () => db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read=0').get().n;
const setMessageRead = (id, read) => db.prepare('UPDATE messages SET is_read=? WHERE id=?').run(read ? 1 : 0, id).changes > 0;
const deleteMessage = (id) => db.prepare('DELETE FROM messages WHERE id=?').run(id).changes > 0;

// ---------- usuarios ----------
const getUserByName = (u) => db.prepare('SELECT * FROM users WHERE username=?').get(String(u).toLowerCase());
const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
function upsertUser(username, password) {
  const hash = hashPassword(password);
  const u = String(username).toLowerCase();
  const ex = getUserByName(u);
  if (ex) db.prepare('UPDATE users SET hash=? WHERE id=?').run(hash, ex.id);
  else db.prepare('INSERT INTO users (username,hash) VALUES (?,?)').run(u, hash);
}
const setPassword = (id, password) => db.prepare('UPDATE users SET hash=? WHERE id=?').run(hashPassword(password), id);
const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

// ---------- primer arranque: obras de ejemplo para que el sitio no se vea vacío ----------
async function seed() {
  if (!getMeta('seed_image')) {
    const f = path.join(__dirname, 'portada.jpg'); // imagen de ejemplo (privada, no se sirve directo)
    if (fs.existsSync(f)) {
      const img = await addImage(fs.readFileSync(f));
      setMeta('seed_image', img.id);
    }
  }
  if (!getMeta('seed_artworks')) {
    const seedImg = getMeta('seed_image');
    if (seedImg && db.prepare('SELECT COUNT(*) AS n FROM artworks').get().n === 0) {
      const demo = [['El aquelarre', '2024', 'Óleo sobre lienzo', seedImg, true]];
      const dir = path.join(__dirname, 'seed');
      const extra = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort() : [];
      const names = ['Vigilia', 'Marea baja', 'Ceniza', 'El umbral', 'Raíz', 'Penumbra', 'Fuego quieto', 'Duermevela'];
      const cats = ['Óleo sobre lienzo', 'Tinta y acuarela', 'Técnica mixta'];
      for (let i = 0; i < extra.length; i++) {
        const img = await addImage(fs.readFileSync(path.join(dir, extra[i])));
        demo.push([names[i % names.length], String(2023 + (i % 3)), cats[i % cats.length], img.id, i < 2]);
      }
      for (const [title, year, category, image, featured] of demo) {
        createArtwork({
          title, year, category, image, featured, published: true, dimensions: '80 × 100 cm', location: 'Colección de la artista',
          context: 'Obra de ejemplo. Escribe aquí el contexto desde el dashboard.',
          technique: 'Describe la técnica utilizada.',
          symbolism: 'Explica el simbolismo de la pieza.',
          secrets: 'Cuenta una curiosidad que pocos conocen.',
          audio_text: `${title}. Edita este texto desde el dashboard para personalizar la audioguía.`,
        });
      }
    }
    setMeta('seed_artworks', '1');
  }
}

module.exports = {
  db, seed, addImage, getImage, gcImages, rawContent, resolvedContent, saveContent,
  listArtworks, createArtwork, updateArtwork, deleteArtwork, reorderArtworks,
  getUserByName, getUserById, upsertUser, setPassword, userCount, SECTIONS, ARTWORK_FIELDS,
  ensureWatermarkUpToDate, reprocessStatus, markWatermarkCurrent,
  addMessage, messagesToday, listMessages, unreadMessages, setMessageRead, deleteMessage,
};
