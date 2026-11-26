// Define TODO lo editable del sitio. El dashboard se dibuja a partir de este archivo,
// así que para agregar un campo nuevo solo lo agregas aquí y en el HTML (data-cms="clave").
// Tipos: text | textarea | image | url | list | toggle
const SECTIONS = [
  {
    id: 'general', title: 'General', icon: '◈', link: '/',
    desc: 'Nombre, pie de página y protección de imágenes.',
    fields: [
      { key: 'site_name', label: 'Nombre / logo (barra de arriba)', type: 'text', max: 24, def: 'ICCA' },
      { key: 'artist_name', label: 'Nombre de la artista (aparece en la info de cada obra)', type: 'text', max: 80, def: 'ICCA' },
      { key: 'bg_image', label: 'Imagen del fondo animado', type: 'image', help: 'Se ve detrás de toda la página, oscurecida y moviéndose lento. Mejor una obra oscura y horizontal.' },
      { key: 'intro_on', label: 'Mostrar la intro animada al entrar (solo la primera vez)', type: 'toggle', def: true },
      { key: 'site_description', label: 'Descripción para Google y al compartir el link', type: 'textarea', max: 200, def: 'Obra de ICCA: pintura, tinta y técnica mixta. Explora la colección completa.' },
      { key: 'footer_copy', label: 'Texto de derechos', type: 'text', max: 120, def: '© 2026 ICCA. Todas las obras están protegidas por derechos de autor.' },
      { key: 'protect_notice', label: 'Aviso al intentar guardar una imagen', type: 'text', max: 120, def: 'Esta obra está protegida por derechos de autor.' },
    ],
  },
  {
    id: 'watermark', title: 'Marca de agua', icon: '◎', link: '/#coleccion',
    desc: 'Firma que se pone sobre las imágenes públicas. Al guardar, se vuelven a generar todas las imágenes (tarda unos segundos).',
    fields: [
      { key: 'wm_on', label: 'Poner marca de agua en las obras', type: 'toggle', def: true },
      { key: 'wm_text', label: 'Texto de la marca (si no subes una firma)', type: 'text', max: 40, def: '© ICCA' },
      { key: 'wm_image', label: 'Firma en PNG con fondo transparente (opcional)', type: 'image', purpose: 'watermark', help: 'Si subes tu firma, se usa en lugar del texto. Usa un PNG con fondo transparente.' },
    ],
  },
  {
    id: 'hero', title: 'Portada', icon: '✦', link: '/#inicio',
    desc: 'Lo primero que ve la gente al entrar.',
    fields: [
      { key: 'hero_tag', label: 'Etiqueta de arriba', type: 'text', max: 40, def: 'OBRA DE ARTE & ATALAYA' },
      { key: 'hero_title_1', label: 'Título — línea 1', type: 'text', max: 40, def: 'EL ARTE ES LA' },
      { key: 'hero_title_2', label: 'Título — línea 2 (la roja que brilla)', type: 'text', max: 40, def: 'SOMBRA Y LA LUZ' },
      { key: 'hero_title_3', label: 'Título — línea 3', type: 'text', max: 40, def: 'DE LA MENTE' },
      { key: 'hero_desc', label: 'Descripción', type: 'textarea', max: 300, def: 'Sumérgete en el universo místico e inmersivo de ICCA. Un recorrido visual donde cada trazo desafía lo cotidiano.' },
      { key: 'hero_button', label: 'Texto del botón', type: 'text', max: 30, def: 'Explorar galería' },
      { key: 'hero_image', label: 'Obra principal (tarjeta 3D)', type: 'image', help: 'Se muestra completa, sin recortar.' },
      { key: 'hero_caption_title', label: 'Título de la obra principal (se ve al abrirla)', type: 'text', max: 80, def: 'El aquelarre' },
    ],
  },
  {
    id: 'featured', title: 'Obras destacadas', icon: '▣', link: '/#destacadas',
    desc: 'Las obras que marques como “Destacada” en “Obras” se muestran en grande aquí.',
    fields: [
      { key: 'featured_tag', label: 'Etiqueta', type: 'text', max: 40, def: 'SELECCIÓN EXCLUSIVA' },
      { key: 'featured_title', label: 'Título de la sección', type: 'text', max: 50, def: 'OBRAS DESTACADAS' },
      { key: 'featured_desc', label: 'Texto de la sección', type: 'textarea', max: 250, def: 'Las piezas que mejor cuentan quién es ICCA. Ábrelas en grande y descubre su historia.' },
    ],
  },
  {
    id: 'collection', title: 'Colección', icon: '▦', link: '/#coleccion',
    desc: 'La cuadrícula con todas las obras visibles.',
    fields: [
      { key: 'collection_tag', label: 'Etiqueta', type: 'text', max: 40, def: 'GALERÍA COMPLETA' },
      { key: 'collection_title', label: 'Título de la sección', type: 'text', max: 50, def: 'LA COLECCIÓN' },
      { key: 'collection_desc', label: 'Texto de la sección', type: 'textarea', max: 250, def: 'Toca cualquier obra para verla en pantalla completa, acercarte a los detalles y leer su historia.' },
    ],
  },
  {
    id: 'marquee', title: 'Franja en movimiento', icon: '≋', link: '/',
    desc: 'La franja con texto que se repite entre secciones.',
    fields: [
      { key: 'marquee_text', label: 'Texto de la franja roja', type: 'text', max: 40, def: 'ARTE MODERNO' },
      { key: 'marquee_text_2', label: 'Texto de la franja oscura', type: 'text', max: 40, def: 'SOMBRA Y LUZ' },
    ],
  },
  {
    id: 'notes', title: 'Secretos y conceptos', icon: '❖', link: '/#notas',
    desc: 'Textos cortos sobre el proceso, la técnica y las ideas detrás de la obra.',
    fields: [
      { key: 'notes_tag', label: 'Etiqueta', type: 'text', max: 40, def: 'REVELACIONES DEL ARTISTA' },
      { key: 'notes_title', label: 'Título', type: 'text', max: 50, def: 'SECRETOS & CONCEPTOS' },
      { key: 'notes_desc', label: 'Descripción', type: 'textarea', max: 250, def: 'Lo que no se ve a simple vista: de dónde vienen las ideas y cómo se construye cada pieza.' },
      {
        key: 'notes_cards', label: 'Notas', type: 'list', max: 8, addLabel: 'Agregar nota',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text', max: 40 },
          { key: 'subtitle', label: 'Subtítulo', type: 'text', max: 50 },
          { key: 'text', label: 'Texto', type: 'textarea', max: 300 },
        ],
        def: [
          { title: 'FILOSOFÍA MÍSTICA', subtitle: 'Visión y espiritualidad', text: 'Explora la frontera entre la penumbra y la revelación en cada lienzo, transformando el mito en un reflejo del alma humana.' },
          { title: 'TÉCNICA & ÓLEO', subtitle: 'Proceso creativo', text: 'Capas traslúcidas de pigmento y tinta china que construyen profundidad, una sobre otra, hasta que la imagen aparece.' },
          { title: 'SÍMBOLOS OCULTOS', subtitle: 'Iconografía', text: 'Las criaturas de sus obras encarnan los instintos primitivos y la búsqueda insaciable de conocimiento.' },
          { title: 'PALETA DE PENUMBRA', subtitle: 'Color', text: 'Borgoña, carmesí oscuro y negros profundos para darle dramatismo a cada composición.' },
        ],
      },
    ],
  },
  {
    id: 'experience', title: 'Lienzo oculto', icon: '◉', link: '/#lienzo',
    desc: 'La obra que la gente descubre pasando el dedo o el cursor encima.',
    fields: [
      { key: 'exp_image', label: 'Obra oculta', type: 'image' },
      { key: 'exp_tag', label: 'Etiqueta', type: 'text', max: 40, def: 'EXPERIENCIA TÁCTIL' },
      { key: 'exp_title', label: 'Título', type: 'text', max: 50, def: 'EL LIENZO OCULTO' },
      { key: 'exp_text_1', label: 'Párrafo 1', type: 'textarea', max: 500, def: 'Cada pintura es una superposición de capas donde cada pigmento esconde algo. Esta pieza está cubierta a propósito: para verla tienes que descubrirla tú.' },
      { key: 'exp_text_2', label: 'Párrafo 2', type: 'textarea', max: 500, def: 'Pasa el cursor o el dedo sobre el lienzo para quitar el velo.' },
      { key: 'exp_technique', label: 'Técnica', type: 'text', max: 60, def: 'Óleo y pigmento volcánico' },
      { key: 'exp_dimensions', label: 'Medidas', type: 'text', max: 40, def: '120 × 160 cm' },
    ],
  },
  {
    id: 'contact', title: 'Contacto', icon: '✉', link: '/#contacto',
    desc: 'Redes, WhatsApp y a qué correo llegan los mensajes del formulario.',
    fields: [
      { key: 'contact_tag', label: 'Etiqueta', type: 'text', max: 40, def: 'CONECTA CON LA ARTISTA' },
      { key: 'contact_title', label: 'Título', type: 'text', max: 50, def: 'CONTÁCTANOS' },
      { key: 'contact_desc', label: 'Descripción', type: 'textarea', max: 250, def: '¿Te interesa una obra, un encargo o una exposición? Escríbeme y te respondo personalmente.' },
      { key: 'instagram_url', label: 'Instagram — enlace', type: 'url', max: 200, def: 'https://instagram.com' },
      { key: 'instagram_handle', label: 'Instagram — usuario', type: 'text', max: 40, def: '@icca.art' },
      { key: 'whatsapp_number', label: 'WhatsApp — número (solo dígitos con lada, ej. 5213121234567)', type: 'text', max: 20, def: '' },
      { key: 'whatsapp_display', label: 'WhatsApp — cómo se muestra', type: 'text', max: 30, def: '' },
      { key: 'contact_email', label: 'Correo (se muestra y recibe los mensajes del formulario)', type: 'text', max: 100, def: 'contacto@icca-art.com' },
    ],
  },
];

