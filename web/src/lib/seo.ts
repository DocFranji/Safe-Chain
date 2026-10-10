// Lo que leen los buscadores (docs/seo.md). La portada es la única página que se indexa: las rutas #/… no las
// guardan los buscadores. Los metadatos van fijos en index.html; robots.txt se arma al compilar (vite.config.ts).

/** El dominio oficial. Toda URL absoluta (canonical, sitemap, Open Graph, JSON-LD) usa este. */
export const SITIO = 'https://rounda.net'

/**
 * robots.txt según el entorno de Vercel (`VERCEL_ENV`): solo producción se deja leer y anuncia el sitemap. Las vistas
 * previas, las compilaciones locales y cualquier entorno desconocido quedan fuera, para que los buscadores no guarden
 * copias de prueba. Vercel además manda `X-Robots-Tag: noindex` en las vistas previas.
 */
export function textoRobots(entorno: string | undefined): string {
  if (entorno === 'production') return `User-agent: *\nAllow: /\n\nSitemap: ${SITIO}/sitemap.xml\n`
  return 'User-agent: *\nDisallow: /\n'
}
