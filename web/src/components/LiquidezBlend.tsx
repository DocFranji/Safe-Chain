// Indicador de la liquidez libre de Blend (DECIDIDO por @DocFranji: "A + indicador", docs/blend.md §2.1).
// Si Blend está muy prestado, cerrar una ronda con impagos o finalizar pueden fallar un rato (sin perder
// dinero): esto lo deja a la vista antes de que pase.
import { useEffect, useState } from 'react'
import { alcanzaLiquidez, leerLiquidezBlend, textoLiquidez, type LiquidezBlend as Liquidez } from '../lib/blend'

const INTERVALO_MS = 30_000

export function LiquidezBlend({
  pool,
  token,
  simbolo,
  necesario,
}: {
  pool: string
  token: string
  simbolo: string
  /** Lo que la tanda tendría que sacar de Blend (su garantía): si no alcanza, se avisa. */
  necesario?: bigint
}) {
  const [liquidez, setLiquidez] = useState<Liquidez | null>(null)

  useEffect(() => {
    let activo = true
    async function leer() {
      try {
        const l = await leerLiquidezBlend(pool, token)
        if (activo) setLiquidez(l)
      } catch {
        // Sin dato no mostramos nada: es solo un indicador.
      }
    }
    const primera = setTimeout(leer, 0)
    const t = setInterval(leer, INTERVALO_MS)
    return () => {
      activo = false
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [pool, token])

  if (!liquidez) return null
  const falta = necesario !== undefined && necesario > 0n && !alcanzaLiquidez(liquidez, necesario)
  return (
    <p className={`explica liquidez-blend${falta ? ' alerta' : ''}`} role="status">
      {textoLiquidez(liquidez, simbolo)}
      {falta &&
        ' Ahora mismo no alcanzaría para devolver toda la garantía de esta tanda: si al cerrar una ronda o al final Blend no tiene liquidez, la operación no se hace y se puede reintentar después. Tu dinero está seguro.'}
    </p>
  )
}
