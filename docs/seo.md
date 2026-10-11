# Encontrar Rounda en buscadores

El dominio oficial es **`https://rounda.net`**. Toda URL absoluta del sitio (canonical, sitemap, Open Graph y JSON-LD)
usa ese dominio, nunca `rounda-phi.vercel.app`.

## Qué hay en el código

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `robots.txt` | Se arma al compilar: `web/src/lib/seo.ts` (`textoRobots`) y el plugin `robots` de `web/vite.config.ts` | En producción (`VERCEL_ENV=production`) deja leer todo y anuncia el sitemap. En vistas previas, en compilaciones locales y en cualquier otro entorno: `Disallow: /` |
| `sitemap.xml` | `web/public/sitemap.xml` | Solo la portada. Las rutas `#/…` no las indexa ningún buscador: todo lo que va después del `#` es la misma página para ellos |
| Título y descripción | `web/index.html` | "Rounda: tandas de ahorro en Costa Rica con Stellar". La descripción tiene 160 caracteres o menos y usa las palabras que la gente busca: tanda, ahorro, Costa Rica, Stellar |
| Canonical | `web/index.html` | `https://rounda.net/`: si el sitio también se abre en otra dirección, los buscadores cuentan una sola |
| Open Graph y Twitter | `web/index.html` y `web/public/og.jpg` | La tarjeta que sale al compartir el enlace en WhatsApp, Facebook, LinkedIn o X. La imagen mide 1200×630 y pesa 83 KB |
| JSON-LD | `web/index.html` | Un `WebApplication` de schema.org: nombre, dirección, categoría de finanzas, español de Costa Rica, gratis |
| `<noscript>` | `web/index.html` | La promesa y una línea para quien no tiene JavaScript, que también es lo que ve un buscador que no lo ejecuta |

**Vistas previas:** quedan fuera por dos lados. Nuestro `robots.txt` dice `Disallow: /`, y Vercel además manda el
encabezado `X-Robots-Tag: noindex` en toda vista previa.

**Si cambia el dominio:** se cambia `SITIO` en `web/src/lib/seo.ts`, las URL de `web/index.html` y `web/public/sitemap.xml`.
Las pruebas de navegador avisan si queda alguna con `rounda-phi`.

**La imagen para redes** se armó con HTML (los colores y la letra de Órbita, las caras de `web/src/assets/fotos/caras/`)
y una captura de Playwright. Para cambiarla, basta con reemplazar `web/public/og.jpg` por otra de 1200×630.

## Cómo comprobarlo

Después de cada salida a producción:

```bash
curl -s https://rounda.net/robots.txt        # Allow: / y la línea Sitemap
curl -s https://rounda.net/sitemap.xml       # <loc>https://rounda.net/</loc>
curl -sI https://rounda-git-integracion-rounda.vercel.app/ | grep -i x-robots-tag   # noindex
curl -s https://rounda-git-integracion-rounda.vercel.app/robots.txt                 # Disallow: /
```

Si `https://rounda.net/robots.txt` dice `Disallow: /`, la compilación de producción no recibió `VERCEL_ENV`. Vercel
lo da en la compilación (Settings → Environment Variables → "Automatically expose System Environment Variables"
tiene que estar activo).

Herramientas que muestran lo que ve cada buscador o red:

- Google: [prueba de resultados enriquecidos](https://search.google.com/test/rich-results) (lee el JSON-LD) y la
  inspección de URL de Search Console.
- [Validador de schema.org](https://validator.schema.org/).
- Tarjeta al compartir: [Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/) (sirve también
  para WhatsApp) y [Post Inspector de LinkedIn](https://www.linkedin.com/post-inspector/). Si una red guardó una
  tarjeta vieja, estas herramientas la vuelven a leer.

## Lo que hace una persona

Ningún paso necesita secretos en el repo.

1. **Dominio.** Los pasos de Vercel, Cloudflare y Privy están en `agentes/PLAN-V5.md`, sección "Dominio
   `rounda.net`". Cuando `rounda.net` funcione completo, `rounda-phi.vercel.app` redirige con 308 a `rounda.net`.
2. **Google Search Console.** Crear una propiedad de tipo *Dominio* para `rounda.net`, verificarla con el registro
   `TXT` que da Google (en el DNS de Cloudflare) y, con el PR de este archivo ya en producción:
   - enviar `https://rounda.net/sitemap.xml` en "Sitemaps";
   - en "Inspección de URL", pedir que indexe `https://rounda.net/`.
3. **Bing Webmaster Tools.** Agregar el sitio importándolo desde Search Console y enviar el mismo sitemap. Bing
   también es fuente de DuckDuckGo y de otros buscadores.
4. **Enlaces hacia el sitio.** Los buscadores encuentran y confían más en un sitio cuando otros lo enlazan:
   - el campo "Website" del repositorio en GitHub (botón de engranaje junto a "About") con `https://rounda.net`;
   - el `README.md`, cuando el dominio ya funcione;
   - la página del proyecto en el hackatón (Find Your Way) y la entrega en Stellar;
   - los perfiles del equipo en redes y las publicaciones sobre el proyecto, con el enlace a `rounda.net`.

## Para después de la entrega

En orden de impacto:

1. **Rutas sin `#`** (`/tandas`, `/crear`…) con un enrutador de historial y una regla de Vercel que mande todo a
   `index.html`. Hoy los buscadores solo ven la portada. Aun así, la app no necesita indexarse; lo que conviene es lo
   siguiente.
2. **Portada prerenderizada.** La portada se dibuja con JavaScript. Google la ejecuta, pero otros buscadores y las
   vistas previas de las redes no siempre. Generar el HTML de la portada al compilar (un paso de prerender en Vite)
   hace que todos vean el texto completo.
3. **Una página de preguntas frecuentes** con su propia dirección (`/preguntas`) y un JSON-LD `FAQPage`: qué es una
   tanda, qué pasa si alguien no paga, cuánto cuesta. Son las preguntas que la gente escribe en el buscador.
4. **Rendimiento.** La portada carga rápido (LCP de unos 0,5 s y CLS 0, ver `docs/diseno.md`), pero el JavaScript
   principal pesa 543 KB. Separar en trozos lo que solo usa la app (Privy, Stellar) ayuda en celulares lentos.
5. **Ícono para el celular** (`apple-touch-icon` de 180×180 y un `manifest.webmanifest`), para cuando alguien guarda
   el sitio en la pantalla de inicio.
6. **Contenido honesto según la etapa.** La descripción dice "Pruébala con dólares de práctica" porque es testnet. Si
   algún día maneja dinero real, se cambia ahí, en el JSON-LD y en la imagen.
