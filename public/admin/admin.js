(() => {
  'use strict';
  const app = document.getElementById('app');
  const state = { user: null, sections: [], artworkFields: [], values: {}, artworks: [], dirty: {}, imgViews: {}, view: 'general', editing: null,
    messages: null, unread: 0, msgFilter: 'all', msgSearch: '' };

  // ---------- helpers ----------
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(kid)); }
    return e;
  };
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  function toast(msg, type) {
    const t = h('div', { class: 'toast' + (type === 'error' ? ' error' : '') }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
  }

  async function api(method, path, body, opts = {}) {
    const headers = { 'X-CSRF': '1' };
    let payload;
    if (opts.file) { headers['Content-Type'] = opts.file.type || 'application/octet-stream'; payload = opts.file; }
    else if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== '/api/login') {
      const first = state.user === null; // primer intento al abrir el panel: no hay sesión todavía
      state.user = null;
      if (!first) renderLogin('Tu sesión expiró. Vuelve a entrar.');
      throw new Error('Sesión expirada');
    }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  const fmtKB = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
  const dirtyCount = () => Object.keys(state.dirty).length;
  const current = (key) => (key in state.dirty ? state.dirty[key] : state.values[key]);

  // ---------- login ----------
  function renderLogin(msg) {
    clear(app);
    const err = h('div', { class: 'err hidden' });
    if (msg) { err.textContent = msg; err.classList.remove('hidden'); }
    const user = h('input', { type: 'text', id: 'u', autocomplete: 'username', required: true, autofocus: true });
    const pass = h('input', { type: 'password', id: 'p', autocomplete: 'current-password', required: true });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Entrar');
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault(); btn.disabled = true; err.classList.add('hidden');
        try {
          await api('POST', '/api/login', { username: user.value, password: pass.value });
          await boot();
        } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; pass.value = ''; pass.focus(); }
      },
    },
      err,
      h('div', null, h('label', { class: 'lbl', for: 'u' }, 'Usuario'), user),
      h('div', null, h('label', { class: 'lbl', for: 'p' }, 'Contraseña'), pass),
      btn);
    app.append(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
      h('div', { class: 'brand' }, 'ICCA', h('small', null, 'PANEL DE CONTENIDO')), form)));
  }

  // ---------- widgets ----------
  function imageField({ getView, onChange, purpose }) {
    const wrap = h('div', { class: 'img-field' });
    const prev = h('div', { class: 'img-prev' });
    const meta = h('div', { class: 'img-meta' });
    const input = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    const pick = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, 'Subir / cambiar imagen');
    const paint = () => {
      const v = getView();
      clear(prev); clear(meta);
      if (v) {
        prev.append(h('img', { src: v.thumb, alt: '' }));
        const parts = [`${v.w}×${v.h}px`];
        meta.append(parts.join(' · '), ' · ');
        const opt = v.srcBytes ? h('b', null, `${fmtKB(v.srcBytes)} → ${v.kb} KB WebP`) : h('b', null, `${v.kb} KB, WebP optimizado`);
        meta.append(opt);
      } else { prev.append('Sin imagen'); meta.append('Arrastra una imagen aquí o usa el botón.'); }
    };
    async function upload(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) return toast('Ese archivo no es una imagen.', 'error');
      prev.classList.add('busy');
      try {
        const { image } = await api('POST', '/api/admin/images' + (purpose ? '?purpose=' + purpose : ''), null, { file });
        state.imgViews[image.id] = image;
        onChange(image); paint();
      } catch (e) { toast(e.message, 'error'); }
      finally { prev.classList.remove('busy'); input.value = ''; }
    }
    input.addEventListener('change', () => upload(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => prev.addEventListener(ev, (e) => { e.preventDefault(); prev.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => prev.addEventListener(ev, (e) => { e.preventDefault(); prev.classList.remove('drag'); }));
    prev.addEventListener('drop', (e) => upload(e.dataTransfer.files[0]));
    prev.addEventListener('click', () => input.click());
    paint();
    wrap.append(prev, h('div', null, meta, pick, input));
    return wrap;
  }

  function textField(f, get, set) {
    const isArea = f.type === 'textarea';
    const el = h(isArea ? 'textarea' : 'input', isArea ? { maxlength: f.max, rows: 3 } : { type: f.type === 'url' ? 'url' : 'text', maxlength: f.max });
    el.value = get() || '';
    const counter = h('span', { class: 'counter' }, f.max ? `${el.value.length}/${f.max}` : '');
    el.addEventListener('input', () => { counter.textContent = f.max ? `${el.value.length}/${f.max}` : ''; set(el.value); });
    return { el, counter };
  }

  function listField(f, key) {
    const box = h('div');
    const get = () => JSON.parse(JSON.stringify(current(key) || []));
    const commit = (arr) => setDirty(key, arr);
    const paint = () => {
      clear(box);
      const items = get();
      items.forEach((it, i) => {
        const row = h('div', { class: 'list-item' });
        row.append(h('div', { class: 'row-head' }, `CARTA ${i + 1}`, h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', type: 'button', disabled: i === 0, onclick: () => { const a = get(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; commit(a); paint(); } }, '↑'),
          h('button', { class: 'btn small', type: 'button', disabled: i === items.length - 1, onclick: () => { const a = get(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; commit(a); paint(); } }, '↓'),
          h('button', { class: 'btn small danger', type: 'button', onclick: () => { if (confirm('¿Quitar esta carta?')) { const a = get(); a.splice(i, 1); commit(a); paint(); } } }, 'Quitar'))));
        for (const sf of f.itemFields) {
          const { el, counter } = textField(sf, () => it[sf.key], (v) => { const a = get(); a[i][sf.key] = v; commit(a); });
          row.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, sf.label, counter), el));
        }
        box.append(row);
      });
      if (items.length < (f.max || 20)) {
        box.append(h('button', { class: 'btn', type: 'button', onclick: () => { const a = get(); a.push(Object.fromEntries(f.itemFields.map((x) => [x.key, '']))); commit(a); paint(); } }, '+ ' + (f.addLabel || 'Agregar')));
      }
    };
    paint();
    return box;
  }

  function setDirty(key, val) {
    const orig = state.values[key];
    const f = fieldDef(key);
    let same;
    if (f.type === 'image') same = (orig ? orig.id : '') === (val || '');
    else if (f.type === 'list') same = JSON.stringify(orig) === JSON.stringify(val);
    else same = orig === val;
    if (same) delete state.dirty[key]; else state.dirty[key] = val;
    updateSavebar();
  }
  const fieldDef = (key) => { for (const s of state.sections) for (const f of s.fields) if (f.key === key) return f; };

  function fieldRow(f) {
    if (f.type === 'image') {
      return h('div', { class: 'field' }, h('label', { class: 'lbl' }, f.label),
        imageField({
          getView: () => (f.key in state.dirty ? (state.dirty[f.key] ? state.imgViews[state.dirty[f.key]] : null) : state.values[f.key]),
          onChange: (img) => setDirty(f.key, img.id),
          purpose: f.purpose,
        }),
        f.purpose && h('button', { class: 'btn small', type: 'button', onclick: () => { setDirty(f.key, ''); render(); } }, 'Quitar imagen'),
        f.help && h('div', { class: 'help' }, f.help));
    }
    if (f.type === 'list') return h('div', { class: 'field' }, h('label', { class: 'lbl' }, f.label), listField(f, f.key));
    if (f.type === 'toggle') {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!current(f.key);
      cb.addEventListener('change', () => setDirty(f.key, cb.checked));
      return h('div', { class: 'field' }, h('label', { class: 'switch' }, cb, f.label), f.help && h('div', { class: 'help' }, f.help));
    }
    const { el, counter } = textField(f, () => current(f.key), (v) => setDirty(f.key, v));
    return h('div', { class: 'field' }, h('label', { class: 'lbl' }, f.label, counter), el, f.help && h('div', { class: 'help' }, f.help));
  }

  // ---------- vistas ----------
  function renderSection(sec) {
    const main = h('div');
    main.append(h('div', { class: 'head' },
      h('div', null, h('h1', null, sec.title), h('p', null, sec.desc)),
      sec.link && h('a', { class: 'btn', href: sec.link, target: '_blank', rel: 'noopener' }, 'Ver en el sitio ↗')));
    // agrupa campos por "obra N" en destacadas
    let cards = [], cur = null, curGroup = null;
    for (const f of sec.fields) {
      const m = f.key.match(/^featured_(\d)_/);
      const group = m ? 'Obra ' + m[1] : null;
      if (!cur || group !== curGroup) { cur = []; cards.push({ group, fields: cur }); curGroup = group; }
      cur.push(f);
    }
    for (const c of cards) {
      const card = h('div', { class: 'card' });
      if (c.group) card.append(h('div', { class: 'group-title' }, c.group));
      c.fields.forEach((f) => card.append(fieldRow(f)));
      main.append(card);
    }
    return main;
  }

  function renderArtworks() {
    const main = h('div');
    main.append(h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Obras de la galería'), h('p', null, 'Todas las obras de la colección. El orden de aquí es el orden en el sitio.')),
      h('div', null,
        h('a', { class: 'btn', href: '/galeria.html', target: '_blank', rel: 'noopener' }, 'Ver galería ↗'), ' ',
        bulkButton(), ' ',
        h('button', { class: 'btn primary', onclick: () => { state.editing = { draft: { published: true }, isNew: true }; render(); } }, '+ Nueva obra'))));
    main.append(h('p', { class: 'help tip' }, 'Consejo: marca como “Destacada” las 2 a 4 obras que más te representen; salen en grande en el inicio.'));
    if (!state.artworks.length) {
      main.append(h('div', { class: 'empty' }, 'Aún no hay obras. Agrega la primera con “Nueva obra”.'));
      return main;
    }
    const grid = h('div', { class: 'art-grid' });
    state.artworks.forEach((a, i) => {
      const move = async (d) => {
        const j = i + d; if (j < 0 || j >= state.artworks.length) return;
        [state.artworks[i], state.artworks[j]] = [state.artworks[j], state.artworks[i]];
        render();
        try { await api('POST', '/api/admin/artworks/reorder', { ids: state.artworks.map((x) => x.id) }); } catch (e) { toast(e.message, 'error'); }
      };
      grid.append(h('div', { class: 'art-card' },
        h('div', { class: 'thumb' }, a.image && h('img', { src: a.image.thumb, alt: '', loading: 'lazy' }),
          h('div', { class: 'badges' }, !a.published && h('span', { class: 'badge' }, 'Oculta'), a.featured && h('span', { class: 'badge star' }, '★ Destacada'))),
        h('div', { class: 'info' }, h('h3', null, a.title), h('div', { class: 'sub' }, [a.year, a.category].filter(Boolean).join(' · '))),
        h('div', { class: 'acts' },
          h('button', { class: 'btn small', title: 'Mover antes', disabled: i === 0, onclick: () => move(-1) }, '←'),
          h('button', { class: 'btn small', title: 'Mover después', disabled: i === state.artworks.length - 1, onclick: () => move(1) }, '→'),
          h('button', { class: 'btn small primary', onclick: () => { state.editing = { draft: JSON.parse(JSON.stringify(a)), id: a.id }; render(); } }, 'Editar')),
        h('div', { class: 'quick' },
          quickToggle(a, 'published', 'Visible'),
          quickToggle(a, 'featured', 'Destacada'))));
    });
    main.append(grid);
    return main;
  }

  // Casilla rápida en cada tarjeta (sin abrir el editor)
  function quickToggle(a, key, label) {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!a[key];
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        const r = await api('PUT', `/api/admin/artworks/${a.id}`, { [key]: cb.checked });
        state.artworks = state.artworks.map((x) => (x.id === a.id ? r.artwork : x));
        render();
      } catch (e) { toast(e.message, 'error'); cb.checked = !cb.checked; cb.disabled = false; }
    });
    return h('label', { class: 'switch small' }, cb, label);
  }

  // Subir varias obras de una vez: se crean ocultas, con el nombre del archivo como título
  function bulkButton() {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
    const btn = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, '⇪ Subir varias');
    input.addEventListener('change', async () => {
      const files = [...input.files].filter((f) => f.type.startsWith('image/'));
      input.value = '';
      if (!files.length) return;
      btn.disabled = true;
      let ok = 0;
      for (const [i, file] of files.entries()) {
        btn.textContent = `Subiendo ${i + 1} de ${files.length}…`;
        try {
          const { image } = await api('POST', '/api/admin/images', null, { file });
          const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'Sin título';
          const r = await api('POST', '/api/admin/artworks', { title, image: image.id, published: false });
          state.artworks.push(r.artwork); ok++;
        } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
      }
      toast(`${ok} obra(s) subidas como ocultas. Ponles título y márcalas como visibles ✓`);
      render();
    });
    return h('span', null, btn, input);
  }

  function renderArtworkEditor() {
    const { draft, isNew, id } = state.editing;
    const main = h('div');
    main.append(h('div', { class: 'head' },
      h('div', null, h('h1', null, isNew ? 'Nueva obra' : 'Editar obra'), h('p', null, 'Lo que escribas aquí aparece al abrir la obra en pantalla completa (botón Información).')),
      h('button', { class: 'btn', onclick: () => { state.editing = null; render(); } }, '← Volver')));
    const card = h('div', { class: 'card' });
    for (const f of state.artworkFields) {
      if (f.type === 'image') {
        card.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, f.label + ' *'),
          imageField({ getView: () => draft.image, onChange: (img) => { draft.image = img; } })));
      } else {
        const { el, counter } = textField(f, () => draft[f.key], (v) => { draft[f.key] = v; });
        card.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, f.label + (f.required ? ' *' : ''), counter), el));
      }
    }
    const pub = h('input', { type: 'checkbox' }); pub.checked = draft.published !== false;
    pub.addEventListener('change', () => { draft.published = pub.checked; });
    const feat = h('input', { type: 'checkbox' }); feat.checked = !!draft.featured;
    feat.addEventListener('change', () => { draft.featured = feat.checked; });
    card.append(h('div', { class: 'field toggles' },
      h('label', { class: 'switch' }, pub, 'Visible en el sitio'),
      h('label', { class: 'switch' }, feat, 'Destacada (sale en grande en el inicio)')));
    main.append(card);
    const save = h('button', { class: 'btn primary', onclick: async () => {
      if (!draft.title || !draft.title.trim()) return toast('Falta el título.', 'error');
      if (!draft.image) return toast('Falta la imagen de la obra.', 'error');
      save.disabled = true;
      const body = { published: draft.published !== false, featured: !!draft.featured, image: draft.image.id };
      for (const f of state.artworkFields) if (f.type !== 'image') body[f.key] = draft[f.key] || '';
      try {
        const r = isNew ? await api('POST', '/api/admin/artworks', body) : await api('PUT', `/api/admin/artworks/${id}`, body);
        if (isNew) state.artworks.push(r.artwork); else state.artworks = state.artworks.map((x) => (x.id === id ? r.artwork : x));
        state.editing = null; toast('Obra guardada ✓'); render();
      } catch (e) { toast(e.message, 'error'); save.disabled = false; }
    } }, 'Guardar obra');
    const row = h('div', { class: 'acts' }, save, h('button', { class: 'btn', onclick: () => { state.editing = null; render(); } }, 'Cancelar'));
    if (!isNew) {
      row.append(h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`¿Eliminar “${draft.title}”? Esta acción no se puede deshacer.`)) return;
        try { await api('DELETE', `/api/admin/artworks/${id}`); state.artworks = state.artworks.filter((x) => x.id !== id); state.editing = null; toast('Obra eliminada'); render(); }
        catch (e) { toast(e.message, 'error'); }
      } }, 'Eliminar'));
    }
    main.append(row);
    return main;
  }

  function renderAccount() {
    const main = h('div');
    main.append(h('div', { class: 'head' }, h('div', null, h('h1', null, 'Cuenta'), h('p', null, `Sesión iniciada como ${state.user}.`))));
    const cur = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const nw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    const nw2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Cambiar contraseña');
    main.append(h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      if (nw.value !== nw2.value) return toast('Las contraseñas nuevas no coinciden.', 'error');
      btn.disabled = true;
      try { await api('POST', '/api/admin/password', { current: cur.value, next: nw.value }); toast('Contraseña actualizada ✓'); cur.value = nw.value = nw2.value = ''; }
      catch (ex) { toast(ex.message, 'error'); }
      btn.disabled = false;
    } },
      h('div', { class: 'group-title' }, 'Cambiar contraseña'),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Contraseña actual'), cur),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nueva contraseña (mínimo 8 caracteres)'), nw),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Repite la nueva contraseña'), nw2), btn));
    main.append(h('div', { class: 'card' }, h('button', { class: 'btn danger', onclick: logout }, 'Cerrar sesión')));
    return main;
  }

  async function logout() {
    if (dirtyCount() && !confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
    state.dirty = {};
    try { await api('POST', '/api/logout'); } catch {}
    state.user = null; renderLogin();
  }

  // =====================================================================
  // MENSAJES DE CONTACTO
  // =====================================================================
  // La base guarda la fecha en UTC ("2026-11-25 18:22:00"); aquí se pasa a la hora local
  const toDate = (s) => new Date(String(s).replace(' ', 'T') + 'Z');
  function shortDate(s) {
    const d = toDate(s), now = new Date();
    const mins = Math.round((now - d) / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    if (mins < 60 * 24 && d.getDate() === now.getDate()) return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'ayer';
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const longDate = (s) => toDate(s).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });

  function setUnread(n) {
    state.unread = n;
    document.title = (n ? `(${n}) ` : '') + 'Dashboard — ICCA';
  }

  async function loadMessages() {
    try {
      const r = await api('GET', '/api/admin/messages');
      state.messages = r.messages; setUnread(r.unread);
    } catch (e) { toast(e.message, 'error'); state.messages = state.messages || []; }
    if (state.view === 'messages') render(); else renderNav();
  }

  function renderMessages() {
    const main = h('div');
    main.append(h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Mensajes'), h('p', null, 'Lo que la gente te escribe desde el formulario de contacto. Toca un mensaje para leerlo completo.')),
      h('div', null, h('button', { class: 'btn', onclick: () => { state.messages = null; render(); loadMessages(); } }, '↻ Actualizar'))));

    if (state.messages === null) { main.append(h('div', { class: 'card msg-empty' }, 'Cargando mensajes…')); return main; }

    const all = state.messages;
    const unread = all.filter((m) => !m.is_read).length;
    const q = state.msgSearch.trim().toLowerCase();
    const shown = all.filter((m) => (state.msgFilter === 'all' || !m.is_read) &&
      (!q || [m.name, m.email, m.subject, m.message].some((t) => String(t).toLowerCase().includes(q))));

    // Filtros y buscador
    const chip = (id, label) => h('button', { class: 'msg-chip' + (state.msgFilter === id ? ' active' : ''), type: 'button',
      onclick: () => { state.msgFilter = id; render(); } }, label);
    const search = h('input', { type: 'search', class: 'msg-search', placeholder: 'Buscar por nombre, correo o texto…', value: state.msgSearch });
    search.addEventListener('input', () => {
      state.msgSearch = search.value;
      const pos = search.selectionStart;
      render();
      const again = document.querySelector('.msg-search'); again.focus(); again.setSelectionRange(pos, pos);
    });
    main.append(h('div', { class: 'msg-tools' }, chip('all', `Todos (${all.length})`), chip('unread', `Sin leer (${unread})`), search));

    if (!all.length) {
      main.append(h('div', { class: 'card msg-empty' },
        h('div', { class: 'msg-empty-ic' }, '✉'),
        h('h3', null, 'Aún no hay mensajes'),
        h('p', null, 'Cuando alguien te escriba desde el formulario de contacto de la página, aparecerá aquí.')));
      return main;
    }
    if (!shown.length) { main.append(h('div', { class: 'card msg-empty' }, h('p', null, 'No hay mensajes que coincidan.'))); return main; }

    const listEl = h('div', { class: 'msg-list card' });
    shown.forEach((m, i) => {
      listEl.append(h('button', { class: 'msg-row' + (m.is_read ? '' : ' unread'), type: 'button', onclick: () => openMessage(shown, i) },
        h('span', { class: 'msg-dot', title: m.is_read ? 'Leído' : 'Sin leer' }),
        h('span', { class: 'msg-avatar' }, (m.name.trim()[0] || '?').toUpperCase()),
        h('span', { class: 'msg-main' },
          h('span', { class: 'msg-top' }, h('strong', null, m.name), h('span', { class: 'msg-email' }, m.email)),
          h('span', { class: 'msg-preview' }, m.subject && h('b', null, m.subject + ' — '), m.message.replace(/\s+/g, ' '))),
        h('span', { class: 'msg-date' }, shortDate(m.created_at))));
    });
    main.append(listEl);
    return main;
  }

  // Modal con el mensaje completo
  function openMessage(listArr, index) {
    document.querySelector('.msg-modal')?.remove();
    const m = listArr[index];
    if (!m) return;

    // al abrirlo se marca como leído
    if (!m.is_read) {
      m.is_read = true;
      api('PUT', `/api/admin/messages/${m.id}`, { read: true }).then((r) => { setUnread(r.unread); renderNav(); }).catch(() => {});
    }

    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); render(); };
    const go = (d) => { overlay.remove(); document.removeEventListener('keydown', onKey); openMessage(listArr, index + d); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && index < listArr.length - 1) go(1);
      else if (e.key === 'ArrowLeft' && index > 0) go(-1);
    };

    const subject = m.subject ? `Re: ${m.subject}` : 'Respuesta a tu mensaje';
    const mailto = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}`;

    const card = h('div', { class: 'msg-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Mensaje de ${m.name}` },
      h('div', { class: 'msg-card-head' },
        h('span', { class: 'msg-avatar big' }, (m.name.trim()[0] || '?').toUpperCase()),
        h('div', { class: 'msg-who' }, h('h2', null, m.name), h('a', { href: mailto, class: 'msg-mail' }, m.email)),
        h('button', { class: 'msg-x', type: 'button', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      h('dl', { class: 'msg-fields' },
        h('div', null, h('dt', null, 'Fecha'), h('dd', null, longDate(m.created_at))),
        h('div', null, h('dt', null, 'Correo'), h('dd', null, m.email)),
        h('div', null, h('dt', null, 'Asunto'), h('dd', null, m.subject || 'Sin asunto'))),
      h('div', { class: 'msg-label' }, 'Mensaje'),
      h('div', { class: 'msg-body' }, m.message),
      h('div', { class: 'msg-actions' },
        h('a', { class: 'btn primary', href: mailto }, '↩ Responder por correo'),
        h('button', { class: 'btn', type: 'button', onclick: async (e) => {
          try { await navigator.clipboard.writeText(m.email); toast('Correo copiado ✓'); } catch { toast('No se pudo copiar', 'error'); }
        } }, 'Copiar correo'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          try { const r = await api('PUT', `/api/admin/messages/${m.id}`, { read: false }); m.is_read = false; setUnread(r.unread); toast('Marcado como no leído'); close(); }
          catch (e) { toast(e.message, 'error'); }
        } }, 'Marcar como no leído'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (!confirm(`¿Eliminar el mensaje de ${m.name}? No se puede deshacer.`)) return;
          try {
            const r = await api('DELETE', `/api/admin/messages/${m.id}`);
            state.messages = state.messages.filter((x) => x.id !== m.id); setUnread(r.unread);
            toast('Mensaje eliminado'); close();
          } catch (e) { toast(e.message, 'error'); }
        } }, 'Eliminar')),
      h('div', { class: 'msg-nav' },
        h('button', { class: 'btn small', type: 'button', disabled: index === 0, onclick: () => go(-1) }, '‹ Anterior'),
        h('span', null, `${index + 1} de ${listArr.length}`),
        h('button', { class: 'btn small', type: 'button', disabled: index === listArr.length - 1, onclick: () => go(1) }, 'Siguiente ›')));

    const overlay = h('div', { class: 'msg-modal', onclick: (e) => { if (e.target === overlay) close(); } }, card);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    card.querySelector('.msg-x').focus();
  }

  // ---------- shell ----------
  let mainEl, saveEl, navEl;
  function sectionDirty(sec) { return sec.fields.some((f) => f.key in state.dirty); }

  function goto(view) {
    if (view === state.view && !state.editing) return;
    state.view = view; state.editing = null; render(); window.scrollTo(0, 0);
    if (view === 'messages') loadMessages();
  }

  function renderNav() {
    clear(navEl);
    navEl.append(h('div', { class: 'brand' }, 'ICCA', h('small', null, 'PANEL DE CONTENIDO')));
    const item = (id, icon, label, dot, count) => h('button', { class: 'nav-btn' + (state.view === id ? ' active' : ''), onclick: () => goto(id) },
      h('span', { class: 'ic' }, icon), label, dot && h('span', { class: 'dot', title: 'Cambios sin guardar' }),
      count ? h('span', { class: 'count', title: `${count} sin leer` }, String(count)) : null);
    navEl.append(item('messages', '✉', 'Mensajes', false, state.unread), h('div', { class: 'nav-sep' }));
    for (const s of state.sections) navEl.append(item(s.id, s.icon, s.title, sectionDirty(s)));
    navEl.append(h('div', { class: 'nav-sep' }), item('artworks', '🖼', 'Obras de la galería'), item('account', '⚙', 'Cuenta'));
    navEl.append(h('div', { class: 'spacer' }), h('a', { class: 'nav-btn', href: '/', target: '_blank', rel: 'noopener' }, h('span', { class: 'ic' }, '↗'), 'Ver sitio'));
  }

  function updateSavebar() {
    if (!saveEl) return;
    const n = dirtyCount();
    saveEl.classList.toggle('show', n > 0);
    saveEl.querySelector('span').textContent = n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`;
    renderNav();
  }

  function render() {
    clear(app);
    navEl = h('aside', { class: 'side' });
    mainEl = h('main', { class: 'main' });
    const saveBtn = h('button', { class: 'btn primary', onclick: async () => {
      saveBtn.disabled = true;
      try {
        const r = await api('PUT', '/api/admin/content', { values: state.dirty });
        state.values = r.values; state.dirty = {}; toast('Cambios guardados. Ya se ven en el sitio ✓'); render();
        if (r.wmChanged) watchReprocess();
      } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
    } }, 'Guardar cambios');
    saveEl = h('div', { class: 'savebar' }, h('span'), h('div', { class: 'acts' },
      h('button', { class: 'btn', onclick: () => { if (confirm('¿Descartar todos los cambios sin guardar?')) { state.dirty = {}; render(); } } }, 'Descartar'), saveBtn));
    app.append(h('div', { class: 'shell' }, navEl, mainEl), saveEl);

    if (state.view === 'messages') mainEl.append(renderMessages());
    else if (state.view === 'artworks') mainEl.append(state.editing ? renderArtworkEditor() : renderArtworks());
    else if (state.view === 'account') mainEl.append(renderAccount());
    else mainEl.append(renderSection(state.sections.find((s) => s.id === state.view) || state.sections[0]));
    updateSavebar();
  }

  // Muestra el avance mientras el servidor vuelve a generar las imágenes con la nueva marca de agua
  async function watchReprocess() {
    const bar = h('div', { class: 'toast progress' }, 'Aplicando la marca de agua a las imágenes…');
    document.getElementById('toasts').append(bar);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      let st;
      try { st = await api('GET', '/api/admin/reprocess'); } catch { break; }
      if (!st.running) break;
      bar.textContent = `Aplicando la marca de agua… ${st.done} de ${st.total} imágenes`;
    }
    bar.remove();
    toast('Marca de agua aplicada a todas las imágenes ✓');
    try { const d = await api('GET', '/api/admin/bootstrap'); state.values = d.values; state.artworks = d.artworks; if (!dirtyCount()) render(); } catch {}
  }

  window.addEventListener('beforeunload', (e) => { if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; } });

  async function boot() {
    try {
      const d = await api('GET', '/api/admin/bootstrap');
      Object.assign(state, { user: d.user, sections: d.sections, artworkFields: d.artworkFields, values: d.values, artworks: d.artworks, dirty: {}, editing: null });
      setUnread(d.unread || 0);
      // si hay mensajes sin leer, se abre directo en Mensajes
      if (d.unread) state.view = 'messages';
      if (!state.sections.some((s) => s.id === state.view) && !['artworks', 'account', 'messages'].includes(state.view)) state.view = state.sections[0].id;
      render();
      if (state.view === 'messages') loadMessages();
      // revisa si llegaron mensajes nuevos cada minuto
      setInterval(async () => {
        try {
          const r = await api('GET', '/api/admin/messages');
          const before = state.unread;
          state.messages = r.messages; setUnread(r.unread);
          if (r.unread > before) toast(`Tienes ${r.unread} mensaje(s) sin leer ✉`);
          if (state.view === 'messages' && !document.querySelector('.msg-modal') && document.activeElement?.className !== 'msg-search') render(); else renderNav();
        } catch {}
      }, 60000);
    } catch (e) { if (!document.querySelector('.login-wrap')) renderLogin(); }
  }
  boot();
})();
