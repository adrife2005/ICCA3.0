# ICCA — Landing + CMS

Página de la artista con estilo **oscuro y cinematográfico** (basado en el diseño original): intro tipo cine, la obra de fondo moviéndose lento, títulos gruesos con el rojo que brilla, tarjetas 3D con brillo, franjas rojas cruzadas y marcos de vidrio. Las obras siempre se ven completas y hay un visor a pantalla completa para verlas de cerca. Todo se edita desde un dashboard privado.

Los colores están al inicio de `public/css/site.css` (`--rojo`, `--borgona`, `--vino`, `--negro`…): cambiando esas líneas cambia toda la página. No usa librerías externas (ni GSAP ni vanilla-tilt): las animaciones están hechas con CSS y JavaScript normal, así carga más rápido y es más seguro.

## Arrancar

```bash
npm install            # solo instala "sharp" (procesa las imágenes)
cp .env.example .env   # y cambia ADMIN_PASSWORD
npm start
```

- Sitio: http://localhost:3000
- Galería (lienzo libre para mover las obras): http://localhost:3000/galeria.html
- Dashboard: http://localhost:3000/admin

Requiere **Node 22.13 o superior** (usa el SQLite que ya trae Node).
La primera vez se crean obras de ejemplo para que veas cómo se acomodan. Bórralas desde el dashboard cuando subas las de verdad.

Crear o cambiar un usuario: `npm run create-user -- usuario contraseña`

## Qué tiene la página

| Sección | Qué hace |
|---|---|
| Intro | "ICCA" aparece y se abre como telón. Solo la primera vez por visita; se salta con un clic y se puede apagar en General. |
| Portada | Etiqueta, título de 3 líneas (la de en medio en rojo brillante), tarjeta 3D que se inclina con el mouse y luz roja que lo sigue. |
| Obras destacadas | Las obras marcadas como "Destacada" en el dashboard, cada una en grande con su texto. |
| Franjas | Dos franjas cruzadas (roja y oscura) con texto que se desliza. |
| Colección | Mosaico con todas las obras respetando su forma (verticales, horizontales, cuadradas). Filtros por técnica. En el inicio salen 12 y un botón lleva a la colección completa. |
| Secretos y conceptos | Textos cortos sobre el proceso. |
| Lienzo oculto | Rasca y descubre: al descubrir la mitad se revela sola. |
| Contacto | Instagram, WhatsApp, correo y formulario. Los mensajes llegan al **dashboard** (apartado Mensajes). |

**Visor de obras:** flechas o deslizar para cambiar, tocar para hacer zoom y arrastrar, tecla `i` para la información, `Esc` para cerrar, audioguía con la voz del navegador, y cada obra tiene su link propio (`/#obra-12`) para compartirla. El botón "atrás" del celular cierra el visor.

## Galería (lienzo libre)

El diseño original: las obras aparecen esparcidas en marcos dorados y **se pueden arrastrar** con el mouse o el dedo. Botones **Esparcir** (las revuelve otra vez) y **Ordenar en grilla**, filtro por técnica y contador de **obras exploradas** (se recuerda en el navegador). Al tocar una obra se abre el modal con **lupa**, audioguía, pestañas (contexto, técnica, simbolismo, secretos), anterior/siguiente y botón de **pantalla completa**. Cada obra tiene su link (`/galeria.html#obra-12`).

## Dashboard

- **Mensajes:** todo lo que la gente manda desde el formulario de contacto. Lista con los no leídos marcados en rojo, filtro "Sin leer", buscador, y al tocar uno se abre un modal con nombre, correo, fecha, asunto y mensaje completo, con botones para **responder por correo**, copiar el correo, marcar como no leído o eliminar. El número de mensajes sin leer sale en el menú y en la pestaña del navegador, y se revisa solo cada minuto.

- **Obras:** subir una o **varias a la vez** (se crean ocultas con el nombre del archivo como título), marcar **Visible** y **Destacada** desde la tarjeta, ordenar, editar textos (contexto, técnica, simbolismo, secretos, audioguía, medidas).
- **Marca de agua:** encender/apagar, texto, o subir su firma en PNG. Al guardar, el servidor regenera todas las imágenes en segundo plano y el dashboard muestra el avance.
- Todo lo demás (textos, portada, contacto…) en sus secciones.

## Base de datos e imágenes

