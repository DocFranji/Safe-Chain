// Lecturas del historial crediticio para los componentes (misión M2).
// Cada dirección se lee como mucho una vez cada 30 s, aunque la pidan varias insignias a la vez.
import { useEffect, useState } from 'react'
import { clienteLectura, leer } from '../lib/contrato'
import { direccionHistorial, leerHistorial, leerRequisitos, type Historial } from '../lib/historial'

export type EstadoHistorial =
  | { tipo: 'cargando' }
  /** No hay contrato de historial (por ejemplo, un contrato de tanda anterior a M2). */
  | { tipo: 'sin-contrato' }
  | { tipo: 'listo'; historial: Historial }
  | { tipo: 'error'; texto: string }

const VIGENCIA_MS = 30_000
const cache = new Map<string, { cuando: number; promesa: Promise<Historial | null> }>()

function historialCacheado(dir: string, forzar = false): Promise<Historial | null> {
  const guardado = cache.get(dir)
  if (!forzar && guardado && Date.now() - guardado.cuando < VIGENCIA_MS) return guardado.promesa
  const promesa = leerHistorial(dir).catch((e) => {
    cache.delete(dir)
    throw e
  })
  cache.set(dir, { cuando: Date.now(), promesa })
  return promesa
}

export function useHistorial(dir: string | null): EstadoHistorial {
  const [estado, setEstado] = useState<EstadoHistorial>({ tipo: 'cargando' })
  useEffect(() => {
    if (!dir) return
    let vivo = true
    historialCacheado(dir, true)
      .then((h) => vivo && setEstado(h ? { tipo: 'listo', historial: h } : { tipo: 'sin-contrato' }))
      .catch(() => vivo && setEstado({ tipo: 'error', texto: 'No pudimos leer el historial. Revisa tu conexión e intenta de nuevo.' }))
    return () => {
      vivo = false
    }
  }, [dir])
  return estado
}

/** Versión liviana para insignias: no muestra errores (si falla, no hay insignia). */
export function useHistorialCacheado(dir: string): Historial | null {
  const [h, setH] = useState<Historial | null>(null)
  useEffect(() => {
    let vivo = true
    if (!dir) return
    historialCacheado(dir)
      .then((x) => vivo && setH(x))
      .catch(() => vivo && setH(null))
    return () => {
      vivo = false
    }
  }, [dir])
  return h
}

export type GarantiaConHistorial = {
  /** Requisitos de la tanda (puntaje mínimo y si da descuento). */
  requisitos: { puntaje_minimo: number; descuento: boolean }
  /** Garantía que dejaría `yo` al unirse ahora, ya con descuento (null si no se pudo calcular). */
  garantia: bigint | null
}

/**
 * Requisitos de la tanda y garantía con descuento para quien está conectado. Se recalcula cuando cambia
 * la garantía normal (alguien más se unió).
 */
export function useGarantiaConHistorial(id: number, yo: string | null, normal: bigint | null): GarantiaConHistorial {
  const [r, setR] = useState<GarantiaConHistorial & { para: bigint | null }>({
    requisitos: { puntaje_minimo: 0, descuento: false },
    garantia: null,
    para: null,
  })
  useEffect(() => {
    let vivo = true
    void (async () => {
      const requisitos = await leerRequisitos(id)
      let garantia: bigint | null = null
      if (yo && normal !== null && requisitos.descuento) {
        garantia = await clienteLectura()
          .colateral_para_miembro({ id, miembro: yo })
          .then(leer)
          .catch(() => null)
      }
      if (vivo) setR({ requisitos, garantia, para: normal })
    })()
    return () => {
      vivo = false
    }
  }, [id, yo, normal])
  // Si alguien más se unió y todavía no se recalculó, no se usa la garantía vieja.
  return { requisitos: r.requisitos, garantia: r.para === normal ? r.garantia : null }
}

/** Dirección del contrato de historial (null mientras se lee o si no hay). */
export function useDireccionHistorial(): string | null {
  const [dir, setDir] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    direccionHistorial()
      .then((d) => vivo && setDir(d))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])
  return dir
}
