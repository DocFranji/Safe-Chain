// Estado de la cuenta conectada: ¿existe?, ¿aceptó TUSD?, ¿cuánto TUSD tiene?
// Se vuelve a leer cada pocos segundos para que el saldo se actualice solo tras pagar o recibir.
import { useCallback, useEffect, useState } from 'react'
import { leerCuenta, type EstadoCuenta } from '../lib/cuenta'
import { saldoToken } from '../lib/rpc'

const INTERVALO_MS = 10_000

export type Cuenta = {
  /** null mientras se lee por primera vez. */
  estado: EstadoCuenta | null
  /** Saldo de TUSD en unidades de 7 decimales; null si todavía no se sabe. */
  saldo: bigint | null
  error: boolean
  recargar: () => Promise<void>
}

type Lectura = { direccion: string; estado: EstadoCuenta; saldo: bigint }

export function useCuenta(direccion: string | null, activa: boolean): Cuenta {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [error, setError] = useState(false)

  const recargar = useCallback(async () => {
    if (!direccion || !activa) return
    try {
      const estado = await leerCuenta(direccion)
      // Una cuenta nueva (sin activar o sin aceptar TUSD) no tiene saldo. Además, pedirle el saldo al token
      // en ese caso da error (Error(Contract, #13): falta la trustline), y la barra no podía guiar a la persona.
      const saldo = estado.existe && estado.trustline ? await saldoToken(direccion) : 0n
      setLectura({ direccion, estado, saldo })
      setError(false)
    } catch {
      setError(true)
    }
  }, [direccion, activa])

  useEffect(() => {
    const primera = setTimeout(recargar, 0)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar()
    }, INTERVALO_MS)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [recargar])

  // Si cambian de cuenta en Freighter, no mostramos los datos de la anterior.
  const vigente = lectura !== null && lectura.direccion === direccion ? lectura : null
  return { estado: vigente?.estado ?? null, saldo: vigente?.saldo ?? null, error, recargar }
}
