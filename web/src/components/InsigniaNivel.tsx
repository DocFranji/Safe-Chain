// Insignia con el nivel del historial crediticio de una dirección (misión M2). Lleva a su historial.
// Si no hay contrato de historial o la lectura falla, no muestra nada.
import { useHistorialCacheado } from '../hooks/useHistorial'
import { nivelDePuntaje, puntajeDe, type NombreNivel } from '../lib/historial'
import { rutaHistorial } from '../lib/rutas'
import './historial.css'

export function InsigniaNivel({ dir }: { dir: string }) {
  const h = useHistorialCacheado(dir)
  if (!h) return null
  const puntaje = puntajeDe(h)
  return <Insignia nivel={nivelDePuntaje(puntaje)} puntaje={puntaje} href={rutaHistorial(dir)} />
}

export function Insignia({ nivel, puntaje, href }: { nivel: NombreNivel; puntaje: number; href?: string }) {
  const texto = (
    <>
      <span className="insignia-punto" aria-hidden="true" />
      {nivel}
    </>
  )
  const titulo = `Reputación ${nivel} · ${puntaje} puntos`
  return href ? (
    <a className={`insignia nivel-${nivel.toLowerCase()}`} href={href} title={titulo} aria-label={titulo}>
      {texto}
    </a>
  ) : (
    <span className={`insignia nivel-${nivel.toLowerCase()}`} title={titulo}>
      {texto}
    </span>
  )
}
