// Lógica de la landing y de la página de colección.
// Sin librerías externas: todo es JavaScript normal (más rápido y más seguro).
(function () {
  const $ = (id) => document.getElementById(id);
  const data = window.__CMS__ || { content: {}, artworks: [] };
  const c = data.content;
  const ARTS = data.artworks || [];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const notice = () => window.ICCA_toast && window.ICCA_toast(c.protect_notice || 'Obra protegida por derechos de autor.');

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const meta = (a) => [a.year, a.category].filter(Boolean).join(' · ');

  // ==========================================================
  // 1. INTRO TIPO CINE (solo la primera vez en la sesión)
  // ==========================================================
  const intro = $('intro');
  function start() { document.body.classList.add('is-ready'); }
  let seen = false;
  try { seen = sessionStorage.getItem('icca_intro') === '1'; } catch {}
  if (intro && c.intro_on !== false && !seen && !reduceMotion && !location.hash) {
    intro.hidden = false;
    document.documentElement.classList.add('intro-open');
    const end = () => {
      if (intro.classList.contains('out')) return;
      intro.classList.add('out');
      document.documentElement.classList.remove('intro-open');
      start();
      setTimeout(() => { intro.hidden = true; }, 900);
      try { sessionStorage.setItem('icca_intro', '1'); } catch {}
    };
    intro.addEventListener('click', end);
    setTimeout(end, 2300);
  } else {
    start();
  }

  // ==========================================================
  // 2. BARRA DE NAVEGACIÓN
  // ==========================================================
  const topbar = $('topbar'), menuBtn = $('menuBtn'), menu = $('menu'), progress = $('progress');
  const onScroll = () => {
    topbar?.classList.toggle('is-scrolled', scrollY > 30);
    // el fondo se oscurece poco a poco al bajar (para que las obras resalten)
    document.documentElement.style.setProperty('--dim', Math.min(1, scrollY / (innerHeight * 0.9)).toFixed(3));
    // barra roja de progreso: qué tanto de la página llevas
    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  });
  menu?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { menuBtn.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); }
  });

  // El link del menú se marca solo según la sección que estás viendo
  const links = [...document.querySelectorAll('.menu a[href^="#"]')];
  if (links.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((l) => { const s = document.querySelector(l.getAttribute('href')); if (s) io.observe(s); });
  }

  // Letras del logo: se encienden en rojo al pasar el mouse (como en tu diseño original)
  document.querySelectorAll('.brand').forEach((b) => {
    const text = b.textContent.trim();
    b.textContent = '';
    b.setAttribute('aria-label', text);
    [...text].forEach((ch) => {
      const s = el('span', 'letter', ch === ' ' ? ' ' : ch);
      s.setAttribute('aria-hidden', 'true');
      s.addEventListener('mouseenter', () => {
        s.classList.add('lit');
        clearTimeout(s._t);
        s._t = setTimeout(() => s.classList.remove('lit'), 2500);
      });
      b.append(s);
    });
  });

  // ==========================================================
  // 3. APARECER AL HACER SCROLL (desenfoque → nítido)
  // ==========================================================
  const revealIO = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    : null;
  function reveal(root) {
    (root || document).querySelectorAll('.reveal-up:not(.in)').forEach((n, i) => {
      if (!revealIO) { n.classList.add('in'); return; }
      n.style.transitionDelay = `${Math.min(i % 4, 3) * 90}ms`; // efecto cascada
      revealIO.observe(n);
    });
  }

  // ==========================================================
  // 4. TARJETAS 3D (se inclinan siguiendo el mouse, con reflejo)
  // ==========================================================
  function tilt(card, max) {
    if (!finePointer || reduceMotion || !card) return;
    const glare = card.querySelector('.glare');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(1100px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) scale(1.02)`;
      if (glare) { glare.style.opacity = '1'; glare.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,.22), transparent 55%)`; }
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
      if (glare) glare.style.opacity = '0';
    });
  }
  tilt($('heroCard'), 16);

  // Luz roja que sigue al mouse en la portada
  const hero = document.querySelector('.hero');
  if (hero && finePointer && !reduceMotion) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', `${e.clientX - r.left}px`);
      hero.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  // Borde que se ilumina donde está el mouse (tarjetas de vidrio)
  function spotlight(node) {
    if (!finePointer) return;
    node.addEventListener('pointermove', (e) => {
      const r = node.getBoundingClientRect();
      node.style.setProperty('--mx', `${e.clientX - r.left}px`);
      node.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
  document.querySelectorAll('.note, .contact-form, .channel').forEach(spotlight);

  // ==========================================================
  // 5. UNA OBRA (marco de vidrio + título)
  // ==========================================================
  function workFigure(a, list, sizes) {
    const fig = el('figure', 'work reveal-up');
    const btn = el('button', 'work-frame');
    btn.type = 'button';
    btn.dataset.artId = a.id;
    btn.setAttribute('aria-label', `Ver “${a.title}” en pantalla completa`);
    const img = el('img');
    img.loading = 'lazy';
    img.draggable = false;
    img.dataset.sizes = sizes;
    window.ICCA_applyImg(img, a.image, a.title);
    const hover = el('span', 'work-hover');
    hover.append(el('span', 'work-hover-text', 'Ver obra'));
    btn.append(img, hover);
    btn.addEventListener('click', () => window.ICCA_Viewer.open(list(), list().indexOf(a)));
    spotlight(btn);
    const cap = el('figcaption', 'work-caption');
    cap.append(el('span', 'work-title', a.title));
    if (meta(a)) cap.append(el('span', 'work-meta', meta(a)));
    fig.append(btn, cap);
    return fig;
  }

  // ==========================================================
  // 6. OBRAS DESTACADAS (grandes, con brillo rojo)
  // ==========================================================
  const featuredList = $('featuredList');
  if (featuredList) {
    const feats = ARTS.filter((a) => a.featured);
    if (feats.length) {
      featuredList.closest('section').hidden = false;
      feats.forEach((a, i) => {
        const row = el('article', 'feature reveal-up' + (i % 2 ? ' alt' : ''));
        const media = el('div', 'feature-media');
        const card = el('div', 'art-card');
        card.append(el('div', 'art-glow'));
        const frame = el('button', 'art-frame');
        frame.type = 'button';
        frame.dataset.artId = a.id;
        frame.setAttribute('aria-label', `Ver “${a.title}” en pantalla completa`);
        const img = el('img');
        img.loading = 'lazy'; img.draggable = false;
        img.dataset.sizes = '(max-width: 900px) 90vw, 58vw';
        window.ICCA_applyImg(img, a.image, a.title);
        frame.append(img, el('span', 'glare'));
        frame.addEventListener('click', () => window.ICCA_Viewer.open(feats, i));
        card.append(frame);
        media.append(card);
        tilt(card, 6);

        const text = el('div', 'feature-text');
        if (a.category) text.append(el('span', 'tag', a.category));
        text.append(el('h3', null, a.title));
        const m = [c.artist_name, a.year, a.dimensions].filter(Boolean).join(' · ');
        if (m) text.append(el('p', 'feature-meta', m));
        if (a.context) text.append(el('p', 'feature-excerpt', a.context.length > 260 ? a.context.slice(0, 250).trim() + '…' : a.context));
        const more = el('button', 'btn-ghost', 'Ver de cerca y leer su historia');
        more.type = 'button';
        more.addEventListener('click', () => window.ICCA_Viewer.open(feats, i));
        text.append(more);
        row.append(media, text);
        featuredList.append(row);
      });
    }
  }

  // ==========================================================
  // 7. COLECCIÓN (mosaico que respeta la forma de cada obra)
  // ==========================================================
  const masonry = $('masonry');
  if (masonry) {
    const limit = Number(masonry.dataset.limit) || Infinity;
    const filters = $('filters');
    let active = 'all';
    const filtered = () => ARTS.filter((a) => active === 'all' || a.category === active);
    const visible = () => filtered().slice(0, limit);

    const cats = [...new Set(ARTS.map((a) => a.category).filter(Boolean))];
    if (cats.length > 1 && filters) {
      filters.hidden = false;
      const mk = (val, label) => {
        const b = el('button', 'chip', label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(val === active));
        b.addEventListener('click', () => {
          active = val;
          filters.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          render(true);
        });
        filters.append(b);
      };
      mk('all', 'Todas');
      cats.forEach((k) => mk(k, k));
    }

    const colCount = () => {
      const w = masonry.clientWidth;
      return w >= 1300 ? 4 : w >= 900 ? 3 : w >= 540 ? 2 : 1;
    };
    let lastCols = 0;

    function render(instant) {
      const items = visible();
      const n = colCount();
      lastCols = n;
      masonry.textContent = '';
      masonry.style.setProperty('--cols', n);
      if (!items.length) {
        masonry.append(el('p', 'empty', 'Muy pronto habrá obras aquí.'));
      } else {
        // Cada obra va a la columna más corta, en orden de lectura (izquierda a derecha)
        const cols = Array.from({ length: n }, () => el('div', 'masonry-col'));
        const heights = new Array(n).fill(0);
        const sizes = `(max-width: 540px) 90vw, ${Math.round(94 / n)}vw`;
        for (const a of items) {
          const k = heights.indexOf(Math.min(...heights));
          const fig = workFigure(a, visible, sizes);
          if (instant) fig.classList.add('in');
          cols[k].append(fig);
          heights[k] += a.image.h / a.image.w + 0.2;
        }
        masonry.append(...cols);
        reveal(masonry);
      }
      const total = filtered().length;
      const more = $('collectionMore');
      if (more) {
        // el botón siempre se ve; si hay más obras de las que caben aquí, dice cuántas son
        $('collectionMoreLink').textContent = total > items.length
          ? `Ver las ${total} obras en la galería interactiva ✦`
          : 'Abrir la galería interactiva ✦';
      }
      const count = $('count');
      if (count) count.textContent = total === 1 ? '1 obra' : `${total} obras`;
    }
    render();
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (colCount() !== lastCols) render(true); }, 150); });
  }

  // ==========================================================
  // 8. PORTADA: tocar la obra la abre en grande
  // ==========================================================
  $('heroOpen')?.addEventListener('click', () => {
    if (!c.hero_image) return;
    const match = ARTS.findIndex((a) => a.image.id === c.hero_image.id);
    if (match >= 0) return window.ICCA_Viewer.open(ARTS, match);
    window.ICCA_Viewer.open([{ id: 'portada', title: c.hero_caption_title || '', image: c.hero_image, audioText: '' }], 0);
  });

  // Si el enlace trae una obra (#obra-12), se abre directo
  if (window.ICCA_Viewer && !document.body.classList.contains('page-gallery')) window.ICCA_Viewer.openFromHash(ARTS);

  // ==========================================================
  // 9. LIENZO OCULTO (rasca y descubre)
  // ==========================================================
  const scratch = $('scratch'), canvas = $('scratchCanvas');
  if (scratch && canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let revealed = false, last = null, strokes = 0;
    const brush = () => Math.max(44, scratch.clientWidth * 0.09);

    function cover() {
      if (revealed) return;
      const r = scratch.getBoundingClientRect();
      canvas.width = Math.round(r.width); canvas.height = Math.round(r.height);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, '#1c070b'); g.addColorStop(1, '#0b0304');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // textura de pinceladas
      ctx.strokeStyle = 'rgba(139,0,0,0.12)'; ctx.lineWidth = 2;
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + Math.random() * 80, y - 20 - Math.random() * 40); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200, 30, 45, 0.85)';
      ctx.font = `800 ${Math.max(14, canvas.width / 30)}px Montserrat, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('✦  DESLIZA AQUÍ  ✦', canvas.width / 2, canvas.height / 2);
    }

    function point(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function erase(p) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000'; // color sólido = borra al 100 %
      ctx.lineWidth = brush(); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo((last || p).x, (last || p).y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
      if (++strokes % 25 === 0) checkProgress();
    }
    // Revisa qué tanto se ha descubierto (muestreando pocos puntos para no trabar el navegador)
    function checkProgress() {
      const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let clear = 0, total = 0;
      for (let i = 3; i < px.length; i += 4 * 97) { total++; if (px[i] === 0) clear++; }
      if (clear / total > 0.5) revealAll();
    }
    function revealAll() {
      if (revealed) return;
      revealed = true;
      canvas.classList.add('gone');
      scratch.classList.add('is-revealed');
      $('revealAll').hidden = true;
    }

    canvas.addEventListener('pointerenter', (e) => { last = point(e); });
    canvas.addEventListener('pointerdown', (e) => { last = point(e); erase(last); });
    canvas.addEventListener('pointermove', (e) => {
      // con mouse basta pasar el cursor; con el dedo hay que arrastrar
      if (e.pointerType === 'mouse' || e.buttons) erase(point(e));
    });
    canvas.addEventListener('pointerleave', () => { last = null; });
    $('revealAll')?.addEventListener('click', revealAll);
    scratch.addEventListener('click', () => {
      if (!revealed || !c.exp_image) return;
      window.ICCA_Viewer.open([{ id: 'lienzo', title: c.exp_title || '', category: c.exp_technique, dimensions: c.exp_dimensions, image: c.exp_image, audioText: '' }], 0);
    });

    const img = scratch.querySelector('img');
    if (img.complete) cover(); else img.addEventListener('load', cover, { once: true });
    cover();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(cover, 200); });
    if (document.fonts) document.fonts.ready.then(cover);
  }

  // ==========================================================
  // 10. CONTACTO
  // ==========================================================
  const wa = $('waText');
  if (wa && !wa.textContent.trim() && c.whatsapp_number) wa.textContent = '+' + c.whatsapp_number;
  // El formulario manda el mensaje a nuestro servidor; aparece en el dashboard de la artista
  const form = $('contactForm');
  if (form) {
    const shownAt = Date.now(); // los bots llenan el formulario en milisegundos
    const btn = $('submitBtn'), err = $('formError'), done = $('formDone');
    const showError = (msg) => { err.textContent = msg; err.hidden = false; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      // Revisión rápida antes de mandar (el servidor vuelve a revisar todo)
      const f = form.elements;
      if (!f.name.value.trim()) return showError('Escribe tu nombre.'), f.name.focus();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return showError('Escribe un correo válido.'), f.email.focus();
      if (f.message.value.trim().length < 2) return showError('Escribe tu mensaje.'), f.message.focus();

      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        const r = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' },
          body: JSON.stringify({
            name: f.name.value, email: f.email.value, subject: f.subject.value, message: f.message.value,
            website: f.website.value, elapsed: Date.now() - shownAt,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se pudo enviar. Intenta de nuevo.');
        form.reset();
        form.classList.add('is-sent');
        done.hidden = false;
      } catch (ex) {
        showError(ex.message === 'Failed to fetch' ? 'Sin conexión. Revisa tu internet e intenta de nuevo.' : ex.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Enviar mensaje ✦';
      }
    });
    $('formAgain')?.addEventListener('click', () => { form.classList.remove('is-sent'); done.hidden = true; form.elements.name.focus(); });
  }

  if (reduceMotion) document.querySelectorAll('.marquee-track').forEach((t) => t.classList.add('still'));
  reveal(document);

  // ==========================================================
  // 11. PROTECCIÓN DE IMÁGENES
  // ==========================================================
  // No impide una captura de pantalla (nada lo hace), pero evita "Guardar imagen como..." y arrastrar.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('img, .work-frame, .art-frame, .viewer-stage, .scratch, .g-frame, .g-modal-media')) { e.preventDefault(); notice(); }
  });
  document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });
})();
