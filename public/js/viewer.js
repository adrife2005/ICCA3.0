// Visor de obras a pantalla completa.
// - Flechas / deslizar para cambiar de obra, Esc para cerrar, "i" para la información
// - Tocar la obra = acercarse (zoom) y arrastrar para recorrerla
// - Cada obra tiene su propio enlace (#obra-12) para compartirla
(function () {
  const $ = (id) => document.getElementById(id);
  const viewer = $('viewer');
  if (!viewer) return;

  const img = $('vImg'), stage = $('vStage'), panel = $('vPanel');
  const btnInfo = $('vInfo'), btnAudio = $('vAudio'), btnShare = $('vShare');
  const content = (window.__CMS__ && window.__CMS__.content) || {};
  const ZOOM = 2.6;
  const TABS = [['context', 'Contexto'], ['technique', 'Técnica'], ['symbolism', 'Simbolismo'], ['secrets', 'Secretos']];

  let list = [], index = 0, lastFocus = null, pushed = false;
  let zoomed = false, tx = 0, ty = 0;

  // ---------- utilidades ----------
  window.ICCA_toast = function (msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  };
  const metaLine = (a) => [content.artist_name, a.year, a.category, a.dimensions].filter(Boolean).join(', ');
  const hashFor = (a) => '#obra-' + a.id;

  // ---------- abrir / cerrar ----------
  function open(items, i) {
    if (!items.length) return;
    list = items;
    lastFocus = document.activeElement;
    viewer.hidden = false;
    document.documentElement.classList.add('viewer-open');
    for (const el of document.querySelectorAll('body > header, body > main, body > footer')) el.inert = true;
    if (!location.hash.startsWith('#obra-')) { history.pushState({ viewer: true }, '', hashFor(items[i])); pushed = true; }
    show(i);
    $('vClose').focus();
  }

  function close(fromHistory) {
    if (viewer.hidden) return;
    stopAudio();
    resetZoom();
    viewer.hidden = true;
    document.documentElement.classList.remove('viewer-open');
    for (const el of document.querySelectorAll('body > header, body > main, body > footer')) el.inert = false;
    if (!fromHistory) {
      if (pushed) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    pushed = false;
    // Regresa el foco a la obra que se abrió (útil con teclado)
    const card = document.querySelector(`[data-art-id="${list[index]?.id}"]`);
    (card || lastFocus)?.focus?.({ preventScroll: true });
  }

  // ---------- mostrar una obra ----------
  function show(i) {
    index = (i + list.length) % list.length;
    const a = list[index];
    stopAudio();
    resetZoom();

    img.classList.add('is-swapping');
    img.removeAttribute('srcset');
    img.style.backgroundImage = a.image.lqip ? `url("${a.image.lqip}")` : '';
    img.width = a.image.w; img.height = a.image.h;
    img.sizes = '100vw';
    img.srcset = a.image.srcset;
    img.src = a.image.src;
    img.alt = a.title;
    const done = () => { img.classList.remove('is-swapping'); img.style.backgroundImage = ''; };
    if (img.complete && img.naturalWidth) requestAnimationFrame(done); else img.onload = done;

    $('vTitle').textContent = a.title;
    $('vMeta').textContent = metaLine(a);
    $('vCount').textContent = `${index + 1} de ${list.length}`;
    $('vPrev').hidden = $('vNext').hidden = list.length < 2;
    $('vLoc').textContent = a.location || '';

    // Pestañas: solo las que tienen texto
    const tabs = $('vTabs'), body = $('vTabBody');
    tabs.textContent = '';
    const avail = TABS.filter(([k]) => a[k]);
    avail.forEach(([k, label], n) => {
      const b = document.createElement('button');
      b.type = "button"; b.setAttribute("role", "tab"); b.textContent = label;
      b.setAttribute('aria-selected', n === 0 ? 'true' : 'false');
      b.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', 'false'));
        b.setAttribute('aria-selected', 'true');
        body.textContent = a[k];
      });
      tabs.append(b);
    });
    body.textContent = avail.length ? a[avail[0][0]] : 'Pronto habrá más información sobre esta obra.';
    btnInfo.hidden = !avail.length && !a.location;
    if (btnInfo.hidden) togglePanel(false);

    btnAudio.hidden = !('speechSynthesis' in window) || !a.audioText;
    if (location.hash !== hashFor(a)) history.replaceState(history.state, '', hashFor(a));

    // Precarga la anterior y la siguiente para que el cambio sea instantáneo
    for (const d of [1, -1]) {
      const n = list[(index + d + list.length) % list.length];
      if (n && n !== a) { const p = new Image(); p.sizes = '100vw'; p.srcset = n.image.srcset; p.src = n.image.src; }
    }
  }

  function togglePanel(force) {
    const openIt = force ?? panel.hidden;
    panel.hidden = !openIt;
    viewer.classList.toggle('has-panel', openIt);
    btnInfo.setAttribute('aria-expanded', String(openIt));
  }

  // ---------- zoom ----------
  function clamp() {
    const r = img.getBoundingClientRect();
    const w = r.width / (zoomed ? ZOOM : 1), h = r.height / (zoomed ? ZOOM : 1);
    const s = stage.getBoundingClientRect();
    const maxX = Math.max(0, (w * ZOOM - s.width) / 2), maxY = Math.max(0, (h * ZOOM - s.height) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }
  function apply() { img.style.transform = zoomed ? `translate(${tx}px, ${ty}px) scale(${ZOOM})` : ''; }
  function resetZoom() { zoomed = false; tx = ty = 0; viewer.classList.remove('is-zoomed'); apply(); }
  function zoomAt(clientX, clientY) {
    const r = img.getBoundingClientRect();
    // punto tocado, medido desde el centro de la imagen
    const px = clientX - (r.left + r.width / 2), py = clientY - (r.top + r.height / 2);
    zoomed = true;
    tx = px * (1 - ZOOM); ty = py * (1 - ZOOM);
    // al acercarse se carga la versión más grande disponible
    const full = list[index].image.full;
    if (!img.currentSrc.includes(full.split('?')[0])) { img.removeAttribute('srcset'); img.src = full; }
    viewer.classList.add('is-zoomed');
    $('vHint').classList.add('seen');
    clamp(); apply();
  }

  // Un solo manejador para mouse, dedo y lápiz
  let down = null;
  img.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
    if (zoomed) { tx = down.tx + dx; ty = down.ty + dy; clamp(); apply(); }
  });
  img.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!down.moved) { if (zoomed) resetZoom(); else zoomAt(e.clientX, e.clientY); }
    else if (!zoomed && Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1)); // deslizar
    down = null;
  });
  img.addEventListener('pointercancel', () => { down = null; });

  // ---------- audioguía (voz del navegador) ----------
  function stopAudio() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    btnAudio.textContent = 'Escuchar';
    btnAudio.classList.remove('is-on');
  }
  btnAudio.addEventListener('click', () => {
    if (btnAudio.classList.contains('is-on')) return stopAudio();
    const u = new SpeechSynthesisUtterance(list[index].audioText);
    u.lang = 'es-MX'; u.rate = 0.95;
    u.onend = u.onerror = stopAudio;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    btnAudio.textContent = 'Detener';
    btnAudio.classList.add('is-on');
  });

  // ---------- compartir ----------
  btnShare.addEventListener('click', async () => {
    const a = list[index];
    const url = location.origin + location.pathname + hashFor(a);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: a.title, url });
      else { await navigator.clipboard.writeText(url); window.ICCA_toast('Enlace copiado'); }
    } catch {}
  });

  // ---------- botones y teclado ----------
  $('vClose').addEventListener('click', () => close());
  $('vPrev').addEventListener('click', () => show(index - 1));
  $('vNext').addEventListener('click', () => show(index + 1));
  btnInfo.addEventListener('click', () => togglePanel());
  stage.addEventListener('click', (e) => { if (e.target === stage) close(); });

  document.addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape') { if (zoomed) resetZoom(); else close(); }
    else if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'i' || e.key === 'I') { if (!btnInfo.hidden) togglePanel(); }
    else if (e.key === 'Tab') {
      // mantiene el foco dentro del visor
      const f = [...viewer.querySelectorAll('button:not([hidden]), [tabindex="0"]')].filter((x) => x.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('resize', () => { if (zoomed) { clamp(); apply(); } });

  // Botón "atrás" del celular: cierra el visor en lugar de salir de la página
  window.addEventListener('popstate', () => {
    const m = location.hash.match(/^#obra-([\w-]+)$/);
    if (!m) { pushed = false; close(true); }
  });

  window.ICCA_Viewer = {
    open,
    // Abre la obra si el enlace trae #obra-ID
    openFromHash(all) {
      const m = location.hash.match(/^#obra-([\w-]+)$/);
      if (!m) return;
      const i = all.findIndex((a) => String(a.id) === m[1]);
      if (i >= 0) { open(all, i); pushed = false; }
    },
  };
})();