- **SQLite** → un archivo (`data/icca.db`). Guarda textos, obras, los datos de cada imagen y los **mensajes de contacto**.
- **Las imágenes no van dentro de la base**, van como archivos:
  - `data/originals/` → el original que subió la artista. **Privado, nunca se sirve en la web.** Sirve para regenerar las imágenes si cambia la marca de agua.
  - `uploads/` → versiones públicas en WebP: 480 / 960 / 1400 / 2000 px. El navegador baja la que le toca (el cel no baja la grande).
- Cada imagen guarda una miniatura borrosa de ~300 bytes que se ve mientras carga la real.
- Las imágenes que ya nadie usa se borran solas.

**Si el proyecto crece:** PostgreSQL (Supabase/Neon) + almacenamiento de objetos (Cloudflare R2) con CDN. Solo cambian `server/db.js` y `server/images.js`.

## Seguridad de las imágenes

| Medida | Qué evita |
|---|---|
| Marca de agua en todas las versiones públicas | Que alguien use la obra como suya. Es lo único que sobrevive a una captura de pantalla. |
| Máximo 2000 px públicos, original privado | Que alguien imprima la obra en grande con buena calidad. |
| Se borran los metadatos (GPS, cámara, fecha) | Que se sepa dónde vive o trabaja la artista por las fotos del cel. |
| Anti-hotlinking (`Sec-Fetch-Site`, `Referer`, `Cross-Origin-Resource-Policy`) | Que otra página muestre sus obras usando su servidor. Las vistas previas de WhatsApp sí funcionan. |
| Sin clic derecho / arrastrar / "mantener presionado" en las obras | Que se guarden con dos clics. Es solo un freno: no evita capturas. |
| Nombres de archivo aleatorios | Que alguien adivine y descargue imágenes ocultas o borradas. |
| Se valida que el archivo sea una imagen real (máx. 25 MB, máx. 120 megapíxeles) | Archivos disfrazados o imágenes gigantes que tumben el servidor. |

## Seguridad del sitio y del dashboard

- Contraseñas con **scrypt** + sal. Sesión en cookie **HttpOnly + SameSite=Strict** (+ Secure en HTTPS), 7 días. Cambiar la contraseña cierra las demás sesiones.
- **Límite de intentos** de login: 8 fallidos / 15 min por IP.
- Protección **CSRF** (cabecera propia + revisión de origen).
- Todo el contenido se pone con `textContent`: aunque alguien escriba código en un título, no se ejecuta. Los enlaces solo aceptan `http`/`https`.
- **CSP estricta**: solo se ejecutan scripts, estilos y fuentes de este mismo servidor. Sin CDNs ni Tailwind por CDN, sin Google Fonts (Montserrat va incluida, licencia OFL en `public/fonts/`).
- Cabeceras: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, COOP.
- **Formulario de contacto propio** (ya no depende de FormSubmit: los datos de la gente no pasan por terceros):
  - Campo trampa invisible y detección de envíos hechos en menos de 3 segundos (bots).
  - Máximo 5 mensajes cada 30 min por persona y 300 al día en total.
  - El servidor revisa nombre, correo y largo de cada campo, y quita caracteres raros.
  - Solo se puede mandar desde la propia página (protección CSRF) y los mensajes solo se leen con sesión iniciada.

## Hosting

Necesita Node con **disco persistente** (para `data/` y `uploads/`): Railway, Render (con disk), Fly.io (volume) o un VPS. GitHub Pages no sirve (no ejecuta backend).

En producción: `NODE_ENV=production`, HTTPS, `SITE_URL=https://tu-dominio.com` y, si hay proxy delante, `TRUST_PROXY=1`.

**Respaldos:** copia periódicamente `data/` (incluye los originales) y `uploads/`. Nunca subas `data/` ni `.env` a GitHub (ya están en `.gitignore`).

## Estructura

```
server/   index.js (API, estáticos, cabeceras) · db.js (base + migraciones) · images.js (WebP, marca de agua)
          auth.js · schema.js (qué es editable) · wm-glyphs.json (letras de la marca de agua) · seed/ (obras de ejemplo)
public/   index.html · galeria.html · css/site.css · js/ (cms.js, viewer.js, home.js) · fonts/
public/admin/  dashboard (HTML + CSS + JS sin build)
data/     icca.db · originals/ (privado) · .secret        uploads/  imágenes públicas
```

**Agregar un campo editable:** 1) agrégalo en `server/schema.js`, 2) ponle `data-cms="clave"` (texto) o `data-cms-img="clave"` (imagen) en el HTML. El dashboard lo muestra solo.
# ICCA3.0