const ARTWORK_FIELDS = [
  { key: 'title', label: 'Título', type: 'text', max: 100, required: true },
  { key: 'image', label: 'Imagen de la obra', type: 'image', required: true },
  { key: 'year', label: 'Año', type: 'text', max: 30 },
  { key: 'category', label: 'Técnica / categoría (sirve para los filtros)', type: 'text', max: 60 },
  { key: 'dimensions', label: 'Medidas', type: 'text', max: 60 },
  { key: 'location', label: 'Ubicación / colección', type: 'text', max: 100 },
  { key: 'context', label: 'Contexto', type: 'textarea', max: 1200 },
  { key: 'technique', label: 'Técnica (detalle)', type: 'textarea', max: 1200 },
  { key: 'symbolism', label: 'Simbolismo', type: 'textarea', max: 1200 },
  { key: 'secrets', label: 'Secretos / curiosidades', type: 'textarea', max: 1200 },
  { key: 'audio_text', label: 'Texto de la audioguía (lo lee la voz del navegador)', type: 'textarea', max: 1500 },
];

const FIELD_INDEX = {};
for (const s of SECTIONS) for (const f of s.fields) FIELD_INDEX[f.key] = f;

// Campos que, si cambian, obligan a regenerar las imágenes públicas
const WATERMARK_KEYS = ['wm_on', 'wm_text', 'wm_image'];

module.exports = { SECTIONS, ARTWORK_FIELDS, FIELD_INDEX, WATERMARK_KEYS };
