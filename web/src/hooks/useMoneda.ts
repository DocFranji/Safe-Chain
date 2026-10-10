// La moneda de la tanda que se está viendo (o creando): TUSD (rendimiento simulado) o USDC de Blend
// (rendimiento real). La página de la tanda y "Crear" la ponen en el contexto; los componentes la leen
// con `useSimbolo()` en vez de suponer que todo es TUSD. (Misión M4, docs/blend.md §6.)
import { createContext, useContext, useEffect, useState } from 'react'
import { TUSD, type Moneda } from '../lib/monedas'
import { leerUsdc } from '../lib/usdc'

export const MonedaContexto = createContext<Moneda>(TUSD)

export function useMoneda(): Moneda {
  return useContext(MonedaContexto)
}

/** Símbolo de la moneda de esta tanda ("TUSD" o "USDC"). */
export function useSimbolo(): string {
  return useContext(MonedaContexto).simbolo
}

const INTERVALO_MS = 10_000

/**
 * El saldo de la persona en la moneda de la tanda. TUSD ya lo lee `useCuenta` (se recibe hecho);
 * USDC se lee aquí, de Horizon. null mientras no se sabe.
 */
export function useSaldoEn(moneda: Moneda, direccion: string | null, saldoTusd: bigint | null): bigint | null {
  const [usdc, setUsdc] = useState<{ direccion: string; saldo: bigint } | null>(null)
  const esTusd = moneda.token === TUSD.token

  useEffect(() => {
    if (esTusd || !direccion) return
    let activo = true
    async function leer() {
      if (!direccion) return
      try {
        const c = await leerUsdc(direccion)
        if (activo) setUsdc({ direccion, saldo: c.saldo })
      } catch {
        // Se reintenta en la próxima vuelta.
      }
    }
    const primera = setTimeout(leer, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void leer()
    }, INTERVALO_MS)
    return () => {
      activo = false
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [esTusd, direccion])

  if (esTusd) return saldoTusd
  return usdc !== null && usdc.direccion === direccion ? usdc.saldo : null
}

/** Cómo conseguir más de esta moneda (el botón de la barra de la cuenta). */
export function comoConseguir(moneda: Moneda): string {
  return moneda.real ? 'Usa el botón "Recibir USDC de prueba" de arriba' : 'Usa el botón "Recibir más dólares de práctica" de arriba'
}
