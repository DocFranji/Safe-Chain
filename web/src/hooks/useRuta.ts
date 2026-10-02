// Devuelve la ruta actual y se actualiza cuando cambia el # de la URL.
import { useEffect, useState } from 'react'
import { parsearRuta, type Ruta } from '../lib/rutas'

export function useRuta(): Ruta {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const alCambiar = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  return parsearRuta(hash)
}
