// Llena el HTML con el contenido editable (window.__CMS__, lo genera el servidor desde la base de datos).
// Todo se inserta con textContent / atributos => aunque alguien escriba HTML en el dashboard, no se ejecuta.
(function () {
  const data = window.__CMS__;
  if (!data) return;
  const c = data.content;
  const $$ = (sel) => document.querySelectorAll(sel);

  // Pone una imagen con todos sus tamaños (srcset) y una versión borrosa mientras carga
  window.ICCA_applyImg = function applyImg(img, image, alt) {
    if (!image) { img.closest('.hung, figure')?.setAttribute('hidden', ''); return; }
    if (image.w && image.h) { img.width = image.w; img.height = image.h; }
    if (img.dataset.sizes) img.sizes = img.dataset.sizes;
    img.srcset = image.srcset;
    img.src = image.src;
    img.decoding = 'async';
    if (alt != null) img.alt = alt;
    if (image.lqip) {
      img.style.backgroundImage = `url("${image.lqip}")`;
      img.classList.add('is-loading');
      const done = () => { img.classList.remove('is-loading'); img.style.backgroundImage = ''; };
      if (img.complete && img.naturalWidth) done(); else img.addEventListener('load', done, { once: true });
    }
  };

  // Textos
  $$('[data-cms]').forEach((el) => {
    const v = c[el.dataset.cms];
    if (typeof v === 'string' && v !== '') el.textContent = v;
  });

  // Imágenes
  $$('[data-cms-img]').forEach((img) => window.ICCA_applyImg(img, c[img.dataset.cmsImg], img.alt || c.hero_caption_title || ''));

  // Fondo animado (se pone por JS: así no hace falta permitir estilos inline en la seguridad del sitio)
  $$('[data-cms-bg]').forEach((el) => {
    const image = c[el.dataset.cmsBg];
    if (!image) return;
    const pre = new Image();
    pre.onload = () => { el.style.backgroundImage = `url("${image.src}")`; el.classList.add('ready'); };
    if (image.lqip) el.style.backgroundImage = `url("${image.lqip}")`;
    pre.src = image.src;
  });

  // Franja en movimiento (el texto se duplica para que el ciclo no tenga cortes)
  $$('[data-cms-marquee]').forEach((track) => {
    const t = c[track.dataset.cmsMarquee] || '';
    track.textContent = '';
    for (let k = 0; k < 2; k++) {
      const span = document.createElement('span');
      for (let i = 0; i < 6; i++) {
        const w = document.createElement('em');
        w.textContent = t;
        const star = document.createElement('i');
        star.textContent = '✦';
        span.append(w, star);
      }
      track.append(span);
    }
  });

  // Notas "Secretos y conceptos"
  $$('[data-cms-notes]').forEach((grid) => {
    const list = c[grid.dataset.cmsNotes] || [];
    grid.textContent = '';
    list.forEach((n) => {
      const art = document.createElement('article');
      art.className = 'note glass reveal-up';
      const h = document.createElement('h3'); h.textContent = n.title;
      const s = document.createElement('p'); s.className = 'note-sub'; s.textContent = n.subtitle;
      const p = document.createElement('p'); p.textContent = n.text;
      art.append(h);
      if (n.subtitle) art.append(s);
      art.append(p);
      grid.append(art);
    });
    if (!list.length) grid.closest('section')?.setAttribute('hidden', '');
  });

  // Enlaces de contacto
  $$('[data-cms-href]').forEach((a) => { if (c[a.dataset.cmsHref]) a.href = c[a.dataset.cmsHref]; });
  $$('[data-cms-wa]').forEach((a) => { const n = c[a.dataset.cmsWa]; if (n) a.href = 'https://wa.me/' + n.replace(/\D/g, ''); });
  $$('[data-cms-mail]').forEach((a) => { const m = c[a.dataset.cmsMail]; if (m) a.href = 'mailto:' + m; });
  $$('[data-cms-hide-empty]').forEach((el) => { if (!c[el.dataset.cmsHideEmpty]) el.hidden = true; });
})();
