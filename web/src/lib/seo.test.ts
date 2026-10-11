import { describe, expect, it } from 'vitest'
import { SITIO, textoRobots } from './seo'

describe('robots.txt', () => {
  it('en producción deja leer todo y apunta al sitemap del dominio oficial', () => {
    const texto = textoRobots('production')
    expect(texto).toContain('Allow: /')
    expect(texto).not.toContain('Disallow')
    expect(texto).toContain('Sitemap: https://rounda.net/sitemap.xml')
  })
  it('las vistas previas, lo local y lo desconocido no se indexan', () => {
    for (const entorno of ['preview', 'development', undefined, '', 'Production']) {
      expect(textoRobots(entorno)).toBe('User-agent: *\nDisallow: /\n')
    }
  })
  it('el dominio es rounda.net, sin barra al final', () => {
    expect(SITIO).toBe('https://rounda.net')
  })
})
