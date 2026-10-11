// ¿El contrato desplegado tiene nombres de tanda? null mientras se averigua (el campo no aparece hasta saber que sí).
import { useEffect, useState } from 'react'
import { contratoTieneNombres } from '../lib/contratoNombres'

export function useSoportaNombres(): boolean | null {
  const [soporta, setSoporta] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    void contratoTieneNombres().then((v) => {
      if (vivo) setSoporta(v)
    })
    return () => {
      vivo = false
    }
  }, [])
  return soporta
}
